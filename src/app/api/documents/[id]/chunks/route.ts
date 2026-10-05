import { listChunks } from "@/server/services/documents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/documents/:id/chunks?language=&q=&limit=&offset= */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const rows = await listChunks(id, {
    language: url.searchParams.get("language") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    limit: Number(url.searchParams.get("limit") ?? 100),
    offset: Number(url.searchParams.get("offset") ?? 0),
  });
  return Response.json({ chunks: rows, count: rows.length });
}
