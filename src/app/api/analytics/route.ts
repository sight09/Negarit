import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/analytics — corpus + operations overview for the admin dashboard. */
export async function GET() {
  try {
    const result = await db.execute(sql`
      select
        (select count(*)::int from documents)                                  as "documents",
        (select count(*)::int from chunks)                                     as "chunks",
        (select count(*)::int from chunks where embedding is not null)         as "embeddedChunks",
        (select count(*)::int from articles)                                   as "articles",
        (select count(*)::int from chat_sessions)                              as "sessions",
        (select count(*)::int from chat_messages)                              as "messages",
        (select count(*)::int from retrieval_logs)                             as "retrievalLogs",
        (select coalesce(avg(latency_ms),0)::int from retrieval_logs)          as "avgRetrievalMs",
        (select coalesce(avg(llm_latency_ms),0)::int
           from retrieval_logs where llm_latency_ms is not null)               as "avgLlmMs"
    `);
    const totals = (result as unknown as { rows: Record<string, number>[] }).rows?.[0] ?? {};

    const byStatus = await groupBy("documents", "status");
    const byJurisdiction = await groupBy("documents", "jurisdiction");
    const byCategory = await groupBy("documents", "category");
    const byLanguage = await groupBy("chunks", "language");
    const byType = await groupBy("documents", "document_type");

    const jobsResult = await db.execute(sql`
      select j.id, j.document_id as "documentId", d.title as "documentTitle",
             j.status, j.stage, j.progress, j.error, j.created_at as "createdAt",
             j.updated_at as "updatedAt"
      from ingestion_jobs j join documents d on d.id = j.document_id
      order by j.created_at desc limit 12
    `);
    const jobs = (jobsResult as unknown as { rows: unknown[] }).rows ?? [];

    return Response.json({ totals, byStatus, byJurisdiction, byCategory, byLanguage, byType, jobs });
  } catch (err) {
    return Response.json(
      { error: `Analytics unavailable: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}

async function groupBy(table: string, column: string) {
  const result = await db.execute(
    sql.raw(`select ${column} as key, count(*)::int as count from ${table} group by ${column} order by count desc limit 20`),
  );
  return (result as unknown as { rows: { key: string | null; count: number }[] }).rows ?? [];
}
