import { sql } from "drizzle-orm";
import { db } from "@/db";
import { config } from "@/server/core/config";
import { qdrantStatus } from "@/server/retrieval/qdrant";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Platform healthcheck. Always returns 200 with granular subsystem status so
 * a degraded dependency (missing HF token, Qdrant down) never looks like a
 * dead service — and secrets are never reported back.
 */
export async function GET() {
  let database = false;
  let stats = { documents: 0, chunks: 0, embeddedChunks: 0, articles: 0 };
  try {
    await db.execute(sql`select 1`);
    database = true;
    const result = await db.execute(sql`
      select
        (select count(*)::int from documents) as documents,
        (select count(*)::int from chunks) as chunks,
        (select count(*)::int from chunks where embedding is not null) as "embeddedChunks",
        (select count(*)::int from articles) as articles
    `);
    const row = (result as unknown as { rows: Record<string, number>[] }).rows?.[0];
    stats = {
      documents: Number(row?.documents ?? 0),
      chunks: Number(row?.chunks ?? 0),
      embeddedChunks: Number(row?.embeddedChunks ?? 0),
      articles: Number(row?.articles ?? 0),
    };
  } catch {
    database = false;
  }
  const qdrant = await qdrantStatus().catch(() => "down" as const);
  return Response.json({
    ok: true,
    service: "ethiopian-legal-rag",
    time: new Date().toISOString(),
    subsystems: {
      database,
      qdrant,
      embeddings: config.embeddings.configured ? "configured" : "missing_hf_token",
      llm: config.llm.configured ? "configured" : "missing_openrouter_config",
    },
    stats,
  });
}
