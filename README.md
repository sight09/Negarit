<p align="center">
  <img src="public/logo.svg" alt="Negarit (ነጋሪት) Logo" width="340" />
</p>

<h1 align="center">Negarit (ነጋሪት)</h1>
<h3 align="center">Bilingual (Amharic/English) Ethiopian Legal Research & Retrieval-Augmented Generation AI</h3>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16.2-black?style=flat-square&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-blue?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/PostgreSQL-17-336791?style=flat-square&logo=postgresql" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Drizzle_ORM-0.45-C5F74F?style=flat-square" alt="Drizzle ORM" />
  <img src="https://img.shields.io/badge/Embeddings-BAAI%2Fbge--m3-orange?style=flat-square" alt="BAAI/bge-m3" />
  <img src="https://img.shields.io/badge/Vector_DB-Qdrant_%7C_PGVector-red?style=flat-square" alt="Vector DB" />
  <img src="https://img.shields.io/badge/License-Proprietary%20%2F%20Research-green?style=flat-square" alt="License" />
</p>

---

## 🧭 Evaluators' & Judges' Fast Track

If you are a judge or evaluator reviewing this project, start with these dedicated resources:

| Resource | Purpose |
|---|---|
| 📋 [**Judges' Evaluation Guide**](JUDGES_GUIDE.md) | **5-minute live demo script**, copy-paste test questions, anti-hallucination verification, and scoring rubric alignment. |
| 🏗️ [**System Architecture & Technical Specs**](docs/ARCHITECTURE.md) | Deep-dive into Ethiopic segmentation, RRF fusion, bilingual pairing, and database schemas. |
| 📡 [**REST API Reference**](docs/API_REFERENCE.md) | Complete documentation of all backend endpoints with request/response payloads. |
| ⚖️ [**Ethiopian Legal System Context**](docs/ETHIOPIAN_LEGAL_SYSTEM_CONTEXT.md) | Context on the Federal Negarit Gazette, FDRE Constitution Art. 106 bilingual supremacy, and legal hierarchy. |

---

## 🌟 What is Negarit (ነጋሪት)?

**Negarit (ነጋሪት)** is a production-grade, citation-grounded, bilingual legal research AI built for the legal framework of the Federal Democratic Republic of Ethiopia. 

Named after the historic imperial drum (*ነጋሪት*) traditionally sounded to herald state proclamations, Negarit solves the core failure mode of generic LLMs in African jurisprudence: **uncontrolled hallucination and lack of authentic legal grounding**.

### Core Pillars
1. **Strict Article-Level Grounding:** Answers are generated **exclusively** from retrieved provisions of official Federal Negarit Gazettes, accompanied by exact article and page-level citations.
2. **Constitutional Bilingualism:** Seamlessly queries and answers in both **Amharic (Ethiopic Ge'ez script)** and **English**, with automatic parallel article pairing (reflecting the legal supremacy of Amharic under Art. 106 of the FDRE Constitution).
3. **Anti-Hallucination & Honest Refusal:** If an article or decree is unindexed or absent from the corpus, Negarit **refuses to invent laws**, transparently displaying the retrieval confidence and searches performed.
4. **Temporal Legislative Awareness:** Tracks the real-world lifecycle of laws (`IN_FORCE`, `AMENDED`, `REPEALED`, `SUPERSEDED`, `HISTORICAL`), prioritizing current enactments.

> **Legal Disclaimer:** Negarit provides legal information grounded in authentic indexed enactments and is not a substitute for formal counsel from a licensed advocate.

---

## 🖥️ Modern User Interface & Features

Negarit features a modern, responsive web application inspired by contemporary AI research consoles:

### 1. ChatGPT-Style Research Console
- **Collapsible Navigation Sidebar**: Houses active research sessions, language toggle (English / አማርኛ), and instant search history.
- **User Profile Card**: Personalized researcher identity badge at the base of the navigation panel.
- **AI Model-Picker Style Dropdowns**: Precision filter pills for:
  - **Jurisdiction**: Select between Federal and 14 Regional states & chartered cities (Oromia, Amhara, Tigray, Somali, Sidama, Addis Ababa, Dire Dawa, etc.).
  - **Enactment Status**: Toggle `IN_FORCE`, `AMENDED`, `REPEALED`, `SUPERSEDED`, or `HISTORICAL`.
- **Dynamic Legal Areas Carousel**: Continuous, auto-sliding horizontal marquee highlighting key Ethiopian legal sectors (Startups, Labor, Commercial Code, Tax, Civil Rights, Intellectual Property). Hovering automatically pauses the animation; clicking any card executes an instant targeted research query.

### 2. Bento Telemetry Admin Suite (`/admin`)
- **Pillar 1: Corpus Assets & Density Bar**: High-density analytics showing indexed proclamations, articles, and chunk storage metrics.
- **Pillar 2: Vector Intelligence Hub**: Real-time memory footprint, active embedding model telemetry, and an **Interactive Embedding Test Bench** to test BGE-M3 vector generation live on any phrase.
- **Pillar 3: Real-Time Engine Telemetry Cockpit**: Live status indicators for PostgreSQL connectivity, Vector DB backend, Hugging Face API, and LLM inference.
- **Automated Ingestion Pipeline**: Drag-and-drop Negarit Gazette PDF uploader with live extraction, segmentation, and vectorization status.

---

## 🔬 Tri-Tier Retrieval Architecture

```
User Legal Query (Amharic or English)
        │
        ├──▶ 1. Exact Match Router (e.g. Proclamation "1396/2025", "Article 3", "አንቀጽ 3")
        │
        ├──▶ 2. Sparse Keyword Search: Unicode-Aware BM25 (Ethiopic script compatible)
        │
        └──▶ 3. Dense Cross-Lingual Vector Search: BAAI/bge-m3 (1024-dim, Qdrant/Postgres)
        │
        ▼
Reciprocal Rank Fusion (RRF, k=60)
Score = Σ 1 / (60 + rank_bm25) + 1 / (60 + rank_dense)
        │
        ▼
Metadata & Enactment Status Reranker (Prioritizes IN_FORCE; applies jurisdiction filters)
        │
        ▼
Strict Grounded Generation (OpenRouter LLM) with [S#] Citation Grammars
        │
        ▼
PostgreSQL Citation Verification Guard (Confirms every cited chunk exists in database)
        │
        ▼
Answer Delivered with Interactive Verified Source Cards & Diagnostic Metrics
```

---

## ⚡ Quickstart

### Prerequisites
- Node.js 20+
- PostgreSQL 15+ (local instance or Docker)
- Optional: Hugging Face API Token (for BGE-M3 embeddings) & OpenRouter API Key (for LLM generation)

### 1. Clone & Install
```bash
git clone https://github.com/sight09/Negarit---.git
cd Negarit---
npm ci
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and configure your credentials:
```bash
cp .env.example .env
```

| Variable | Description | Default / Requirement |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:password@localhost:5432/legal_rag_db` (Required) |
| `HF_TOKEN` | Hugging Face token for `BAAI/bge-m3` | Recommended (falls back to BM25 if missing) |
| `OPENROUTER_API_KEY` | OpenRouter API Key for LLM synthesis | Recommended (falls back to verbatim excerpts) |
| `LLM_MODEL` | Generator model ID | `google/gemini-2.0-flash-001` or `anthropic/claude-3.5-sonnet` |
| `QDRANT_URL` | Qdrant REST Endpoint | Optional (falls back to PostgreSQL pgvector) |

### 3. Push Database Schema
```bash
npm run db:push
```

### 4. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the Negarit research console.

---

## 🐳 Docker Deployment

To spin up the complete stack (Next.js app + PostgreSQL + Qdrant) via Docker:

```bash
docker compose up --build
```

---

## 📥 Ingesting Your First Legal Document

The corpus ships intentionally empty to avoid fabricated text. To ingest the landmark **Ethiopian Startup Proclamation No. 1396/2025**:

### Via the Admin Web Console:
1. Open [http://localhost:3000/admin](http://localhost:3000/admin).
2. Under **"Upload legal document"**, choose your Negarit Gazette PDF.
3. Enter metadata:
   - **Title**: `Ethiopian Startup Proclamation`
   - **Proclamation Number**: `1396/2025`
   - **Jurisdiction**: `Federal`
   - **Category**: `Startup / Business`
   - **Status**: `IN_FORCE`
4. Click **"Upload & ingest"** and watch the live progress bar.

### Via the CLI:
```bash
node scripts/ingest.mjs corpus/federal/startup-proclamation-1396-2025.pdf \
  --title "Ethiopian Startup Proclamation" \
  --proc 1396/2025 \
  --category startup \
  --status IN_FORCE \
  --jurisdiction federal \
  --language bilingual \
  --source "Federal Negarit Gazette"
```

---

## 📊 Automated Evaluation Harness

Negarit includes an automated evaluation harness testing **175 curated legal questions** across five categories:
- 50 English Legal Queries
- 50 Amharic Legal Queries
- 25 Cross-Language Inquiries
- 25 Exact Article/Proclamation Lookups
- 25 Historical & Amendment Probes

To run the automated evaluation suite against a running instance:

```bash
npm run eval
```

Metrics evaluated:
- **Recall@5 & Recall@10**
- **Mean Reciprocal Rank (MRR)**
- **Citation Accuracy** (100% verified against PostgreSQL chunk IDs)
- **Groundedness Ratio**
- **Language Consistency & Script Fidelity**
- **Refusal Honesty Ratio** (Honest refusal when asked for unindexed provisions)

---

## 🛡️ Graceful Degradation by Design

Negarit is built to be resilient in real-world infrastructure constraints:

- **Missing HF_TOKEN:** Ingestion skips vector generation and operates purely on Unicode-aware BM25 keyword search.
- **Missing LLM Key:** Synthesizer serves verbatim extracted legal text with full citation cards and page numbers intact.
- **Qdrant Down:** Automatically falls back to PostgreSQL pgvector cosine similarity search.
- **Scanned Image PDFs:** Ingestion pipeline flags PDFs lacking digital text layers as `OCR_REQUIRED` rather than indexing garbage.

---

## 📂 Project Directory Structure

```
├── corpus/federal/            # Directory for official Negarit Gazette PDFs
├── docs/                      # Technical specifications & legal context
│   ├── ARCHITECTURE.md        # Deep-dive system architecture
│   ├── API_REFERENCE.md       # REST API documentation
│   └── ETHIOPIAN_LEGAL_SYSTEM_CONTEXT.md # Jurisdictional framework
├── evaluation/                # 175-question automated evaluation dataset
├── public/                    # Logos, SVG assets, and icons
├── scripts/                   # CLI ingestion, reindexing, and evaluation
├── src/
│   ├── app/                   # Next.js App Router (pages & API routes)
│   ├── components/            # UI components (Sidebar, Console, Bento suite)
│   ├── db/                    # Drizzle ORM schema & PostgreSQL client
│   ├── lib/                   # Shared client utilities, i18n, types
│   └── server/                # Backend service layer
│       ├── citations/         # PostgreSQL citation verification guard
│       ├── embeddings/        # BGE-M3 Hugging Face inference & caching
│       ├── ingestion/         # PDF extraction, Ethiopic segmentation, chunking
│       ├── llm/               # Grounded OpenRouter synthesis
│       ├── rag/               # Orchestration pipeline & confidence scoring
│       └── retrieval/         # Exact routing, BM25, Qdrant & RRF fusion
└── JUDGES_GUIDE.md            # Dedicated evaluation guide for competition judges
```

---

## ⚖️ Citation & Academic Attribution

If you utilize Negarit in your research or legal technology development, please cite:

```bibtex
@software{negarit2026,
  author = {Negarit Project Team},
  title = {Negarit: Bilingual (Amharic/English) Ethiopian Legal Research AI},
  year = {2026},
  url = {https://github.com/sight09/Negarit---}
}
```
