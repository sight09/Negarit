#!/usr/bin/env node
/** Re-index one document or all of them: node scripts/reindex.mjs [documentId|all] */
const BASE = process.env.BASE ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const ADMIN = process.env.ADMIN_TOKEN ?? "";
const target = process.argv[2] ?? "all";

const headers = ADMIN ? { "x-admin-token": ADMIN } : {};

if (target === "all") {
  const res = await fetch(`${BASE}/api/documents`);
  const { documents } = await res.json();
  for (const doc of documents) {
    const r = await fetch(`${BASE}/api/documents/${doc.id}/reindex`, { method: "POST", headers });
    const body = await r.json();
    console.log(r.ok ? `reindex queued: ${doc.title} (${body.jobId})` : `failed: ${doc.title} — ${body.error}`);
  }
} else {
  const r = await fetch(`${BASE}/api/documents/${target}/reindex`, { method: "POST", headers });
  const body = await r.json();
  console.log(r.ok ? `reindex queued (${body.jobId})` : `failed — ${body.error}`);
  process.exit(r.ok ? 0 : 1);
}
