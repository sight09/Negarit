import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  chatMessages,
  chatSessions,
  chunks,
  documents,
  legalRelationships,
  retrievalLogs,
} from "@/db/schema";
import { config } from "@/server/core/config";
import type {
  ChatRequest,
  ChatResponse,
  Confidence,
  RelatedDocument,
  SourceCard,
} from "@/server/core/types";
import { validateCitations } from "@/server/citations/validate";
import { embedText, embeddingsConfigured } from "@/server/embeddings/huggingface";
import { generateAnswer, llmConfigured } from "@/server/llm/openrouter";
import type { ScoredChunk } from "@/server/core/types";
import {
  detectLanguage,
  exactArticleChunks,
  exactProclamationLookup,
  hybridRetrieve,
  routeQuery,
  type StatusMode,
} from "@/server/retrieval/hybrid";

/**
 * RAG orchestration (mirrors backend/app/rag):
 * question → language detection → routing → (exact lookup | hybrid retrieval)
 * → status filtering → context assembly → grounded generation →
 * citation validation → persist session + retrieval log.
 */

const INSUFFICIENT = {
  en: "I could not find sufficient authoritative legal material in the current corpus to answer this reliably. No answer has been generated, because stating one would risk inventing a legal provision.",
  am: "በአሁኑ ማውጫ (ኮርፐስ) ውስጥ ይህን ጥያቄ በአስተማማኝ ሁኔታ ለመመለስ በቂ ባለሥልጣን የሕግ መረጃ ማግኘት አልቻልኩም። ሕጋዊ ድንጋጌን ከመፍጠር ለማስወገድ ምንም መልስ አልተሰራም።",
};

const NOT_INDEXED = (proc: string) => ({
  en: `Proclamation No. ${proc} is not currently indexed in this corpus. Upload the official gazette PDF through the admin console to make it searchable.`,
  am: `አዋጅ ቁጥር ${proc} በአሁኑ ማውጫ ውስጥ አልተካተተም። እባክዎ የኦፊሴላዊውን ጋዜጣ PDF በአድሚን ገጽ ይጫኑ።`,
});

function rowToChunk(row: typeof chunks.$inferSelect, score: number): ScoredChunk {
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
    score,
    hasEmbedding: Array.isArray(row.embedding),
  };
}

async function buildCards(selected: ScoredChunk[], questionLang: "am" | "en"): Promise<SourceCard[]> {
  const cards: SourceCard[] = [];
  for (let i = 0; i < selected.length; i++) {
    const c = selected[i];
    let pairedChunkId: string | null = null;
    let pairedLanguage: string | null = null;
    if (c.articleNumber) {
      const [pair] = await db
        .select({ id: chunks.id, language: chunks.language })
        .from(chunks)
        .where(
          and(
            eq(chunks.documentId, c.documentId),
            eq(chunks.articleNumber, c.articleNumber),
            ne(chunks.language, c.language),
          ),
        )
        .limit(1);
      if (pair) {
        pairedChunkId = pair.id;
        pairedLanguage = pair.language;
      }
    }
    cards.push({
      ref: `S${i + 1}`,
      chunkId: c.id,
      documentId: c.documentId,
      slug: "",
      title: c.documentTitle ?? "Untitled document",
      proclamationNumber: c.proclamationNumber,
      documentType: c.documentType ?? "proclamation",
      article: c.articleNumber,
      subArticle: c.subArticle,
      part: c.part,
      chapter: c.chapter,
      page: c.page,
      language: c.language,
      pairedLanguage,
      pairedChunkId,
      jurisdiction: c.jurisdiction ?? "federal",
      category: c.category ?? "other",
      status: c.docStatus ?? "UNKNOWN",
      publicationDate: c.publicationDate,
      source: c.source,
      extractionMethod: c.extractionMethod,
      score: Math.round(c.score * 1000) / 1000,
      excerpt: c.text.slice(0, 2400),
      hasEmbedding: c.hasEmbedding,
    });
    void questionLang;
  }
  return cards;
}

