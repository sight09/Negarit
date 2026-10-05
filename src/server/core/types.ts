import { z } from "zod";

/** Shared API contracts (mirror of backend/app/schemas in a FastAPI layout). */

export type QueryRoute =
  | "GENERAL_LEGAL_QUESTION"
  | "DOCUMENT_LOOKUP"
  | "ARTICLE_LOOKUP"
  | "PROCLAMATION_LOOKUP"
  | "CURRENT_LAW"
  | "HISTORICAL_LAW"
  | "COMPARISON"
  | "TRANSLATION"
  | "DEFINITION"
  | "UNKNOWN";

export type Confidence = "STRONG" | "MODERATE" | "INSUFFICIENT";

export const searchFiltersSchema = z.object({
  language: z.string().optional(),
  jurisdiction: z.string().optional(),
  category: z.string().optional(),
  status: z.string().optional(),
  documentType: z.string().optional(),
  year: z.string().optional(),
  proclamationNumber: z.string().optional(),
  source: z.string().optional(),
});
export type SearchFilters = z.infer<typeof searchFiltersSchema>;

export const chatRequestSchema = z.object({
  question: z.string().min(2).max(4000),
  sessionId: z.string().uuid().optional(),
  mode: z.enum(["quick", "research", "compare"]).default("quick"),
  filters: searchFiltersSchema.optional(),
  answerLanguage: z.enum(["auto", "am", "en"]).default("auto"),
  skipLlm: z.boolean().default(false), // used by the evaluation harness
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export interface SourceCard {
  ref: string; // S1, S2, ... as injected into the LLM context
  chunkId: string;
  documentId: string;
  slug: string;
  title: string;
  titleAm?: string | null;
  proclamationNumber?: string | null;
  documentType: string;
  article?: string | null;
  subArticle?: string | null;
  part?: string | null;
  chapter?: string | null;
  page?: number | null;
  language: string;
  pairedLanguage?: string | null;
  pairedChunkId?: string | null;
  jurisdiction: string;
  category: string;
  status: string;
  publicationDate?: string | null;
  source?: string | null;
  sourceUrl?: string | null;
  extractionMethod?: string | null;
  score: number;
  excerpt: string;
  hasEmbedding: boolean;
}

export interface RetrievalStats {
  route: QueryRoute;
  detectedLanguage: "am" | "en";
  vectorResults: number;
  keywordResults: number;
  fusedResults: number;
  rerankedResults: number;
  topScore: number;
  vectorBackend: "qdrant" | "postgres" | "none";
  denseEnabled: boolean;
  latencyMs: number;
  llmLatencyMs: number | null;
  searchesPerformed: string[];
  filtersApplied: Record<string, string>;
}

export interface ChatResponse {
  answer: string;
  language: "am" | "en";
  route: QueryRoute;
  mode: "quick" | "research" | "compare";
  confidence: Confidence;
  confidenceBasis: string;
  answered: boolean;
  notices: string[];
  sources: SourceCard[];
  retrieval: RetrievalStats;
  sessionId: string;
  relatedDocuments: RelatedDocument[];
}

export interface RelatedDocument {
  documentId: string;
  title: string;
  proclamationNumber?: string | null;
  status: string;
  relation?: string | null;
}

export interface ScoredChunk {
  id: string;
  documentId: string;
  articleId?: string | null;
  articleNumber?: string | null;
  subArticle?: string | null;
  part?: string | null;
  chapter?: string | null;
  language: string;
  text: string;
  page?: number | null;
  documentTitle?: string | null;
  documentType?: string | null;
  proclamationNumber?: string | null;
  jurisdiction?: string | null;
  category?: string | null;
  docStatus?: string | null;
  publicationDate?: string | null;
  source?: string | null;
  extractionMethod?: string | null;
  dense: number; // cosine similarity 0..1 (0 when dense disabled)
  bm25: number; // normalized 0..1
  score: number; // fused + reranked score
  hasEmbedding: boolean;
}

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 500,
  ) {
    super(message);
  }
}
