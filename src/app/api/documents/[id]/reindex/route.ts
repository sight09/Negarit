import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { chunks, documents } from "@/db/schema";
import { adminGuard } from "@/server/services/documents";
import { startIngestionJob } from "@/server/ingestion/pipeline";
import { AppError } from "@/server/core/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/documents/:id/reindex — re-extract + re-chunk + re-embed from the
 * stored original PDF. The pipeline wipes previous chunks atomically inside
 * the CHUNKING stage, so re-indexing is idempotent.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    adminGuard(request.headers);
    const { id } = await ctx.params;
    const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
    if (!doc) throw new AppError("NOT_FOUND", "Document not found.", 404);
    if (!doc.filePath) throw new AppError("NO_FILE", "Document has no stored PDF to re-index.", 400);
    const [{ count } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(chunks)
      .where(eq(chunks.documentId, id));
    const jobId = await startIngestionJob(doc.id);
    return Response.json({
      jobId,
      status: "QUEUED",
      documentId: doc.id,
      previousChunks: count,
      note: "Existing chunks are replaced when the CHUNKING stage completes.",
    });
  } catch (err) {
    if (err instanceof AppError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return Response.json({ error: "Failed to start re-indexing." }, { status: 500 });
  }
}
