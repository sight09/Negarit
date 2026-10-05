#!/usr/bin/env node
/**
 * Ingest a legal PDF through the running app.
 * Usage:
 *   node scripts/ingest.mjs <file.pdf> --title "..." --proc 1396/2025 \
 *     --category startup --status IN_FORCE --jurisdiction federal \
 *     --language bilingual --source "Federal Negarit Gazette" \
 *     [--gazette "..."] [--gazetteNo "..."] [--pub 2025-07-17] [--eff 2025-07-17] [--url "..."]
 */
import { readFile } from "fs/promises";
import path from "path";

const BASE = process.env.BASE ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const ADMIN = process.env.ADMIN_TOKEN ?? "";

const args = process.argv.slice(2);
const file = args[0];
if (!file || !file.toLowerCase().endsWith(".pdf")) {
  console.error("Usage: node scripts/ingest.mjs <file.pdf> --title (...) --proc NNNN/YYYY [...]");
  process.exit(1);
}
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const form = new FormData();
const buf = await readFile(file);
form.set("file", new Blob([buf], { type: "application/pdf" }), path.basename(file));
const fields = {
  title: flag("title") ?? path.basename(file, ".pdf"),
  titleAm: flag("titleAm"),
  proclamationNumber: flag("proc"),
  documentType: flag("type") ?? "proclamation",
  category: flag("category") ?? "other",
  jurisdiction: flag("jurisdiction") ?? "federal",
  status: flag("status") ?? "UNKNOWN",
  language: flag("language") ?? "bilingual",
  source: flag("source"),
  sourceUrl: flag("url"),
  gazetteName: flag("gazette"),
  gazetteNumber: flag("gazetteNo"),
  publicationDate: flag("pub"),
  effectiveDate: flag("eff"),
  notes: flag("notes"),
};
for (const [k, v] of Object.entries(fields)) if (v) form.set(k, v);

const res = await fetch(`${BASE}/api/documents`, {
  method: "POST",
  headers: ADMIN ? { "x-admin-token": ADMIN } : {},
  body: form,
});
const body = await res.json();
if (!res.ok) {
  console.error(`Ingest failed (${res.status}):`, body.error ?? body);
  process.exit(1);
}
console.log(`Queued document ${body.document.title} (${body.document.id})`);
console.log(`Job ${body.jobId} — watch progress at ${BASE}/admin`);
