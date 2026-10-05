import type {
  Analytics,
  ChatResponse,
  ChunkRow,
  DocumentRow,
  HealthStatus,
  SearchResult,
  SourceDetail,
} from "./types";

/** Thin typed fetchers for the legal RAG API (browser-safe, no secrets). */

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // keep default message
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export interface ChatFilters {
  language?: string;
  jurisdiction?: string;
  category?: string;
  status?: string;
  documentType?: string;
  year?: string;
  proclamationNumber?: string;
  source?: string;
}

export function postChat(payload: {
  question: string;
  sessionId?: string;
  mode: "quick" | "research" | "compare";
  filters?: ChatFilters;
  answerLanguage?: "auto" | "am" | "en";
  skipLlm?: boolean;
}) {
  return fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then((r) => json<ChatResponse>(r));
}

export function postSearch(payload: {
  query: string;
  filters?: ChatFilters;
  limit?: number;
}) {
  return fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then((r) => json<SearchResult>(r));
}

export function getHealth() {
  return fetch("/api/health", { cache: "no-store" }).then((r) => json<HealthStatus>(r));
}

export function getAnalytics() {
  return fetch("/api/analytics", { cache: "no-store" }).then((r) => json<Analytics>(r));
}

export function getDocuments(params?: Record<string, string>) {
  const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
  return fetch(`/api/documents${qs}`, { cache: "no-store" }).then((r) =>
    json<{ documents: DocumentRow[]; count: number }>(r),
  );
}

export function getDocument(id: string) {
  return fetch(`/api/documents/${id}`, { cache: "no-store" }).then((r) => json<DocumentRow>(r));
}

export function getChunks(id: string, params?: Record<string, string>) {
  const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
  return fetch(`/api/documents/${id}/chunks${qs}`, { cache: "no-store" }).then((r) =>
    json<{ chunks: ChunkRow[]; count: number }>(r),
  );
}

export function getSource(chunkId: string) {
  return fetch(`/api/sources/${chunkId}`, { cache: "no-store" }).then((r) => json<SourceDetail>(r));
}

export function uploadDocument(form: FormData, adminToken: string) {
  return fetch("/api/documents", {
    method: "POST",
    headers: adminToken ? { "x-admin-token": adminToken } : {},
    body: form,
  }).then((r) => json<{ document: DocumentRow; jobId: string }>(r));
}

export function reingest(id: string, kind: "ingest" | "reindex", adminToken: string) {
  return fetch(`/api/documents/${id}/${kind}`, {
    method: "POST",
    headers: adminToken ? { "x-admin-token": adminToken } : {},
  }).then((r) => json<{ jobId: string; status: string }>(r));
}

export function deleteDocument(id: string, adminToken: string) {
  return fetch(`/api/documents/${id}`, {
    method: "DELETE",
    headers: adminToken ? { "x-admin-token": adminToken } : {},
  }).then((r) => json<{ deleted: boolean }>(r));
}

export function testEmbeddings(texts: string[], adminToken: string) {
  return fetch("/api/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(adminToken ? { "x-admin-token": adminToken } : {}),
    },
    body: JSON.stringify({ texts }),
  }).then((r) => json<{ model: string; dims: number; count: number }>(r));
}
