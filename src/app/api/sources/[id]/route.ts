import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { chunks, documents } from "@/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/sources/:chunkId — full citation payload for the source viewer,
 * including the bilingual pair chunk (same article, other language) and the
 * sibling chunks of the same article for prev/next navigation.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [chunk] = await db.select().from(chunks).where(eq(chunks.id, id)).limit(1);
  if (!chunk) return Response.json({ error: "Source not found." }, { status: 404 });
  const [doc] = await db.select().from(documents).where(eq(documents.id, chunk.documentId)).limit(1);

  let pair: typeof chunks.$inferSelect | null = null;
  let siblings: { id: string; language: string; page: number | null; subArticle: string | null }[] = [];
  if (chunk.articleNumber) {
    const [p] = await db
      .select()
      .from(chunks)
      .where(
        and(
          eq(chunks.documentId, chunk.documentId),
          eq(chunks.articleNumber, chunk.articleNumber),
          ne(chunks.language, chunk.language),
        ),
      )
      .limit(1);
    pair = p ?? null;
    siblings = await db
      .select({ id: chunks.id, language: chunks.language, page: chunks.page, subArticle: chunks.subArticle })
      .from(chunks)
      .where(
        and(
          eq(chunks.documentId, chunk.documentId),
          eq(chunks.articleNumber, chunk.articleNumber),
        ),
      )
      .orderBy(chunks.page);
  }

  return Response.json({
    chunk: { ...chunk, embedding: undefined },
    pair: pair ? { ...pair, embedding: undefined } : null,
    siblings,
    document: doc
      ? {
          id: doc.id,
          title: doc.title,
          titleAm: doc.titleAm,
          proclamationNumber: doc.proclamationNumber,
          documentType: doc.documentType,
          jurisdiction: doc.jurisdiction,
          category: doc.category,
          status: doc.status,
          language: doc.language,
          publicationDate: doc.publicationDate,
          effectiveDate: doc.effectiveDate,
          source: doc.source,
          sourceUrl: doc.sourceUrl,
          sourceType: doc.sourceType,
          gazetteName: doc.gazetteName,
          gazetteNumber: doc.gazetteNumber,
          pageCount: doc.pageCount,
          extractionMethod: doc.extractionMethod,
          amends: doc.amends,
          repeals: doc.repeals,
        }
      : null,
  });
}
