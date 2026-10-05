import { z } from "zod";
import { embedBatch, embeddingsConfigured } from "@/server/embeddings/huggingface";
import { adminGuard } from "@/server/services/documents";
import { AppError } from "@/server/core/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({ texts: z.array(z.string().min(1).max(8000)).min(1).max(64) });

/**
 * Embedding test/utility endpoint (BGE-M3 via Hugging Face). Never exposed to
 * the browser with secrets — the HF token stays server-side.
 */
export async function POST(request: Request) {
  try {
    adminGuard(request.headers);
    const { texts } = schema.parse(await request.json());
    if (!embeddingsConfigured()) {
      return Response.json(
        {
          error:
            "HF_TOKEN is not set. Dense embeddings are unavailable; the system falls back to BM25 keyword retrieval.",
          code: "EMBEDDINGS_NOT_CONFIGURED",
        },
        { status: 503 },
      );
    }
    const vectors = await embedBatch(texts);
    return Response.json({
      model: process.env.HF_MODEL ?? "BAAI/bge-m3",
      count: vectors.length,
      dims: vectors[0]?.length ?? 0,
      preview: vectors[0]?.slice(0, 8) ?? [],
    });
  } catch (err) {
    if (err instanceof AppError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status });
    }
    if (err instanceof z.ZodError) {
      return Response.json({ error: "Invalid request", details: err.flatten() }, { status: 400 });
    }
    return Response.json({ error: "Embedding request failed." }, { status: 500 });
  }
}
