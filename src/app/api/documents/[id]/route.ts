import { adminGuard, deleteDocument, getDocumentDetail } from "@/server/services/documents";
import { AppError } from "@/server/core/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const doc = await getDocumentDetail(id);
    return Response.json(doc);
  } catch (err) {
    if (err instanceof AppError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return Response.json({ error: "Failed to load document." }, { status: 500 });
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    adminGuard(request.headers);
    const { id } = await ctx.params;
    const result = await deleteDocument(id);
    return Response.json(result);
  } catch (err) {
    if (err instanceof AppError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return Response.json({ error: "Failed to delete document." }, { status: 500 });
  }
}
