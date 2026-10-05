# Ethiopian Legal RAG — Bilingual (Amharic/English) Legal Research AI

A production-grade retrieval-augmented legal research system for Ethiopian law.
It retrieves relevant legal provisions **first**, then answers **strictly** from
those retrieved sources with article-level, page-level citations — in Amharic
or English. It never invents a legal provision: when the corpus is insufficient
it says so explicitly.

> **Legal notice** — This system provides legal information based on its indexed
> sources and is not a substitute for advice from a qualified legal professional.

---

## 1. Architecture

```
Next.js 16 (App Router, TypeScript, Tailwind, shadcn-style UI)
├─ src/app/*                       → research console + admin dashboard + API routes
└─ src/server/*                    → the backend service layer
     ├── core/                     → config, constants, shared types (schemas/)
     ├── embeddings/huggingface.ts → BAAI/bge-m3 via HF Inference Providers (+ cache)
     ├── ingestion/pdf.ts          → PDF.js text-layer extraction (PyMuPDF equivalent)
     ├── ingestion/segment.ts      → bilingual separation, article/sub-article chunking
     ├── ingestion/pipeline.ts     → PDF → chunks → embeddings → indexes (async jobs)
     ├── retrieval/bm25.ts         → Unicode-aware BM25 (Ethiopic-safe tokenizer)
     ├── retrieval/qdrant.ts       → optional Qdrant backend (REST, fail-soft)
     ├── retrieval/hybrid.ts       → routing, exact lookup, RRF fusion, reranking
     ├── rag/pipeline.ts           → orchestration + memory + confidence + refusal
     ├── llm/openrouter.ts         → OpenRouter-compatible generation, strict prompt
     ├── citations/validate.ts     → citation existence validation (anti-hallucination)
     └── services/documents.ts     → document/admin service layer
PostgreSQL (Drizzle ORM)           → documents, versions, articles, chunks, jobs,
                                     sessions, messages, retrieval logs, embedding cache
Qdrant (optional)                  → mirrored chunk vectors + payload filters
```

The requested `backend/app/{api,core,models,schemas,services,ingestion,retrieval,
rag,llm,embeddings,citations}` layout maps 1:1 onto `src/server/*`; everything is
served by one deployable Next.js runtime (frontend + REST API). Each stage is a
typed service class/module so the pipeline can be moved into a standalone worker
unchanged if desired.

### RAG pipeline

```
QUESTION → language detection (Ethiopic script) → query routing
         → exact legal-identifier lookup (1396/2025, "Article 3", አንቀጽ 3)
         → BGE-M3 dense vector search (Qdrant | PostgreSQL cosine fallback)
           + BM25 keyword search → Reciprocal Rank Fusion (k=60)
         → metadata filters (status/jurisdiction/category/language/year)
         → status preference (IN_FORCE/AMENDED first; historical only when asked)
         → metadata-aware reranking → top 6 chunks (configurable)
         → strict grounded generation (OpenRouter LLM) with [S#] references
         → citation validation against PostgreSQL → answer + source cards
```

Every stage is journalised: retrieval logs, ingestion job logs, per-question
diagnostics (visible in the UI under "Retrieval diagnostics").

---

## 2. Quickstart

```bash
cp .env.example .env      # fill in HF_TOKEN, OPENROUTER_API_KEY, LLM_MODEL (optional but recommended)
npm ci
npx drizzle-kit push      # create PostgreSQL tables
npm run dev               # http://localhost:3000
```

Docker (PostgreSQL + Qdrant + app):

```bash
docker compose up --build
```

## 3. Environment variables

| Variable | Purpose | Required |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | yes |
| `QDRANT_URL` / `QDRANT_API_KEY` | Qdrant REST endpoint (falls back to PostgreSQL cosine search when absent) | no |
| `HF_TOKEN` | Hugging Face token for `BAAI/bge-m3` embeddings | recommended |
| `HF_MODEL` | override embedding model id | no (default `BAAI/bge-m3`) |
| `OPENROUTER_API_KEY` / `LLM_MODEL` | OpenRouter-compatible LLM for generation | recommended |
| `ADMIN_TOKEN` | when set, all admin mutations require `x-admin-token` header | prod |
| `RETRIEVE_TOP_K` / `RERANK_TOP_K` / `CONTEXT_CHUNKS` | retrieval tuning (20 / 6 / 6) | no |
| `CONFIDENCE_STRONG` / `CONFIDENCE_MODERATE` | confidence thresholds | no |

**Graceful degradation by design**

| Missing | Behaviour |
|---|---|
| `HF_TOKEN` | ingest skips vectors; retrieval = BM25-only; UI shows the notice |
| `OPENROUTER_API_KEY`/`LLM_MODEL` | answers become verbatim source excerpts (still grounded + cited) |
| Qdrant down | vectors searched via PostgreSQL cosine similarity |

Secrets are read server-side only and are never shipped to the browser.

## 4. Ingesting the first document (Startup Proclamation No. 1396/2025)

The corpus ships **empty on purpose** — no fabricated legal texts. Put the real
Federal Negarit Gazette PDF in `corpus/federal/` and either:

