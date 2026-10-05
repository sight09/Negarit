import crypto from "crypto";
import { readFile } from "fs/promises";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { articles, chunks, documents, ingestionJobs } from "@/db/schema";
import type { IngestionLogEntry } from "@/db/schema";
import { config } from "@/server/core/config";
import { embedBatch, embeddingsConfigured } from "@/server/embeddings/huggingface";
import { deleteDocumentPoints, upsertPoints } from "@/server/retrieval/qdrant";
import { extractPdfPages, ScannedPdfError } from "./pdf";
import { pairArticles, segmentPages } from "./segment";

/**
 * End-to-end ingestion pipeline (mirrors backend/app/ingestion/pipeline.py):
 * PDF → text extraction → language separation → article-aware chunking →
 * metadata extraction → embedding → PostgreSQL + Qdrant indexing.
 * Runs asynchronously; every stage is journalised on the ingestion job row.
 */

const STAGE_PROGRESS: Record<string, number> = {
  QUEUED: 0,
  EXTRACTING: 15,
  CHUNKING: 45,
  EMBEDDING: 70,
  INDEXING: 88,
  COMPLETED: 100,
};

async function appendLog(jobId: string, entry: IngestionLogEntry) {
  await db.execute(sql`
    UPDATE ingestion_jobs
    SET log = COALESCE(log, '[]'::jsonb) || ${JSON.stringify([entry])}::jsonb,
        updated_at = now()
    WHERE id = ${jobId}
  `);
}

async function setStage(jobId: string, stage: string, status: string, extra?: { error?: string; stats?: Record<string, unknown> }) {
  await db
    .update(ingestionJobs)
    .set({
      stage,
      status,
      progress: STAGE_PROGRESS[stage] ?? 0,
      ...(extra?.error !== undefined ? { error: extra.error } : {}),
      ...(extra?.stats ? { stats: extra.stats } : {}),
      updatedAt: new Date(),
    })
    .where(eq(ingestionJobs.id, jobId));
}

