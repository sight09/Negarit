/**
 * Central configuration. All secrets are read from the environment and are
 * NEVER exposed to the client bundle (no NEXT_PUBLIC_ prefix).
 */
import path from "path";

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  embeddings: {
    hfToken: process.env.HF_TOKEN ?? "",
    model: process.env.HF_MODEL ?? "BAAI/bge-m3",
    dims: 1024,
    batchSize: 24,
    maxCharsPerInput: 1800,
    get configured(): boolean {
      return this.hfToken.length > 0;
    },
  },
  llm: {
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    model: process.env.LLM_MODEL ?? "",
    baseUrl: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    get configured(): boolean {
      return this.apiKey.length > 0 && this.model.length > 0;
    },
  },
  qdrant: {
    url: (process.env.QDRANT_URL ?? "").replace(/\/$/, ""),
    apiKey: process.env.QDRANT_API_KEY ?? "",
    collection: process.env.QDRANT_COLLECTION ?? "ethiopian_legal_chunks",
    get configured(): boolean {
      return this.url.length > 0;
    },
  },
  retrieval: {
    topK: Math.max(4, int("RETRIEVE_TOP_K", 20)),
    rerankK: Math.min(8, Math.max(3, int("RERANK_TOP_K", 6))),
    contextChunks: Math.min(10, Math.max(3, int("CONTEXT_CHUNKS", 6))),
    strongScore: Number(process.env.CONFIDENCE_STRONG ?? 0.55),
    moderateScore: Number(process.env.CONFIDENCE_MODERATE ?? 0.32),
  },
  uploads: {
    dir: process.env.UPLOAD_DIR ?? path.join(process.cwd(), "data", "uploads"),
    maxMb: int("MAX_UPLOAD_MB", 25),
  },
  adminToken: process.env.ADMIN_TOKEN ?? "",
} as const;

export const LEGAL_STATUSES = [
  "IN_FORCE",
  "AMENDED",
  "REPEALED",
  "SUPERSEDED",
  "HISTORICAL",
  "UNKNOWN",
] as const;

export const CURRENT_STATUSES = ["IN_FORCE", "AMENDED"] as const;
export const HISTORICAL_STATUSES = ["REPEALED", "SUPERSEDED", "HISTORICAL"] as const;

export const DOCUMENT_TYPES = [
  "constitution",
  "proclamation",
  "regulation",
  "directive",
  "code",
  "treaty",
  "other",
] as const;

export const JURISDICTIONS = [
  "federal",
  "oromia",
  "amhara",
  "tigray",
  "somali",
  "afar",
  "sidama",
  "benishangul_gumuz",
  "gambela",
  "harari",
  "snnpr",
  "south_west",
  "central_ethiopia",
  "dire_dawa",
  "addis_ababa",
] as const;

export const CATEGORIES = [
  "constitution", "civil", "criminal", "criminal_procedure", "commercial",
  "business", "labor", "family", "land", "property", "tax", "customs",
  "banking", "finance", "insurance", "investment", "startup", "technology",
  "cybersecurity", "data_protection", "telecommunications",
  "intellectual_property", "environment", "health", "education",
  "agriculture", "mining", "energy", "transport", "procurement",
  "public_finance", "administrative", "elections", "human_rights",
  "immigration", "citizenship", "treaties", "other",
] as const;

export const RELATION_TYPES = [
  "AMENDS", "REPEALS", "REPLACES", "IMPLEMENTS", "RELATED_TO", "REGULATES", "DERIVED_FROM",
] as const;
