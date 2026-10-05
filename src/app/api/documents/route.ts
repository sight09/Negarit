import { adminGuard, listDocuments, uploadDocument } from "@/server/services/documents";
import { AppError } from "@/server/core/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/documents — list indexed documents (admin filters supported). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const docs = await listDocuments(url.searchParams);
  return Response.json({ documents: docs, count: docs.length });
}

/** POST /api/documents — upload + enqueue ingestion (multipart/form-data). */
export async function POST(request: Request) {
  try {
    adminGuard(request.headers);
    const form = await request.formData();
    const result = await uploadDocument(form);
    if (result.duplicate) {
      return Response.json(
        {
          error: "This exact PDF (SHA-256) is already indexed.",
          code: "DUPLICATE_DOCUMENT",
          document: result.document,
        },
        { status: 409 },
      );
    }
    return Response.json(
      { document: result.document, jobId: result.jobId, status: "QUEUED" },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof AppError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("[documents.upload] unexpected error", err);
    return Response.json({ error: "Upload failed." }, { status: 500 });
  }
}
