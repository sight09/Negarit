import { config } from "@/server/core/config";
import { AppError, type SourceCard } from "@/server/core/types";

/**
 * OpenRouter-compatible chat-completions client. The model identifier comes
 * from LLM_MODEL (never hardcoded). The model receives ONLY: the question,
 * the retrieved legal context, and strict system instructions.
 */

export function llmConfigured(): boolean {
  return config.llm.configured;
}

const MODES: Record<"quick" | "research" | "compare", string> = {
  quick: "Answer briefly (2-5 sentences). Lead with the operative rule, then cite the source.",
  research:
    "Structure the answer as: Issue / Applicable law / Relevant provisions / Explanation / Related provisions. Be thorough but stay strictly within the sources.",
  compare:
    "Structure the answer as a comparison. Clearly separate CURRENT law from HISTORICAL or REPEALED law, and note federal vs regional jurisdiction where it differs. State what changed and cite each side.",
};

function systemPrompt(mode: "quick" | "research" | "compare", language: "am" | "en"): string {
  const langRule =
    language === "am"
      ? "The user asked in Amharic. Write the entire answer in Amharic (you may quote legal text in its original language when necessary)."
      : "The user asked in English. Write the entire answer in English.";
  return `You are an Ethiopian legal information assistant.

RULES — follow them strictly:
- Answer ONLY using the provided legal sources below. Do not use outside knowledge.
- Do not invent articles, sections, proclamations, numbers, dates, penalties, rights, obligations, or legal conclusions.
- For every substantive legal claim, identify the supporting source using its bracket reference, e.g. [S1].
- Prefer current laws (status IN_FORCE or AMENDED) when the question concerns current law.
- If a law has been repealed or superseded, say so explicitly and do not present it as current law.
- If a provision has been amended, identify the current applicable provision when the sources contain it.
- If the retrieved context is insufficient to answer, say exactly that the available indexed sources are insufficient. Never pretend a source was retrieved when it was not.
- Never fabricate citations. Only reference the numbered sources provided below.
- Respect jurisdiction labels: federal law and regional law are not interchangeable.
- Distinguish binding provisions from definitions, repeals and transitional rules.
${langRule}

ANSWER MODE: ${MODES[mode]}

FORMAT: ${mode === "quick" ? "Plain paragraphs." : "Short markdown with the section headings given above."} End with a one-line reminder that this is legal information, not legal advice.`;
}

function buildUserPrompt(question: string, sources: SourceCard[]): string {
  const blocks = sources
    .map((s) => {
      const meta = [
        s.title,
        s.proclamationNumber ? `Proclamation No. ${s.proclamationNumber}` : null,
        s.article ? `Article ${s.article}` : null,
        s.subArticle ? `Sub-article ${s.subArticle}` : null,
        s.page ? `Page ${s.page}` : null,
        `Language: ${s.language}`,
        `Jurisdiction: ${s.jurisdiction}`,
        `Status: ${s.status}`,
        s.publicationDate ? `Published: ${s.publicationDate}` : null,
        s.source ? `Source: ${s.source}` : null,
      ]
        .filter(Boolean)
        .join(" | ");
      return `[${s.ref}] ${meta}\n${s.excerpt}`;
    })
    .join("\n\n---\n\n");
  return `QUESTION:\n${question}\n\nRETRIEVED LEGAL SOURCES (use only these):\n\n${blocks}`;
}

export async function generateAnswer(params: {
  question: string;
  mode: "quick" | "research" | "compare";
  language: "am" | "en";
  sources: SourceCard[];
}): Promise<{ text: string; latencyMs: number }> {
  if (!config.llm.configured) {
    throw new AppError(
      "LLM_NOT_CONFIGURED",
      "OPENROUTER_API_KEY or LLM_MODEL is not set. Returning source-grounded extractive answer instead.",
      503,
    );
  }
  const startedAt = Date.now();
  const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.llm.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://ethiopian-legal-rag.local",
      "X-Title": "Ethiopian Legal RAG",
    },
    body: JSON.stringify({
      model: config.llm.model,
      temperature: 0.1,
      max_tokens: params.mode === "quick" ? 700 : 1600,
      messages: [
        { role: "system", content: systemPrompt(params.mode, params.language) },
        { role: "user", content: buildUserPrompt(params.question, params.sources) },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new AppError("LLM_FAILED", `OpenRouter error ${res.status}: ${detail}`, 502);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new AppError("LLM_EMPTY", "The LLM returned an empty response.", 502);
  return { text, latencyMs: Date.now() - startedAt };
}
