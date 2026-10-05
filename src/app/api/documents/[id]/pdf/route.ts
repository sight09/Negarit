import { readFile } from "fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/documents/:id/pdf — stream the stored original gazette PDF.
 * The stored path is derived from the content hash at upload time, so no
 * user-controlled path ever reaches the filesystem.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc?.filePath) return Response.json({ error: "PDF not available." }, { status: 404 });
  try {
    const buffer = await readFile(doc.filePath);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${(doc.filename ?? "document.pdf").replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return Response.json({ error: "Stored PDF could not be read." }, { status: 404 });
  }
}
