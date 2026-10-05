import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Ethiopian Legal RAG — relational schema.
 * PostgreSQL is the system of record for all legal metadata.
 * Qdrant (optional) mirrors chunk vectors; `chunks.embedding` keeps a local
 * copy so the system degrades gracefully when Qdrant is unavailable.
 */

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    titleAm: text("title_am"),
    documentType: text("document_type").notNull().default("proclamation"),
    proclamationNumber: text("proclamation_number"),
    gazetteName: text("gazette_name"),
    gazetteNumber: text("gazette_number"),
    category: text("category").notNull().default("other"),
    jurisdiction: text("jurisdiction").notNull().default("federal"),
    language: text("language").notNull().default("bilingual"), // am | en | bilingual
    status: text("status").notNull().default("UNKNOWN"),
    publicationDate: text("publication_date"),
    effectiveDate: text("effective_date"),
    source: text("source"),
    sourceUrl: text("source_url"),
    sourceType: text("source_type").notNull().default("PRIMARY"),
    sourcePriority: integer("source_priority").notNull().default(1),
    sha256: text("sha256").notNull().unique(),
    filename: text("filename"),
    filePath: text("file_path"),
    pageCount: integer("page_count"),
    extractionMethod: text("extraction_method"), // TEXT_LAYER | OCR | MANUAL
    ocrQuality: real("ocr_quality"),
    notes: text("notes"),
    amends: text("amends"), // free-form references captured from admin form
    repeals: text("repeals"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_documents_status").on(t.status),
    index("idx_documents_jurisdiction").on(t.jurisdiction),
    index("idx_documents_category").on(t.category),
    index("idx_documents_proc_number").on(t.proclamationNumber),
  ],
);

export const documentVersions = pgTable("document_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  versionLabel: text("version_label").notNull().default("original"),
  status: text("status").notNull().default("IN_FORCE"),
  publicationDate: text("publication_date"),
  effectiveDate: text("effective_date"),
  sha256: text("sha256"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const articles = pgTable(
  "articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    articleNumber: text("article_number").notNull(),
    title: text("title"),
    textAm: text("text_am"),
    textEn: text("text_en"),
    pageAm: integer("page_am"),
    pageEn: integer("page_en"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_articles_doc_number").on(t.documentId, t.articleNumber),
    index("idx_articles_doc").on(t.documentId),
  ],
);

export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    articleId: uuid("article_id").references(() => articles.id, {
      onDelete: "set null",
    }),
    articleNumber: text("article_number"),
    subArticle: text("sub_article"),
    part: text("part"),
    chapter: text("chapter"),
    language: text("language").notNull().default("en"),
    text: text("text").notNull(),
    page: integer("page"),
    charCount: integer("char_count").notNull().default(0),
    tokenEstimate: integer("token_estimate").notNull().default(0),
    // Denormalized legal metadata so retrieval can filter without joins.
    documentTitle: text("document_title"),
    documentType: text("document_type"),
    proclamationNumber: text("proclamation_number"),
    jurisdiction: text("jurisdiction"),
    category: text("category"),
    docStatus: text("doc_status"),
    publicationDate: text("publication_date"),
    source: text("source"),
    extractionMethod: text("extraction_method"),
    embedding: jsonb("embedding").$type<number[]>(),
    embeddingModel: text("embedding_model"),
    embeddedAt: timestamp("embedded_at"),
    contentHash: text("content_hash"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_chunks_doc").on(t.documentId),
    index("idx_chunks_article_number").on(t.articleNumber),
    index("idx_chunks_language").on(t.language),
    index("idx_chunks_status").on(t.docStatus),
    index("idx_chunks_jurisdiction").on(t.jurisdiction),
    index("idx_chunks_category").on(t.category),
  ],
);

export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull().default("PRIMARY"), // PRIMARY | SECONDARY
  priority: integer("priority").notNull().default(1),
  url: text("url"),
  retrievedAt: timestamp("retrieved_at").defaultNow(),
  notes: text("notes"),
});

export const legalRelationships = pgTable("legal_relationships", {
  id: uuid("id").primaryKey().defaultRandom(),
  fromDocumentId: uuid("from_document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  toDocumentId: uuid("to_document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  relationType: text("relation_type").notNull(), // AMENDS | REPEALS | REPLACES | IMPLEMENTS | RELATED_TO | REGULATES | DERIVED_FROM
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ingestionJobs = pgTable(
  "ingestion_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("QUEUED"),
    stage: text("stage").notNull().default("QUEUED"),
    progress: integer("progress").notNull().default(0),
    log: jsonb("log").$type<IngestionLogEntry[]>().default([]),
    error: text("error"),
    stats: jsonb("stats").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("idx_jobs_doc").on(t.documentId), index("idx_jobs_status").on(t.status)],
);

export const chatSessions = pgTable("chat_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title"),
  language: text("language").notNull().default("en"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant
    content: text("content").notNull(),
    language: text("language"),
    route: text("route"),
    confidence: text("confidence"),
    citations: jsonb("citations").$type<unknown[]>().default([]),
    sources: jsonb("sources").$type<unknown[]>().default([]),
    retrieval: jsonb("retrieval").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_messages_session").on(t.sessionId)],
);

export const retrievalLogs = pgTable("retrieval_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id"),
  question: text("question"),
  language: text("language"),
  route: text("route"),
  vectorCount: integer("vector_count").default(0),
  bm25Count: integer("bm25_count").default(0),
  fusedCount: integer("fused_count").default(0),
  rerankCount: integer("rerank_count").default(0),
  topScore: real("top_score"),
  vectorBackend: text("vector_backend"),
  latencyMs: integer("latency_ms"),
  llmLatencyMs: integer("llm_latency_ms"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const embeddingCache = pgTable("embedding_cache", {
  hash: text("hash").primaryKey(), // sha256(model + "\n" + text)
  model: text("model").notNull(),
  dims: integer("dims").notNull(),
  vector: jsonb("vector").$type<number[]>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export interface IngestionLogEntry {
  ts: string;
  stage: string;
  message: string;
  level?: "info" | "warn" | "error";
}
