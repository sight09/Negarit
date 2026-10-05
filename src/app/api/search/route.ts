import { z } from "zod";
import { and, ilike, or, sql, eq, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { AppError, searchFiltersSchema } from "@/server/core/types";
import { hybridRetrieve, routeQuery } from "@/server/retrieval/hybrid";
import { embeddingsConfigured, embedText } from "@/server/embeddings/huggingface";
import { detectLanguage } from "@/server/retrieval/hybrid";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  query: z.string().max(1000).default(""),
  filters: searchFiltersSchema.optional(),
  limit: z.number().int().min(1).max(50).default(12),
});

/**
 * Legal corpus search: metadata exact/fuzzy matching on documents plus
 * hybrid chunk-level search. Exposes the same filters as the research UI.
 */
export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const query = body.query.trim();
    const filters = body.filters ?? {};

    // ── Document-level search (metadata) ────────────────────────────────
    const where: SQL[] = [];
    if (query) {
      where.push(
        or(
          ilike(documents.title, `%${query}%`),
          ilike(documents.titleAm, `%${query}%`),
          ilike(documents.proclamationNumber, `%${query.replace(/\s+/g, "")}%`),
        ) as SQL,
      );
    }
    for (const [key, col] of [
      ["jurisdiction", documents.jurisdiction],
      ["category", documents.category],
      ["status", documents.status],
      ["documentType", documents.documentType],
      ["language", documents.language],
    ] as const) {
      const v = (filters as Record<string, string | undefined>)[key];
      if (v && v !== "any") where.push(eq(col, v));
    }
    if (filters.year) where.push(ilike(documents.publicationDate, `%${filters.year}%`));
    if (filters.source) where.push(ilike(documents.source, `%${filters.source}%`));
    if (filters.proclamationNumber)
      where.push(ilike(documents.proclamationNumber, `%${filters.proclamationNumber.replace(/\s+/g, "")}%`));

    const docs = await db
      .select()
      .from(documents)
      .where(where.length ? and(...where) : undefined)
      .orderBy(documents.title)
      .limit(body.limit);

    // ── Chunk-level hybrid search ────────────────────────────────────────
    let chunkHits: Awaited<ReturnType<typeof hybridRetrieve>>["results"] = [];
    let diagnostics: Record<string, unknown> = { dense: "skipped" };
    if (query) {
      const routed = routeQuery(query);
      let vector: number[] | null = null;
      if (embeddingsConfigured()) {
        vector = await embedText(query).catch(() => null);
      }
      const hybrid = await hybridRetrieve({
        question: query,
        queryVector: vector,
        filters,
        mode: filters.status ? "all" : "current",
        questionLanguage: detectLanguage(query),
        routed,
      });
      chunkHits = hybrid.results.slice(0, body.limit);
      diagnostics = {
        dense: hybrid.denseEnabled ? hybrid.backend : "disabled",
        vectorResults: hybrid.vectorCount,
        keywordResults: hybrid.bm25Count,
        searchesPerformed: hybrid.searchesPerformed,
      };
    }

    return Response.json({
      documents: docs.map((d) => ({
        id: d.id,
        slug: d.slug,
        title: d.title,
        titleAm: d.titleAm,
        proclamationNumber: d.proclamationNumber,
        documentType: d.documentType,
        category: d.category,
        jurisdiction: d.jurisdiction,
        status: d.status,
        language: d.language,
        publicationDate: d.publicationDate,
        source: d.source,
        pageCount: d.pageCount,
      })),
      chunks: chunkHits.map((c) => ({
        chunkId: c.id,
        documentId: c.documentId,
        title: c.documentTitle,
        proclamationNumber: c.proclamationNumber,
        article: c.articleNumber,
        page: c.page,
        language: c.language,
        status: c.docStatus,
        jurisdiction: c.jurisdiction,
        score: Math.round(c.score * 1000) / 1000,
        excerpt: c.text.slice(0, 360),
      })),
      counts: { documents: docs.length, chunks: chunkHits.length },
      diagnostics,
      dbChunkTotal: (
        (await db.execute(sql`select count(*)::int as n from chunks`)) as unknown as {
          rows: { n: number }[];
        }
      ).rows?.[0]?.n ?? null,
    });
  } catch (err) {
    if (err instanceof AppError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status });
    }
    if (err instanceof z.ZodError) {
      return Response.json({ error: "Invalid request", details: err.flatten() }, { status: 400 });
    }
    console.error("[search] unexpected error", err);
    return Response.json({ error: "Unexpected server error during search." }, { status: 500 });
  }
}
