/** Client-side mirrors of the API contracts (never import server modules). */

export interface SourceCard {
  ref: string;
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
  route: string;
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
  route: string;
  mode: "quick" | "research" | "compare";
  confidence: "STRONG" | "MODERATE" | "INSUFFICIENT";
  confidenceBasis: string;
  answered: boolean;
  notices: string[];
  sources: SourceCard[];
  retrieval: RetrievalStats;
  sessionId: string;
  relatedDocuments: {
    documentId: string;
    title: string;
    proclamationNumber?: string | null;
    status: string;
    relation?: string | null;
  }[];
}

export interface JobRow {
  id: string;
  documentId: string;
  status: string;
  stage: string;
  progress: number;
  error: string | null;
  log: { ts: string; stage: string; message: string; level?: string }[] | null;
  stats: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentRow {
  id: string;
  slug: string;
  title: string;
  titleAm: string | null;
  documentType: string;
  proclamationNumber: string | null;
  gazetteName: string | null;
  gazetteNumber: string | null;
  category: string;
  jurisdiction: string;
  language: string;
  status: string;
  publicationDate: string | null;
  effectiveDate: string | null;
  source: string | null;
  sourceUrl: string | null;
  sourceType: string;
  sha256: string;
  filename: string | null;
  pageCount: number | null;
  extractionMethod: string | null;
  ocrQuality: number | null;
  notes: string | null;
  amends: string | null;
  repeals: string | null;
  createdAt: string;
  updatedAt: string;
  chunkCount?: number;
  latestJob?: JobRow | null;
  articles?: {
    id: string;
    articleNumber: string;
    title: string | null;
    pageAm: number | null;
    pageEn: number | null;
    textAm: string | null;
    textEn: string | null;
  }[];
  jobs?: JobRow[];
  versions?: unknown[];
  relationships?: {
    id: string;
    relationType: string;
    direction: string;
    note: string | null;
    other: { id: string; title: string; proclamationNumber: string | null; status: string } | null;
  }[];
}

export interface ChunkRow {
  id: string;
  articleNumber: string | null;
  subArticle: string | null;
  part: string | null;
  chapter: string | null;
  language: string;
  page: number | null;
  charCount: number;
  hasEmbedding: boolean;
  text: string;
}

export interface HealthStatus {
  ok: boolean;
  subsystems: {
    database: boolean;
    qdrant: string;
    embeddings: string;
    llm: string;
  };
  stats: { documents: number; chunks: number; embeddedChunks: number; articles: number };
}

export interface Analytics {
  totals: Record<string, number>;
  byStatus: { key: string | null; count: number }[];
  byJurisdiction: { key: string | null; count: number }[];
  byCategory: { key: string | null; count: number }[];
  byLanguage: { key: string | null; count: number }[];
  byType: { key: string | null; count: number }[];
  jobs: unknown[];
}

export interface SourceDetail {
  chunk: {
    id: string;
    documentId: string;
    articleNumber: string | null;
    subArticle: string | null;
    part: string | null;
    chapter: string | null;
    language: string;
    text: string;
    page: number | null;
    extractionMethod: string | null;
  };
  pair: SourceDetail["chunk"] | null;
  siblings: { id: string; language: string; page: number | null; subArticle: string | null }[];
  document: {
    id: string;
    title: string;
    titleAm: string | null;
    proclamationNumber: string | null;
    documentType: string;
    jurisdiction: string;
    category: string;
    status: string;
    language: string;
    publicationDate: string | null;
    effectiveDate: string | null;
    source: string | null;
    sourceUrl: string | null;
    sourceType: string;
    gazetteName: string | null;
    gazetteNumber: string | null;
    pageCount: number | null;
    extractionMethod: string | null;
    amends: string | null;
    repeals: string | null;
  } | null;
}

export interface SearchResult {
  documents: {
    id: string;
    title: string;
    proclamationNumber: string | null;
    documentType: string;
    category: string;
    jurisdiction: string;
    status: string;
    language: string;
    publicationDate: string | null;
    source: string | null;
  }[];
  chunks: {
    chunkId: string;
    documentId: string;
    title: string | null;
    proclamationNumber: string | null;
    article: string | null;
    page: number | null;
    language: string;
    status: string | null;
    score: number;
    excerpt: string;
  }[];
  counts: { documents: number; chunks: number };
}