function extractiveFallback(lang: "am" | "en", cards: SourceCard[]): string {
  if (cards.length === 0) return INSUFFICIENT[lang];
  const intro =
    lang === "am"
      ? "የLLM አገልግሎት አልተዋቀረም (OPENROUTER_API_KEY/LLM_MODEL ባዶ ናቸው)። ከማውጫው በቃላቸው የተገኙ ተገቢ ድንጋጌዎች እዚህ ቀርበዋል:"
      : "LLM generation is not configured, so instead of a synthesised answer here are the relevant provisions retrieved from the index, quoted verbatim:";
  const blocks = cards.slice(0, 5).map((s) => {
    const head = `[${s.ref}] ${s.title}${
      s.proclamationNumber ? ` — Proclamation No. ${s.proclamationNumber}` : ""
    }${s.article ? `, Article ${s.article}` : ""}${
      s.page ? `, p. ${s.page}` : ""
    } (Status: ${s.status}; Jurisdiction: ${s.jurisdiction}; Language: ${s.language})`;
    return `**${head}**\n> ${s.excerpt.slice(0, 650)}${s.excerpt.length > 650 ? "…" : ""}`;
  });
  const tail =
    lang === "am"
      ? "\n\nይህ ሥርዓት ከተጠቃሽ ምንጮች ላይ የተመሠረተ የሕግ መረጃ ሰጪ ብቻ ሲሆን የባለሙያ መማከርን አይተካም።"
      : "\n\nThis system provides legal information based on its indexed sources and is not a substitute for advice from a qualified legal professional.";
  return [intro, ...blocks].join("\n\n") + tail;
}

function disclaimerLine(lang: "am" | "en"): string {
  return lang === "am"
    ? "\n\n---\n*ይህ ሥርዓት ከተጠቃሽ ምንጮች የሚሰጥ የሕግ መረጃ ብቻ ሲሆን የባለሙያ የሕግ አማካሪን አይተካም።*"
    : "\n\n---\n*This system provides legal information based on its indexed sources and is not a substitute for advice from a qualified legal professional.*";
}

