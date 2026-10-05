import crypto from "crypto";
import { db } from "@/db";
import { embeddingCache } from "@/db/schema";
import { config } from "@/server/core/config";
import { AppError } from "@/server/core/types";

/**
 * Hugging Face Inference Providers client for BAAI/bge-m3 (multilingual,
 * Amharic-capable, 1024-dim dense vectors). The HF token is read from the
 * server-only environment; callers must degrade gracefully when it is absent.
 */

const ROUTER = "https://router.huggingface.co";
const LEGACY = "https://api-inference.huggingface.co";

export function embeddingsConfigured(): boolean {
  return config.embeddings.configured;
}

function cacheKey(model: string, text: string): string {
  return crypto.createHash("sha256").update(`${model}\n${text}`).digest("hex");
}

function normalize(payload: unknown, expected: number): number[][] {
  // Accepted shapes: number[][], [ [ [token vecs] ] ] (token-level), or
  // { embeddings: number[][] }.
  const rows = Array.isArray(payload)
    ? (payload as unknown[])
    : Array.isArray((payload as { embeddings?: unknown[] })?.embeddings)
      ? ((payload as { embeddings: unknown[] }).embeddings as unknown[])
      : null;
  if (!rows) throw new Error("Unexpected embedding response shape");
  return rows.slice(0, expected).map((row) => {
    if (!Array.isArray(row)) throw new Error("Unexpected embedding row shape");
    if (typeof row[0] === "number") return row as number[];
    // token-level vectors → mean pool
    const tokens = row as number[][];
    const dims = tokens[0]?.length ?? 0;
    const pooled = new Array<number>(dims).fill(0);
    for (const token of tokens) {
      for (let i = 0; i < dims; i++) pooled[i] += token[i];
    }
    return pooled.map((v) => v / Math.max(1, tokens.length));
  });
}

async function callProvider(inputs: string[]): Promise<number[][]> {
  const { model, hfToken } = config.embeddings;
  const body = JSON.stringify({
    inputs,
    options: { wait_for_model: true, use_cache: true },
  });
  const headers = {
    Authorization: `Bearer ${hfToken}`,
    "Content-Type": "application/json",
  };
  const endpoints = [
    `${ROUTER}/hf-inference/models/${model}/pipeline/feature-extraction`,
    `${LEGACY}/pipeline/feature-extraction/${model}`,
  ];
  let lastError = "";
  for (const url of endpoints) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers,
          body,
          signal: AbortSignal.timeout(90_000),
        });
        if (res.status === 503 && attempt === 0) {
          await new Promise((r) => setTimeout(r, 4_000)); // model warm-up
          continue;
        }
        if (res.status === 404 || res.status === 410) {
          lastError = `${res.status} from ${url}`;
          break; // try the legacy endpoint
        }
        if (!res.ok) {
          const detail = (await res.text()).slice(0, 300);
          throw new Error(`Hugging Face API ${res.status}: ${detail}`);
        }
        return normalize(await res.json(), inputs.length);
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (attempt === 1) break;
        await new Promise((r) => setTimeout(r, 1_500));
      }
    }
  }
  throw new AppError(
    "EMBEDDING_FAILED",
    `Hugging Face embedding request failed: ${lastError || "unknown error"}`,
    502,
  );
}

async function readCache(hashes: string[]): Promise<Map<string, number[]>> {
  const hit = new Map<string, number[]>();
  if (hashes.length === 0) return hit;
  try {
    const { inArray } = await import("drizzle-orm");
    const rows = await db
      .select()
      .from(embeddingCache)
      .where(inArray(embeddingCache.hash, hashes));
    for (const row of rows) hit.set(row.hash, row.vector);
  } catch {
    // Cache table may not exist yet — embeddings still work without it.
  }
  return hit;
}

async function writeCache(entries: { hash: string; vector: number[] }[]) {
  if (entries.length === 0) return;
  try {
    const { sql } = await import("drizzle-orm");
    for (const entry of entries) {
      await db
        .insert(embeddingCache)
        .values({
          hash: entry.hash,
          model: config.embeddings.model,
          dims: entry.vector.length,
          vector: entry.vector,
        })
        .onConflictDoNothing();
    }
    void sql;
  } catch {
    // non-fatal
  }
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (!config.embeddings.configured) {
    throw new AppError(
      "EMBEDDINGS_NOT_CONFIGURED",
      "HF_TOKEN is not set. Dense (semantic) retrieval is disabled; keyword retrieval remains available.",
      503,
    );
  }
  const clipped = texts.map((t) => t.slice(0, config.embeddings.maxCharsPerInput));
  const hashes = clipped.map((t) => cacheKey(config.embeddings.model, t));
  const cached = await readCache(hashes);

  const results: (number[] | null)[] = hashes.map((h) => cached.get(h) ?? null);
  const pendingIdx = results
    .map((v, i) => (v === null ? i : -1))
    .filter((i) => i >= 0);

  for (let start = 0; start < pendingIdx.length; start += config.embeddings.batchSize) {
    const slice = pendingIdx.slice(start, start + config.embeddings.batchSize);
    const vectors = await callProvider(slice.map((i) => clipped[i]));
    const fresh: { hash: string; vector: number[] }[] = [];
    slice.forEach((rowIdx, j) => {
      results[rowIdx] = vectors[j];
      fresh.push({ hash: hashes[rowIdx], vector: vectors[j] });
    });
    await writeCache(fresh);
  }

  return results.map((v) => {
    if (!v) throw new AppError("EMBEDDING_FAILED", "Embedding cache/provider mismatch", 502);
    return v;
  });
}

export async function embedText(text: string): Promise<number[]> {
  const [vector] = await embedBatch([text]);
  return vector;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
