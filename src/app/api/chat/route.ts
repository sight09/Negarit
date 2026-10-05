import { answerQuestion } from "@/server/rag/pipeline";
import { AppError, chatRequestSchema } from "@/server/core/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = chatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const response = await answerQuestion(parsed.data);
    return Response.json(response);
  } catch (err) {
    if (err instanceof AppError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("[chat] unexpected error", err);
    return Response.json(
      { error: "Unexpected server error while answering the question." },
      { status: 500 },
    );
  }
}
