import { and, eq, ilike, inArray, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { chunks, documents } from "@/db/schema";
import { config, HISTORICAL_STATUSES } from "@/server/core/config";
import type { QueryRoute, ScoredChunk, SearchFilters } from "@/server/core/types";
import { cosineSimilarity } from "@/server/embeddings/huggingface";
import { BM25Index } from "./bm25";
import { qdrantStatus, searchQdrant } from "./qdrant";

/**
 * Hybrid retrieval (mirrors backend/app/retrieval):
 * language detection → query routing → exact legal-identifier lookup →
 * dense vector search (Qdrant or PostgreSQL fallback) + BM25 →
 * Reciprocal Rank Fusion → status preference → heuristic reranking.
 */

const ETHIOPIC = /[ሀ-፟ᎀ-᎟ⶀ-ⷞꬁ-꬯]/;

export function detectLanguage(text: string): "am" | "en" {
  const matches = text.match(new RegExp(ETHIOPIC.source, "g")) ?? [];
  const letters = text.replace(/[\s\d\p{P}]/gu, "").length || 1;
  return matches.length >= 2 || matches.length / letters > 0.1 ? "am" : "en";
}

export interface RoutedQuery {
  route: QueryRoute;
  proclamationNumber: string | null;
  articleNumber: string | null;
  year: string | null;
  wantsHistorical: boolean;
  wantsComparison: boolean;
  wantsCurrent: boolean;
}

export function routeQuery(question: string): RoutedQuery {
  const procMatch = question.match(/(\d{1,4})\s*\/\s*(\d{2,4})/);
  const proclamationNumber = procMatch ? `${procMatch[1]}/${procMatch[2]}` : null;
  const articleMatch =
    question.match(/article\s+([0-9]{1,3})\b/i) ?? question.match(/አንቀጽ\s*([0-9]{1,3})/);
  const articleNumber = articleMatch ? articleMatch[1] : null;
  const standaloneYear = question.match(/\b(19|20)\d{2}\b/);

  const wantsHistorical =
    /\b(repealed|superseded|former|previous|historical|old law|in \d{4}|as of|prior to)\b/i.test(
      question,
    ) || /(ተሽሯል|አሮጌ|ቀደም|ያለፈው)/.test(question);
  const wantsComparison =
    /\b(compare|comparison|versus|vs\.?|difference between|contrast)\b/i.test(question) ||
    /(አወዳድር|ልዩነት|ንጽጽር)/.test(question);
  const wantsCurrent =
    /\b(current|currently|in force|existing|today|now|latest|applicable)\b/i.test(question) ||
    /(አሁን|ወቅታዊ|የአሁኑ|ትክክለኛ)/.test(question);

  let route: QueryRoute = "GENERAL_LEGAL_QUESTION";
  if (proclamationNumber && articleNumber) route = "ARTICLE_LOOKUP";
  else if (proclamationNumber && /what is|about|show|ማንበብ|ምንድን|ያሳይ/i.test(question))
    route = "PROCLAMATION_LOOKUP";
  else if (proclamationNumber) route = "DOCUMENT_LOOKUP";
  else if (articleNumber && wantsComparison === false) route = "GENERAL_LEGAL_QUESTION";
  if (!proclamationNumber) {
    if (wantsComparison) route = "COMPARISON";
    else if (wantsHistorical) route = "HISTORICAL_LAW";
    else if (/^(what is|define|definition of)\b|ምንድነው\??$|ምንድን ነው/i.test(question.trim()))
      route = "DEFINITION";
    else if (wantsCurrent) route = "CURRENT_LAW";
  } else if (wantsComparison) {
    route = "COMPARISON";
  }

  return {
    route,
    proclamationNumber,
    articleNumber,
    year: standaloneYear ? standaloneYear[0] : null,
    wantsHistorical,
    wantsComparison,
    wantsCurrent,
  };
}

export type StatusMode = "current" | "historical" | "all" | "compare";

/**
 * Base-filtered candidate chunks. For "current" we EXCLUDE repealed /
 * superseded / historical provisions rather than mixing them in.
 */
async function loadCandidates(
  filters: SearchFilters | undefined,
  mode: StatusMode,
): Promise<(typeof chunks.$inferSelect)[]> {
  const where: SQL[] = [];
  if (mode === "current") {
    // exclude explicitly historical statuses (UNKNOWN stays, ranked lower later)
    const historical = HISTORICAL_STATUSES as unknown as string[];
    where.push(
      // drizzle lacks notInArray on some versions — use sql fragment-safe approach
      inArray(chunks.docStatus, ["IN_FORCE", "AMENDED", "UNKNOWN"]),
    );
    void historical;
  }
  if (filters?.language && filters.language !== "any") where.push(eq(chunks.language, filters.language));
  if (filters?.jurisdiction && filters.jurisdiction !== "any") where.push(eq(chunks.jurisdiction, filters.jurisdiction));
  if (filters?.category && filters.category !== "any") where.push(eq(chunks.category, filters.category));
  if (filters?.documentType && filters.documentType !== "any") where.push(eq(chunks.documentType, filters.documentType));
  if (filters?.status && filters.status !== "any") where.push(eq(chunks.docStatus, filters.status));
  if (filters?.proclamationNumber)
    where.push(
      ilike(chunks.proclamationNumber, `%${filters.proclamationNumber.replace(/\s+/g, "")}%`),
    );
  if (filters?.year) where.push(ilike(chunks.publicationDate, `%${filters.year}%`));
  if (filters?.source) where.push(ilike(chunks.source, `%${filters.source}%`));
  return db
    .select()
    .from(chunks)
    .where(where.length ? and(...where) : undefined)
    .limit(6000);
}

export interface HybridResult {
  results: ScoredChunk[];
  vectorCount: number;
  bm25Count: number;
  fusedCount: number;
  backend: "qdrant" | "postgres" | "none";
  denseEnabled: boolean;
  searchesPerformed: string[];
}

function toScored(row: typeof chunks.$inferSelect): ScoredChunk {
  return {
    id: row.id,
    documentId: row.documentId,
    articleId: row.articleId,
    articleNumber: row.articleNumber,
    subArticle: row.subArticle,
    part: row.part,
    chapter: row.chapter,
    language: row.language,
    text: row.text,
    page: row.page,
    documentTitle: row.documentTitle,
    documentType: row.documentType,
    proclamationNumber: row.proclamationNumber,
    jurisdiction: row.jurisdiction,
    category: row.category,
    docStatus: row.docStatus,
    publicationDate: row.publicationDate,
    source: row.source,
    extractionMethod: row.extractionMethod,
    dense: 0,
    bm25: 0,
    score: 0,
    hasEmbedding: Array.isArray(row.embedding),
  };
}

export async function hybridRetrieve(params: {
  question: string;
  queryVector: number[] | null;
  filters?: SearchFilters;
  mode: StatusMode;
  questionLanguage: "am" | "en";
  routed: RoutedQuery;
}): Promise<HybridResult> {
  const { question, queryVector, filters, mode, questionLanguage, routed } = params;
  const searchesPerformed: string[] = [];
  const candidates = await loadCandidates(filters, mode);
  const byId = new Map(candidates.map((c) => [c.id, c]));

  // ── Dense retrieval ────────────────────────────────────────────────────
  const denseRanked: { id: string; score: number }[] = [];
  let backend: HybridResult["backend"] = "none";
  if (queryVector) {
    const qstat = await qdrantStatus();
    const payloadFilter: Record<string, string | undefined> = {
      language: filters?.language !== "any" ? filters?.language : undefined,
      jurisdiction: filters?.jurisdiction !== "any" ? filters?.jurisdiction : undefined,
      category: filters?.category !== "any" ? filters?.category : undefined,
      document_type: filters?.documentType !== "any" ? filters?.documentType : undefined,
      doc_status: filters?.status !== "any" ? filters?.status : undefined,
      proclamation_number: filters?.proclamationNumber?.replace(/\s+/g, ""),
    };
    if (mode === "current" && !filters?.status) payloadFilter.doc_status = undefined; // handled in rerank
    let hits = qstat === "up" ? await searchQdrant(queryVector, payloadFilter, config.retrieval.topK) : null;
    if (hits && hits.length > 0) {
      backend = "qdrant";
      searchesPerformed.push("dense:qdrant");
      for (const hit of hits) {
        const id = String(hit.payload.chunk_id ?? hit.id);
        if (byId.has(id)) denseRanked.push({ id, score: Math.max(0, hit.score) });
      }
    }
    if (denseRanked.length === 0) {
      backend = "postgres";
      searchesPerformed.push("dense:postgres-cosine");
      for (const row of candidates) {
        if (!Array.isArray(row.embedding)) continue;
        const sim = cosineSimilarity(queryVector, row.embedding as number[]);
        if (sim > 0.05) denseRanked.push({ id: row.id, score: sim });
      }
      denseRanked.sort((a, b) => b.score - a.score);
      denseRanked.splice(config.retrieval.topK);
    }
  }

  // ── Sparse retrieval (BM25) ────────────────────────────────────────────
  searchesPerformed.push("sparse:bm25");
  const bm25 = new BM25Index(
    candidates.map((c) => ({ id: c.id, text: `${c.documentTitle ?? ""} ${c.text}` })),
  );
  const bm25Ranked = bm25.search(question, config.retrieval.topK);

  // ── Reciprocal Rank Fusion ─────────────────────────────────────────────
  searchesPerformed.push("fusion:rrf(k=60)");
  const RRF_K = 60;
  const fused = new Map<string, number>();
  denseRanked.forEach((hit, rank) => {
    fused.set(hit.id, (fused.get(hit.id) ?? 0) + 1 / (RRF_K + rank + 1));
  });
  bm25Ranked.forEach((hit, rank) => {
    fused.set(hit.id, (fused.get(hit.id) ?? 0) + 0.9 / (RRF_K + rank + 1));
  });

  const maxBm25 = bm25Ranked[0]?.score ?? 1;
  const results: ScoredChunk[] = [];
  for (const [id, rrf] of fused) {
    const row = byId.get(id);
    if (!row) continue;
    const scored = toScored(row);
    scored.dense = denseRanked.find((d) => d.id === id)?.score ?? 0;
    const bm25raw = bm25Ranked.find((b) => b.id === id)?.score ?? 0;
    scored.bm25 = maxBm25 > 0 ? bm25raw / maxBm25 : 0;

    // Metadata-aware reranking signals.
    let boost = 1;
    if (mode === "current" && (row.docStatus === "IN_FORCE" || row.docStatus === "AMENDED")) boost *= 1.15;
    if (row.docStatus === "UNKNOWN") boost *= 0.85;
    if (mode === "historical" && HISTORICAL_STATUSES.includes(row.docStatus as never)) boost *= 1.15;
    if (
      routed.proclamationNumber &&
      (row.proclamationNumber ?? "").replace(/\s+/g, "") === routed.proclamationNumber
    )
      boost *= 1.3;
    if (routed.articleNumber && row.articleNumber === routed.articleNumber) boost *= 1.25;
    if (row.language === questionLanguage) boost *= 1.08; // prefer question language, keep cross-lingual
    scored.score = rrf * boost;
    results.push(scored);
  }
  searchesPerformed.push("rerank:metadata-signals(status/exact/language)");
  results.sort((a, b) => b.score - a.score);
  const top = results.slice(0, config.retrieval.rerankK);

  // Normalize fused scores into a human-meaningful 0..1 scale for confidence.
  if (top.length > 0) {
    const best = top[0].score;
    for (const r of top) {
      const rrfNorm = best > 0 ? r.score / best : 0;
      r.score = 0.55 * rrfNorm + 0.3 * Math.min(1, r.dense) + 0.15 * r.bm25;
    }
    top.sort((a, b) => b.score - a.score);
  }

  return {
    results: top,
    vectorCount: denseRanked.length,
    bm25Count: bm25Ranked.length,
    fusedCount: fused.size,
    backend,
    denseEnabled: queryVector !== null,
    searchesPerformed,
  };
}

/** Exact proclamation lookup — never routed through semantic search first. */
export async function exactProclamationLookup(proclamationNumber: string) {
  const needle = proclamationNumber.replace(/\s+/g, "");
  return db
    .select()
    .from(documents)
    .where(ilike(documents.proclamationNumber, `%${needle}%`))
    .limit(5);
}

export async function exactArticleChunks(documentId: string, articleNumber: string, limit = 6) {
  return db
    .select()
    .from(chunks)
    .where(and(eq(chunks.documentId, documentId), eq(chunks.articleNumber, articleNumber)))
    .limit(limit);
}