function hash(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export async function runIngestion(documentId: string, jobId: string): Promise<void> {
  const log = (stage: string, message: string, level: IngestionLogEntry["level"] = "info") =>
    appendLog(jobId, { ts: new Date().toISOString(), stage, message, level });

  try {
    const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
    if (!doc) throw new Error(`Document ${documentId} not found`);
    if (!doc.filePath) throw new Error("Document has no stored PDF file");

    // ── Stage 1: extraction ──────────────────────────────────────────────
    await setStage(jobId, "EXTRACTING", "PROCESSING");
    await log("EXTRACTING", `Reading PDF from ${doc.filePath}`);
    const buffer = await readFile(doc.filePath);
    const { pages, pageCount, warnings } = await extractPdfPages(buffer);
    for (const warning of warnings) await log("EXTRACTING", warning, "warn");
    await log("EXTRACTING", `Extracted ${pageCount} pages via TEXT_LAYER`);

    // ── Stage 2: bilingual segmentation & legal chunking ─────────────────
    await setStage(jobId, "CHUNKING", "PROCESSING");
    const segmented = segmentPages(pages);
    for (const warning of segmented.warnings) await log("CHUNKING", warning, "warn");
    if (segmented.chunks.length === 0) throw new Error("No text could be segmented from this PDF");
    await log(
      "CHUNKING",
      `Built ${segmented.chunks.length} chunks, ${segmented.articleCount} article markers, languages: ${segmented.detectedLanguages.join(", ")}`,
    );

    // Wipe previous index artefacts so re-indexing is idempotent.
    await db.delete(chunks).where(eq(chunks.documentId, documentId));
    await db.delete(articles).where(eq(articles.documentId, documentId));
    await deleteDocumentPoints(documentId);

    // Articles: pair Amharic / English versions of the same provision.
    const pairs = pairArticles(segmented.chunks);
    const articleIdByNumber = new Map<string, string>();
    for (const [number, pair] of pairs) {
      const [row] = await db
        .insert(articles)
        .values({
          documentId,
          articleNumber: number,
          title: pair.title,
          textAm: pair.amText.join("\n").slice(0, 40000) || null,
          textEn: pair.enText.join("\n").slice(0, 40000) || null,
          pageAm: pair.amPage,
          pageEn: pair.enPage,
        })
        .returning({ id: articles.id });
      articleIdByNumber.set(number, row.id);
    }

    // ── Stage 3: embeddings (batch, cached, graceful when unconfigured) ──
    let vectors: (number[] | null)[] = segmented.chunks.map(() => null);
    let embeddingNote = "EMBEDDING_SKIPPED_NO_TOKEN";
    if (embeddingsConfigured()) {
      await setStage(jobId, "EMBEDDING", "PROCESSING");
      try {
        const inputs = segmented.chunks.map((c) =>
          `${doc.title}${c.articleNumber ? ` — Article ${c.articleNumber}` : ""}\n${c.text}`,
        );
        vectors = await embedBatch(inputs);
        embeddingNote = `${config.embeddings.model} (${vectors[0]?.length ?? 0} dims)`;
        await log("EMBEDDING", `Embedded ${vectors.length} chunks with ${embeddingNote}`);
      } catch (err) {
        embeddingNote = "EMBEDDING_FAILED_KEYWORD_ONLY";
        await log(
          "EMBEDDING",
          `Embedding failed (${err instanceof Error ? err.message : String(err)}). Chunk metadata kept; keyword retrieval still works.`,
          "error",
        );
      }
    } else {
      await log("EMBEDDING", "HF_TOKEN missing — skipping dense embeddings (BM25 retrieval remains available).", "warn");
      await setStage(jobId, "EMBEDDING", "PROCESSING");
    }

    // ── Stage 4: persist chunks + index ──────────────────────────────────
    await setStage(jobId, "INDEXING", "PROCESSING");
    const qdrantPoints: Parameters<typeof upsertPoints>[0] = [];
    for (let i = 0; i < segmented.chunks.length; i++) {
      const c = segmented.chunks[i];
      const articleId = c.articleNumber ? (articleIdByNumber.get(c.articleNumber) ?? null) : null;
      const [row] = await db
        .insert(chunks)
        .values({
          documentId,
          articleId,
          articleNumber: c.articleNumber,
          subArticle: c.subArticle,
          part: c.part,
          chapter: c.chapter,
          language: c.language,
          text: c.text,
          page: c.page,
          charCount: c.text.length,
          tokenEstimate: Math.ceil(c.text.length / 4),
          documentTitle: doc.title,
          documentType: doc.documentType,
          proclamationNumber: doc.proclamationNumber,
          jurisdiction: doc.jurisdiction,
          category: doc.category,
          docStatus: doc.status,
          publicationDate: doc.publicationDate,
          source: doc.source,
          extractionMethod: "TEXT_LAYER",
          embedding: vectors[i] ?? null,
          embeddingModel: vectors[i] ? config.embeddings.model : null,
          embeddedAt: vectors[i] ? new Date() : null,
          contentHash: hash(c.text),
        })
        .returning({ id: chunks.id });
      const vector = vectors[i];
      if (vector) {
        qdrantPoints.push({
          id: row.id,
          vector,
          payload: {
            chunk_id: row.id,
            document_id: documentId,
            language: c.language,
            jurisdiction: doc.jurisdiction,
            category: doc.category,
            doc_status: doc.status,
            document_type: doc.documentType,
            proclamation_number: doc.proclamationNumber ?? "",
            article_number: c.articleNumber ?? "",
            page: c.page ?? 0,
          },
        });
      }
    }
    let vectorBackend: "qdrant" | "postgres" = "postgres";
    if (config.qdrant.configured && qdrantPoints.length > 0) {
      const ok = await upsertPoints(qdrantPoints);
      vectorBackend = ok ? "qdrant" : "postgres";
      await log(
        "INDEXING",
        ok ? `Upserted ${qdrantPoints.length} vectors to Qdrant (${config.qdrant.collection})` : "Qdrant unavailable — vectors remain searchable through PostgreSQL fallback.",
        ok ? "info" : "warn",
      );
    }

    const docLanguage =
      segmented.detectedLanguages.length > 1 ? "bilingual" : (segmented.detectedLanguages[0] ?? "en");
    await db
      .update(documents)
      .set({
        pageCount,
        extractionMethod: "TEXT_LAYER",
        language: doc.language === "bilingual" ? "bilingual" : docLanguage,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));

    await setStage(jobId, "COMPLETED", "COMPLETED", {
      stats: {
        pages: pageCount,
        chunks: segmented.chunks.length,
        articles: pairs.size,
        articleMarkers: segmented.articleCount,
        languages: segmented.detectedLanguages,
        embedding: embeddingNote,
        vectorBackend,
      },
    });
    await log("COMPLETED", "Ingestion completed.");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof ScannedPdfError) {
      await db
        .update(documents)
        .set({ extractionMethod: "OCR", updatedAt: new Date() })
        .where(eq(documents.id, documentId));
    }
    await setStage(jobId, "EXTRACTING", "FAILED", { error: message });
    await appendLog(jobId, {
      ts: new Date().toISOString(),
      stage: "FAILED",
      message,
      level: "error",
    });
  }
}

export function startIngestionJob(documentId: string): Promise<string> {
  return (async () => {
    const [job] = await db
      .insert(ingestionJobs)
      .values({ documentId, status: "QUEUED", stage: "QUEUED" })
      .returning({ id: ingestionJobs.id });
    // Fire-and-forget background worker. Errors are captured on the job row.
    void runIngestion(documentId, job.id).catch(() => undefined);
    return job.id;
  })();
}