**A. Admin dashboard** — `/admin` → *Upload legal document* → set metadata
(title `Ethiopian Startup Proclamation`, № `1396/2025`, category `startup`,
jurisdiction `federal`, status `IN_FORCE`, source `Federal Negarit Gazette`,
language `bilingual`) → *Upload & ingest*. Watch the job progress live, open the
*Chunk explorer* to verify Amharic/English article pairing, then ask the test
questions below from the console.

**B. CLI** —

```bash
node scripts/ingest.mjs corpus/federal/startup-proclamation-1396-2025.pdf \
  --title "Ethiopian Startup Proclamation" --proc 1396/2025 --category startup \
  --status IN_FORCE --jurisdiction federal --language bilingual \
  --source "Federal Negarit Gazette" --gazette "Federal Negarit Gazette"
```

First test questions (both languages):

1. `What is the Ethiopian Startup Proclamation?`
2. `What is the scope of application of the Startup Proclamation?`
3. `What does Article 3 of Proclamation 1396/2025 say?`
4. `የኢትዮጵያ የስታርታፕ አዋጅ ምንድነው?`
5. `የአዋጁ የተፈፃሚነት ወሰን ምንድነው?`
6. `Show me Article 3 in English.`
7. `Show me the Amharic version of Article 3.`
8. `What is Proclamation 1396/2025?`

The ingestion pipeline extracts the text layer (PDF.js), separates Amharic /
English segments, detects `Article N` / `አንቀጽ N` boundaries, chunks on legal
structure (never blind 500-char splits), pairs bilingual versions of the same
article, batch-embeds with BGE-M3 (cached by SHA-256), and indexes into
PostgreSQL + Qdrant with full metadata (status, jurisdiction, category, page,
proclamation number, extraction method). Scanned PDFs fail loudly with an
`OCR` flag instead of being silently mis-indexed; OCR ingest is the documented
extension point (`ingestion/pdf.ts` → `ScannedPdfError`).

## 5. CLI scripts

```bash
node scripts/ingest.mjs <file.pdf> [--meta...]   # upload + ingest via the API
node scripts/reindex.mjs <documentId|all>        # re-index from stored original
node scripts/evaluate.mjs                        # run the evaluation harness
```

## 6. Evaluation

`evaluation/` contains 175 test questions (50 EN, 50 AM, 25 cross-language,
25 exact article/proclamation lookups, 25 historical/current-law probes) with
expected proclamation/article metadata. `npm`-less, run:

```bash
node scripts/evaluate.mjs            # needs the app running (BASE=http://localhost:3000)
```

Metrics reported per dataset and overall: **Recall@5, Recall@10, MRR, citation
accuracy, groundedness (validated-citation ratio), language accuracy**, and a
**corpus coverage** column that honestly separates "retrieval failed" from
"source not indexed yet". Report written to `evaluation/report.json`.

## 7. API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/chat` | grounded answer + citations + retrieval diagnostics (`skipLlm` for eval) |
| POST | `/api/search` | metadata + hybrid chunk search with all filters |
| POST | `/api/embeddings` | BGE-M3 test/utility (admin) |
| POST | `/api/documents` | upload PDF + metadata (multipart, admin) |
| GET | `/api/documents` | list + status + latest job |
| GET/DELETE | `/api/documents/{id}` | detail (articles, versions, jobs, relationships) / delete (admin) |
| POST | `/api/documents/{id}/ingest` · `/reindex` | async ingestion jobs (admin) |
| GET | `/api/documents/{id}/chunks` | chunk explorer (`language`, `q`, pagination) |
| GET | `/api/documents/{id}/pdf` | original gazette PDF |
| GET | `/api/sources/{chunkId}` | full citation payload incl. bilingual pair |
| GET | `/api/health` | subsystem status (always 200, no secrets) |
| GET | `/api/analytics` | corpus/jobs/latency aggregates |

## 8. Confidence model

Labels are derived from retrieval signals, **never** from LLM self-confidence:

- **Strong source match** — exact proclamation/article metadata hit, or top
  fused score ≥ `CONFIDENCE_STRONG` with ≥2 corroborating chunks.
- **Moderate source match** — top fused score between the moderate and strong
  thresholds.
- **Insufficient source match** — below threshold or no candidates → the system
  refuses to answer and shows searches performed + related documents instead.

## 9. Security

PDF-only uploads (extension + MIME), 25MB cap, SHA-256 dedupe, storage
filenames derived from content hash (path traversal impossible), admin token
guard on all mutations, zod validation on every endpoint, secrets confined to
server modules, no API keys in logs.

## 10. Acceptance checklist

Backend/frontend boot, PostgreSQL + (optional) Qdrant connectivity, BGE-M3
embeddings, PDF extraction (EN/AM), article detection, bilingual pairing,
chunk metadata, Qdrant/PostgreSQL indexing, BM25 + vector + hybrid search,
exact proclamation/article lookup, current/historical filtering, grounded
generation with validated citations and page numbers, Amharic & English
answers, cross-language retrieval, honest no-result behaviour, admin upload /
re-index / error visibility, no exposed secrets. Verify end-to-end with the
eight questions in §4 and `node scripts/evaluate.mjs`.

## 11. Known limitations

- OCR for scanned gazettes is detected and flagged but not executed (extension point documented).
- Side-by-side two-column bilingual layouts are handled best-effort and produce an ingestion warning.
- Amharic numerals (፩፪፫) in article headings are normalized for Arabic-digit
  markers; extend `segment.ts` regexes to broaden heading coverage.
