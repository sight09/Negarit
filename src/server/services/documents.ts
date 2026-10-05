import { createHash } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  articles,
  chunks,
  documents,
  documentVersions,
  ingestionJobs,
  legalRelationships,
  sources,
} from "@/db/schema";
import { config } from "@/server/core/config";
import { AppError } from "@/server/core/types";
import { startIngestionJob } from "@/server/ingestion/pipeline";
import { deleteDocumentPoints } from "@/server/retrieval/qdrant";

/**
 * Document management service (mirrors backend/app/services).
 */

export function adminGuard(headers: Headers) {
  if (!config.adminToken) return; // open mode for local dev; set ADMIN_TOKEN to enforce
  if (headers.get("x-admin-token") !== config.adminToken) {
    throw new AppError("UNAUTHORIZED", "Invalid or missing admin token.", 401);
  }
}

export function sanitizeFilename(name: string): string {
  return path
    .basename(name)
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 120);
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "document"
  );
}

export async function uploadDocument(form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError("BAD_REQUEST", "Missing PDF file field.", 400);
  const filename = sanitizeFilename(file.name || "document.pdf");
  const isPdf =
    /\.pdf$/i.test(filename) && ["application/pdf", "application/octet-stream", ""].includes(file.type);
  if (!isPdf) throw new AppError("BAD_FILE_TYPE", "Only PDF files are accepted.", 415);
  const maxBytes = config.uploads.maxMb * 1024 * 1024;
  if (file.size > maxBytes)
    throw new AppError("FILE_TOO_LARGE", `File exceeds the ${config.uploads.maxMb}MB limit.`, 413);

  const buffer = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(buffer).digest("hex");

  // SHA-256 duplicate detection — never re-ingest unchanged documents (cost control).
  const [existing] = await db.select().from(documents).where(eq(documents.sha256, sha256)).limit(1);
  if (existing) {
    return { duplicate: true as const, document: existing, jobId: null as string | null };
  }

  const text = (key: string): string | null => {
    const v = form.get(key);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  const title = text("title");
  if (!title) throw new AppError("BAD_REQUEST", "Field 'title' is required.", 400);

  await mkdir(config.uploads.dir, { recursive: true });
  const storageName = `${sha256}.pdf`; // storage name is derived from content hash — path traversal impossible
  const filePath = path.join(config.uploads.dir, storageName);
  try {
    await writeFile(filePath, buffer);
  } catch (err) {
    throw new AppError("IO_ERROR", `Could not store uploaded file: ${String(err)}`, 500);
  }

  const proclamationNumber = text("proclamationNumber")?.replace(/\s+/g, "") ?? null;
  const slug = `${slugify(title)}-${sha256.slice(0, 8)}`;
  let inserted: typeof documents.$inferSelect;
  try {
    [inserted] = await db
      .insert(documents)
      .values({
        slug,
        title,
        titleAm: text("titleAm"),
        documentType: text("documentType") ?? "proclamation",
        proclamationNumber,
        gazetteName: text("gazetteName"),
        gazetteNumber: text("gazetteNumber"),
        category: text("category") ?? "other",
        jurisdiction: text("jurisdiction") ?? "federal",
        language: text("language") ?? "bilingual",
        status: text("status") ?? "UNKNOWN",
        publicationDate: text("publicationDate"),
        effectiveDate: text("effectiveDate"),
        source: text("source"),
        sourceUrl: text("sourceUrl"),
        sourceType: text("sourceType") ?? "PRIMARY",
        sha256,
        filename,
        filePath,
        notes: text("notes"),
        amends: text("amends"),
        repeals: text("repeals"),
      })
      .returning();
    await db.insert(documentVersions).values({
      documentId: inserted.id,
      versionLabel: "original",
      status: inserted.status,
      publicationDate: inserted.publicationDate,
      effectiveDate: inserted.effectiveDate,
      sha256,
    });
    if (inserted.source) {
      await db.insert(sources).values({
        documentId: inserted.id,
        name: inserted.source,
        type: inserted.sourceType,
        priority: inserted.sourcePriority,
        url: inserted.sourceUrl,
      });
    }
    // Optional legal relationships (document IDs provided from admin UI).
    for (const [field, relation] of [["amendsDocumentId", "AMENDS"], ["repealsDocumentId", "REPEALS"]] as const) {
      const target = text(field);
      if (target) {
        await db
          .insert(legalRelationships)
          .values({ fromDocumentId: inserted.id, toDocumentId: target, relationType: relation })
          .catch(() => undefined);
      }
    }
  } catch (err) {
    await unlink(filePath).catch(() => undefined);
    throw err;
  }

  const jobId = await startIngestionJob(inserted.id);
  return { duplicate: false as const, document: inserted, jobId };
}

export async function listDocuments(params: URLSearchParams) {
  const where: SQL[] = [];
  const q = params.get("q");
  if (q) {
    where.push(
      or(
        ilike(documents.title, `%${q}%`),
        ilike(documents.titleAm, `%${q}%`),
        ilike(documents.proclamationNumber, `%${q.replace(/\s+/g, "")}%`),
      ) as SQL,
    );
  }
  for (const [key, column] of [
    ["status", documents.status],
    ["jurisdiction", documents.jurisdiction],
    ["category", documents.category],
    ["documentType", documents.documentType],
    ["language", documents.language],
  ] as const) {
    const value = params.get(key);
    if (value && value !== "any") where.push(eq(column, value));
  }
  const rows = await db
    .select()
    .from(documents)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(documents.createdAt))
    .limit(200);

  const counts = await db
    .select({ documentId: chunks.documentId, count: sql<number>`count(*)::int` })
    .from(chunks)
    .groupBy(chunks.documentId);
  const countMap = new Map(counts.map((c) => [c.documentId, c.count]));

  const jobs = await db
    .select()
    .from(ingestionJobs)
    .orderBy(desc(ingestionJobs.createdAt))
    .limit(400);
  const latestJobByDoc = new Map<string, (typeof ingestionJobs.$inferSelect)>();
  for (const job of jobs) {
    if (!latestJobByDoc.has(job.documentId)) latestJobByDoc.set(job.documentId, job);
  }

  return rows.map((doc) => ({
    ...doc,
    chunkCount: countMap.get(doc.id) ?? 0,
    latestJob: latestJobByDoc.get(doc.id) ?? null,
  }));
}