export async function answerQuestion(req: ChatRequest): Promise<ChatResponse> {
  const startedAt = Date.now();
  const notices: string[] = [];
  const searchesPerformed: string[] = [];
  const question = req.question.trim();
  const detectedLanguage = detectLanguage(question);
  const answerLang = req.answerLanguage === "auto" ? detectedLanguage : req.answerLanguage;

  // ── Session + memory (context is used to route follow-ups; retrieval is
  // always performed fresh — answers are never generated from memory). ─────
  let sessionId = req.sessionId ?? "";
  const [session] = sessionId
    ? await db.select().from(chatSessions).where(eq(chatSessions.id, sessionId)).limit(1)
    : [null];
  if (!session) {
    const [created] = await db
      .insert(chatSessions)
      .values({ title: question.slice(0, 90), language: detectedLanguage })
      .returning();
    sessionId = created.id;
  }

  const routed = routeQuery(question);

  // Follow-up resolution: "What about Article 7?" → anchor to last cited law.
  if (routed.articleNumber && !routed.proclamationNumber) {
    const [lastAssistant] = await db
      .select({ sources: chatMessages.sources })
      .from(chatMessages)
      .where(and(eq(chatMessages.sessionId, sessionId), eq(chatMessages.role, "assistant")))
      .orderBy(desc(chatMessages.createdAt))
      .limit(1);
    const prev = (lastAssistant?.sources as SourceCard[] | null)?.[0];
    if (prev?.proclamationNumber) {
      routed.proclamationNumber = prev.proclamationNumber;
      routed.route = "ARTICLE_LOOKUP";
      searchesPerformed.push(`memory:follow-up-anchor(${prev.proclamationNumber})`);
    }
  }

  let selected: ScoredChunk[] = [];
  let confidence: Confidence = "INSUFFICIENT";
  let confidenceBasis = "no retrieval performed";
  let vectorCount = 0;
  let bm25Count = 0;
  let fusedCount = 0;
  let backend: "qdrant" | "postgres" | "none" = "none";
  let denseEnabled = false;
  let insufficientText: string | null = null;
  const relatedDocuments: RelatedDocument[] = [];

  // ── 1. Exact legal-identifier path (proclamation / article lookup). ────
  if (routed.proclamationNumber && routed.route !== "COMPARISON" && routed.route !== "GENERAL_LEGAL_QUESTION") {
    searchesPerformed.push(`exact:proclamation(${routed.proclamationNumber})`);
    const [doc] = await exactProclamationLookup(routed.proclamationNumber);
    if (!doc) {
      insufficientText = NOT_INDEXED(routed.proclamationNumber)[answerLang];
      confidenceBasis = "exact proclamation lookup returned no indexed document";
    } else {
      let rows: (typeof chunks.$inferSelect)[];
      if (routed.articleNumber) {
        searchesPerformed.push(`exact:article(${routed.articleNumber})`);
        rows = await exactArticleChunks(doc.id, routed.articleNumber, 8);
        if (rows.length === 0) {
          insufficientText =
            answerLang === "am"
              ? `አንቀጽ ${routed.articleNumber} በዚህ ሰነድ ውስጥ አልተገኘም — ምናልባት ከስሌት ውጪ ቁጥር ጠይቀሃል።`
              : `Article ${routed.articleNumber} was not found in ${doc.title}. The corpus in use may not cover that article.`;
        }
      } else {
        rows = await db
          .select()
          .from(chunks)
          .where(eq(chunks.documentId, doc.id))
          .orderBy(asc(chunks.page), asc(chunks.createdAt))
          .limit(12);
      }
      // Question language first, but keep the bilingual pair available.
      rows.sort((a, b) => (a.language === detectedLanguage ? 0 : 1) - (b.language === detectedLanguage ? 0 : 1));
      const limited = rows.slice(0, config.retrieval.contextChunks);
      selected = limited.map((row, i) => rowToChunk(row, 1 - i * 0.04));
      if (!insufficientText && selected.length > 0) {
        confidence = "STRONG";
        confidenceBasis = routed.articleNumber
          ? `exact metadata match: ${doc.proclamationNumber} Article ${routed.articleNumber}`
          : `exact proclamation lookup: ${doc.proclamationNumber}`;
      }
      relatedDocuments.push({
        documentId: doc.id,
        title: doc.title,
        proclamationNumber: doc.proclamationNumber,
        status: doc.status,
      });
    }
  }

  // ── 2. Hybrid semantic path. ────────────────────────────────────────────
  if (!insufficientText && selected.length === 0) {
    let queryVector: number[] | null = null;
    if (embeddingsConfigured()) {
      try {
        queryVector = await embedText(question);
      } catch (err) {
        notices.push(
          `Dense retrieval unavailable (${err instanceof Error ? err.message : "embedding error"}). Fell back to keyword retrieval.`,
        );
      }
    } else {
      notices.push("HF_TOKEN is not configured — dense (semantic) retrieval is disabled; using BM25 keyword retrieval only.");
    }
    const statusMode: StatusMode =
      req.mode === "compare" || routed.wantsComparison
        ? "compare"
        : routed.wantsHistorical
          ? "historical"
          : "current";
    const hybrid = await hybridRetrieve({
      question,
      queryVector,
      filters: req.filters,
      mode: statusMode,
      questionLanguage: detectedLanguage,
      routed,
    });
    selected = hybrid.results;
    vectorCount = hybrid.vectorCount;
    bm25Count = hybrid.bm25Count;
    fusedCount = hybrid.fusedCount;
    backend = hybrid.backend;
    denseEnabled = hybrid.denseEnabled;
    searchesPerformed.push(...hybrid.searchesPerformed);

    const top = selected[0]?.score ?? 0;
    if (selected.length >= 2 && top >= config.retrieval.strongScore) {
      confidence = "STRONG";
      confidenceBasis = `top score ${top.toFixed(2)} ≥ ${config.retrieval.strongScore} across ${selected.length} candidates (dense+BM25 fused)`;
    } else if (selected.length > 0 && top >= config.retrieval.moderateScore) {
      confidence = "MODERATE";
      confidenceBasis = `top score ${top.toFixed(2)} between ${config.retrieval.moderateScore} and ${config.retrieval.strongScore}`;
    } else {
      confidence = "INSUFFICIENT";
      confidenceBasis = `top score ${top.toFixed(2)} below ${config.retrieval.moderateScore} or no candidates`;
      insufficientText = INSUFFICIENT[answerLang];
    }
    // Surface related (possibly relevant) documents even when confidence is low.
    const docIds = [...new Set(selected.map((c) => c.documentId))].slice(0, 6);
    if (docIds.length > 0) {
      const rows = await db
        .select({
          id: documents.id,
          title: documents.title,
          proclamationNumber: documents.proclamationNumber,
          status: documents.status,
        })
        .from(documents)
        .where(inArray(documents.id, docIds));
      relatedDocuments.push(...rows.map((r) => ({ ...r, documentId: r.id })));
    }
  }

  // ── 3. Context assembly. ────────────────────────────────────────────────
  const cards = insufficientText ? [] : await buildCards(selected.slice(0, config.retrieval.contextChunks), detectedLanguage);

  // Amendment / repeal relationships for transparency.
  if (cards.length > 0) {
    const docIds = [...new Set(cards.map((c) => c.documentId))];
    const rels = await db
      .select()
      .from(legalRelationships)
      .where(
        docIds.length === 1
          ? eq(legalRelationships.toDocumentId, docIds[0])
          : inArray(legalRelationships.toDocumentId, docIds),
      );
    for (const rel of rels) {
      const [other] = await db
        .select({ title: documents.title, proclamationNumber: documents.proclamationNumber })
        .from(documents)
        .where(eq(documents.id, rel.fromDocumentId))
        .limit(1);
      notices.push(
        `Legal relationship: ${other?.title ?? rel.fromDocumentId} ${rel.relationType} this document${other?.proclamationNumber ? ` (${other.proclamationNumber})` : ""}.`,
      );
    }
  }

  // ── 4. Generation (or honest refusal). ─────────────────────────────────
  let answer: string;
  let llmLatencyMs: number | null = null;
  let finalSources = cards;
  if (insufficientText) {
    answer = insufficientText;
  } else if (req.skipLlm) {
    answer = "";
    notices.push("Evaluation mode: LLM generation skipped (retrieval-only response).");
  } else if (!llmConfigured()) {
    answer = extractiveFallback(answerLang, cards);
  } else {
    try {
      const generated = await generateAnswer({
        question,
        mode: req.mode,
        language: answerLang,
        sources: cards,
      });
      llmLatencyMs = generated.latencyMs;
      const validated = await validateCitations(generated.text, cards);
      if (validated.removedRefs.length > 0) {
        notices.push(
          `Removed ${validated.removedRefs.length} fabricated citation reference(s) (${validated.removedRefs.join(", ")}) that did not match retrieved sources.`,
        );
      }
      answer = validated.answer + disclaimerLine(answerLang);
      finalSources = validated.validatedSources.length > 0 ? validated.validatedSources : cards;
    } catch (err) {
      notices.push(
        `LLM generation failed (${err instanceof Error ? err.message : String(err)}). Showing retrieved provisions instead.`,
      );
      answer = extractiveFallback(answerLang, cards);
    }
  }

  // ── 5. Persist session + retrieval log. ────────────────────────────────
  const latencyMs = Date.now() - startedAt;
  try {
    await db.insert(chatMessages).values({
      sessionId,
      role: "user",
      content: question,
      language: detectedLanguage,
      route: routed.route,
    });
    await db.insert(chatMessages).values({
      sessionId,
      role: "assistant",
      content: answer,
      language: answerLang,
      route: routed.route,
      confidence,
      sources: finalSources,
      retrieval: { vectorCount, bm25Count, fusedCount, reranked: selected.length, backend },
    });
    await db.insert(retrievalLogs).values({
      sessionId,
      question,
      language: detectedLanguage,
      route: routed.route,
      vectorCount,
      bm25Count,
      fusedCount,
      rerankCount: selected.length,
      topScore: selected[0]?.score ?? 0,
      vectorBackend: backend,
      latencyMs,
      llmLatencyMs,
    });
  } catch {
    // Persistence failures must never block the answer.
  }

  const filtersApplied: Record<string, string> = Object.fromEntries(
    Object.entries(req.filters ?? {}).filter(([, v]) => v && v !== "any") as [string, string][],
  );

  return {
    answer,
    language: answerLang,
    route: routed.route,
    mode: req.mode,
    confidence,
    confidenceBasis,
    answered: !insufficientText,
    notices,
    sources: finalSources,
    retrieval: {
      route: routed.route,
      detectedLanguage,
      vectorResults: vectorCount,
      keywordResults: bm25Count,
      fusedResults: fusedCount,
      rerankedResults: selected.length,
      topScore: Math.round((selected[0]?.score ?? 0) * 1000) / 1000,
      vectorBackend: backend,
      denseEnabled,
      latencyMs,
      llmLatencyMs,
      searchesPerformed,
      filtersApplied,
    },
    sessionId,
    relatedDocuments,
  };
}
