# 📡 Negarit (ነጋሪት) — REST API Reference

The Negarit platform exposes a production REST API built with Next.js App Router route handlers. All responses are in JSON format.

---

## Base URL
```
http://localhost:3000/api
```

---

## Authentication & Headers

| Header | Type | Description |
|---|---|---|
| `Content-Type` | string | `application/json` (or `multipart/form-data` for uploads) |
| `x-admin-token` | string | Optional; required for mutating admin operations if `ADMIN_TOKEN` is set in `.env` |

---

## 1. Grounded Legal Chat

### `POST /api/chat`
Answers a legal research question strictly from indexed legal documents with validated citations.

#### Request Body
```json
{
  "question": "What is the scope of application of the Startup Proclamation?",
  "sessionId": "optional-uuid",
  "mode": "research",
  "filters": {
    "jurisdiction": "federal",
    "status": "IN_FORCE",
    "category": "startup",
    "language": "en"
  },
  "skipLlm": false
}
```

#### Response (`200 OK`)
```json
{
  "answer": "According to Article 3 of the Ethiopian Startup Proclamation No. 1396/2025 [S1], the proclamation applies to innovative businesses established in Ethiopia that have obtained startup recognition...",
  "confidence": "STRONG",
  "confidenceBasis": "Exact proclamation match (1396/2025) and top fused RRF score 0.032 with 4 corroborating chunks.",
  "citations": [
    {
      "ref": 1,
      "chunkId": "c47f9b2e-...",
      "title": "Ethiopian Startup Proclamation",
      "proclamationNumber": "1396/2025",
      "article": "3",
      "subArticle": "1",
      "page": 4,
      "language": "en",
      "status": "IN_FORCE",
      "pairedLanguage": "am"
    }
  ],
  "retrieval": {
    "vectorResults": 20,
    "keywordResults": 14,
    "fusedResults": 6,
    "topScore": 0.0321,
    "vectorBackend": "postgres",
    "denseEnabled": true,
    "detectedLanguage": "en"
  }
}
```

---

## 2. Hybrid Search

### `POST /api/search`
Retrieves raw grounded chunks matching a query using BM25 and BGE-M3 vector fusion without generating an LLM answer.

#### Request Body
```json
{
  "query": "tax incentive for recognized startup",
  "limit": 10,
  "filters": {
    "jurisdiction": "federal",
    "status": "IN_FORCE"
  }
}
```

#### Response (`200 OK`)
```json
{
  "chunks": [
    {
      "id": "c47f9b2e-...",
      "text": "Article 12: Tax Incentives. Recognized startups shall be entitled to...",
      "score": 0.0315,
      "article": "12",
      "proclamationNumber": "1396/2025",
      "page": 8,
      "language": "en"
    }
  ],
  "total": 1
}
```

---

## 3. Subsystem Health Diagnostics

### `GET /api/health`
Returns real-time status of all backend subsystems. Always returns HTTP 200 with clear diagnostics.

#### Response (`200 OK`)
```json
{
  "status": "HEALTHY",
  "timestamp": "2026-10-23T23:00:00.000Z",
  "database": {
    "connected": true,
    "latencyMs": 4
  },
  "vectorDb": {
    "backend": "postgres",
    "qdrantConnected": false,
    "fallbackActive": true
  },
  "embeddings": {
    "model": "BAAI/bge-m3",
    "hfTokenConfigured": true
  },
  "llm": {
    "configured": true,
    "model": "google/gemini-2.0-flash-001"
  },
  "stats": {
    "documents": 1,
    "articles": 38,
    "chunks": 76
  }
}
```

---

## 4. Document Management & Ingestion

### `GET /api/documents`
Lists all legal documents registered in the corpus with their latest ingestion job status.

### `POST /api/documents`
Uploads a Federal Negarit Gazette PDF with legal metadata.

#### Request (`multipart/form-data`)
- `file`: PDF file binary (max 25MB).
- `title`: string (e.g. `Ethiopian Startup Proclamation`).
- `proclamationNumber`: string (e.g. `1396/2025`).
- `jurisdiction`: string (`federal`, `oromia`, `amhara`, etc.).
- `category`: string (`startup`, `labor`, `tax`, `commercial`, etc.).
- `status`: string (`IN_FORCE`, `AMENDED`, `REPEALED`, `SUPERSEDED`, `HISTORICAL`).
- `language`: string (`bilingual`, `am`, `en`).

---

## 5. Chunk Explorer & Bilingual Source Lookup

### `GET /api/documents/{id}/chunks`
Lists segmented chunks for a specific document with optional search filter and pagination.

### `GET /api/sources/{chunkId}`
Fetches the full text of a chunk and automatically retrieves its paired bilingual counterpart (e.g. Amharic text corresponding to an English article).

#### Response (`200 OK`)
```json
{
  "chunk": {
    "id": "c47f9b2e-...",
    "text": "Article 3: Scope of Application...",
    "language": "en",
    "article": "3",
    "page": 4
  },
  "pairedChunk": {
    "id": "a18e3d12-...",
    "text": "አንቀጽ 3: የተፈፃሚነት ወሰን...",
    "language": "am",
    "article": "3",
    "page": 4
  }
}
```

---

## 6. Live Embedding Test Bench

### `POST /api/embeddings`
Allows administrators and judges to test the BGE-M3 embedding model directly.

#### Request Body
```json
{
  "text": "አዋጅ ቁጥር 1396/2025"
}
```

#### Response (`200 OK`)
```json
{
  "dimensions": 1024,
  "model": "BAAI/bge-m3",
  "firstFiveValues": [0.0234, -0.0512, 0.0891, -0.0123, 0.0456],
  "cached": true
}
```
