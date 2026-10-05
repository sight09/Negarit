import { config } from "@/server/core/config";

/**
 * Optional Qdrant vector backend. PostgreSQL remains the source of truth;
 * Qdrant mirrors chunk vectors + filterable payload when QDRANT_URL is set.
 * Every call fails soft so the platform works with or without Qdrant.
 */

let ready: boolean | null = null;

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (config.qdrant.apiKey) h["api-key"] = config.qdrant.apiKey;
  return h;
}

export function qdrantConfigured(): boolean {
  return config.qdrant.configured;
}

async function request(path: string, init: RequestInit): Promise<Response> {
  const res = await fetch(`${config.qdrant.url}${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers as Record<string, string> | undefined) },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Qdrant ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

export async function ensureQdrant(): Promise<boolean> {
  if (!config.qdrant.configured) return false;
  if (ready !== null) return ready;
  try {
    const { url, collection } = { url: config.qdrant.url, collection: config.qdrant.collection };
    void url;
    await request(`/collections/${collection}`, { method: "GET" }).catch(async () => {
      await request(`/collections/${collection}`, {
        method: "PUT",
        body: JSON.stringify({
          vectors: { size: config.embeddings.dims, distance: "Cosine" },
        }),
      });
    });
    const payloadFields = [
      "document_id", "language", "jurisdiction", "category", "doc_status",
      "document_type", "proclamation_number", "article_number",
    ];
    for (const field of payloadFields) {
      await request(`/collections/${collection}/index`, {
        method: "PUT",
        body: JSON.stringify({ field_name: field, field_schema: "keyword" }),
      }).catch(() => undefined);
    }
    ready = true;
  } catch {
    ready = false;
  }
  return ready;
}

export interface QdrantPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

export async function upsertPoints(points: QdrantPoint[]): Promise<boolean> {
  if (!(await ensureQdrant())) return false;
  try {
    await request(`/collections/${config.qdrant.collection}/points?wait=true`, {
      method: "PUT",
      body: JSON.stringify({ points }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function deleteDocumentPoints(documentId: string): Promise<void> {
  if (!(await ensureQdrant())) return;
  try {
    await request(`/collections/${config.qdrant.collection}/points/delete?wait=true`, {
      method: "POST",
      body: JSON.stringify({
        filter: { must: [{ key: "document_id", match: { value: documentId } }] },
      }),
    });
  } catch {
    // non-fatal
  }
}

export interface QdrantSearchHit {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

export async function searchQdrant(
  vector: number[],
  filter: Record<string, string | undefined>,
  limit: number,
): Promise<QdrantSearchHit[] | null> {
  if (!(await ensureQdrant())) return null;
  const must = Object.entries(filter)
    .filter(([, v]) => v)
    .map(([key, value]) => ({ key, match: { value } }));
  try {
    const res = await request(`/collections/${config.qdrant.collection}/points/search`, {
      method: "POST",
      body: JSON.stringify({
        vector,
        limit,
        with_payload: true,
        ...(must.length ? { filter: { must } } : {}),
      }),
    });
    const data = (await res.json()) as {
      result: { id: string; score: number; payload: Record<string, unknown> }[];
    };
    return data.result;
  } catch {
    return null;
  }
}

export async function qdrantStatus(): Promise<"not_configured" | "up" | "down"> {
  if (!config.qdrant.configured) return "not_configured";
  return (await ensureQdrant()) ? "up" : "down";
}