export async function getDocumentDetail(id: string) {
  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc) throw new AppError("NOT_FOUND", "Document not found.", 404);
  const versions = await db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, id));
  const articleRows = await db
    .select()
    .from(articles)
    .where(eq(articles.documentId, id))
    .orderBy(articles.articleNumber)
    .limit(400);
  const jobs = await db
    .select()
    .from(ingestionJobs)
    .where(eq(ingestionJobs.documentId, id))
    .orderBy(desc(ingestionJobs.createdAt))
    .limit(8);
  const sourceRows = await db.select().from(sources).where(eq(sources.documentId, id));
  const rels = await db
    .select()
    .from(legalRelationships)
    .where(
      or(eq(legalRelationships.fromDocumentId, id), eq(legalRelationships.toDocumentId, id)) as SQL,
    );
  const otherIds = rels.map((r) => (r.fromDocumentId === id ? r.toDocumentId : r.fromDocumentId));
  const others = otherIds.length
    ? await db
        .select({ id: documents.id, title: documents.title, proclamationNumber: documents.proclamationNumber, status: documents.status })
        .from(documents)
        .where(or(...otherIds.map((oid) => eq(documents.id, oid))) as SQL)
    : [];
  const otherMap = new Map(others.map((o) => [o.id, o]));
  const [{ count: chunkCount } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chunks)
    .where(eq(chunks.documentId, id));
  return {
    ...doc,
    versions,
    articles: articleRows,
    jobs,
    sources: sourceRows,
    chunkCount,
    relationships: rels.map((r) => ({
      ...r,
      direction: r.fromDocumentId === id ? "outgoing" : "incoming",
      other: otherMap.get(r.fromDocumentId === id ? r.toDocumentId : r.fromDocumentId) ?? null,
    })),
  };
}

export async function listChunks(
  documentId: string,
  opts: { language?: string; q?: string; limit?: number; offset?: number },
) {
  const where: SQL[] = [eq(chunks.documentId, documentId)];
  if (opts.language && opts.language !== "any") where.push(eq(chunks.language, opts.language));
  if (opts.q) where.push(ilike(chunks.text, `%${opts.q}%`));
  return db
    .select({
      id: chunks.id,
      articleNumber: chunks.articleNumber,
      subArticle: chunks.subArticle,
      part: chunks.part,
      chapter: chunks.chapter,
      language: chunks.language,
      page: chunks.page,
      charCount: chunks.charCount,
      hasEmbedding: sql<boolean>`embedding is not null`,
      text: sql<string>`left(text, 420)`,
    })
    .from(chunks)
    .where(and(...where))
    .orderBy(chunks.page, chunks.createdAt)
    .limit(opts.limit ?? 100)
    .offset(opts.offset ?? 0);
}

export async function deleteDocument(id: string) {
  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc) throw new AppError("NOT_FOUND", "Document not found.", 404);
  await deleteDocumentPoints(id);
  if (doc.filePath) await unlink(doc.filePath).catch(() => undefined);
  await db.delete(documents).where(eq(documents.id, id));
  return { deleted: true, title: doc.title };
}
