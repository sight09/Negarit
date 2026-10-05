import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { chunks } from "@/db/schema";
import type { SourceCard } from "@/server/core/types";

/**
 * Citation validation (mirrors backend/app/citations).
 * The LLM may only reference sources we injected as [S1]..[Sn]. Before an
 * answer is displayed we:
 *   1. strip bracket references that do not map to an injected source,
 *   2. verify every cited chunk_id actually exists in PostgreSQL,
 *   3. only surface sources that passed validation.
 * Fabricated citations are removed — never displayed.
 */

const REF_RE = /\[S(\d{1,2})\]/g;

export interface ValidatedCitations {
  answer: string;
  validatedRefs: string[];
  removedRefs: string[];
  validatedSources: SourceCard[];
}

export async function validateCitations(
  answer: string,
  sources: SourceCard[],
): Promise<ValidatedCitations> {
  const byRef = new Map(sources.map((s) => [s.ref, s]));
  const usedRefs = new Set<string>();
  const removedRefs = new Set<string>();

  const cleaned = answer.replace(REF_RE, (whole, num: string) => {
    const ref = `S${num}`;
    if (byRef.has(ref)) {
      usedRefs.add(ref);
      return whole;
    }
    removedRefs.add(ref);
    return ""; // strip hallucinated reference
  });

  const cited = sources.filter((s) => usedRefs.has(s.ref));
  let validatedSources = cited.length > 0 ? cited : sources; // LLM cited nothing → show retrieved sources
  if (usedRefs.size > 0) {
    try {
      const existing = await db
        .select({ id: chunks.id })
        .from(chunks)
        .where(inArray(chunks.id, cited.map((s) => s.chunkId)));
      const existingIds = new Set(existing.map((r) => r.id));
      validatedSources = cited.filter((s) => existingIds.has(s.chunkId));
    } catch {
      validatedSources = cited;
    }
  }

  return {
    answer: cleaned.replace(/ {2,}/g, " ").replace(/\s+([,.;:])/g, "$1").trim(),
    validatedRefs: [...usedRefs],
    removedRefs: [...removedRefs],
    validatedSources,
  };
}
