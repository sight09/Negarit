import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { adminGuard } from "@/server/services/documents";
import { startIngestionJob } from "@/server/ingestion/pipeline";
import { AppError } from "@/server/core/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/documents/:id/ingest — enqueue a fresh ingestion job. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    adminGuard(request.headers);
    const { id } = await ctx.params;
    const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
    if (!doc) throw new AppError("NOT_FOUND", "Document not found.", 404);
    if (!doc.filePath) throw new AppError("NO_FILE", "Document has no stored PDF to ingest.", 400);
    const jobId = await startIngestionJob(doc.id);
    return Response.json({ jobId, status: "QUEUED", documentId: doc.id });
  } catch (err) {
    if (err instanceof AppError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return Response.json({ error: "Failed to start ingestion." }, { status: 500 });
  }
}
