#!/usr/bin/env node
/**
 * Retrieval-only evaluation harness.
 * For every evaluation question it runs /api/search (Recall@5/@10, MRR) and
 * /api/chat with skipLlm (citation accuracy, language accuracy, groundedness
 * via validated-citation ratio), then writes evaluation/report.json.
 * Questions whose expected source is not yet indexed are reported under
 * "uncovered" so missing corpus is never mistaken for retrieval failure.
 */
import { readFile, writeFile } from "fs/promises";

const BASE = process.env.BASE ?? "http://localhost:3000";
const DATASETS = [
  "english_questions",
  "amharic_questions",
  "cross_language_questions",
  "exact_lookup_questions",
  "historical_questions",
];

const post = (path, body) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());

function matches(hit, expected) {
  if (!expected?.proclamationNumber) return false;
  const want = expected.proclamationNumber.replace(/\s/g, "");
  const got = (hit.proclamationNumber ?? "").replace(/\s/g, "");
  return got.includes(want);
}

async function evaluate(name, items) {
  const m = {
    dataset: name,
    total: items.length,
    recall5: 0,
    recall10: 0,
    mrr: 0,
    citationAccuracy: 0,
    groundedness: 0,
    languageAccuracy: 0,
    insufficientHonesty: 0,
    uncovered: 0,
  };
  for (const item of items) {
    // Document-level retrieval metrics.
    const search = await post("/api/search", { query: item.question, limit: 10 });
    const ranks = (search.chunks ?? [])
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => matches(c, item.expected));
    const first = ranks[0]?.i;
    const hasExpected = Boolean(item.expected?.proclamationNumber);
    if (hasExpected) {
      if (first !== undefined && first < 5) m.recall5++;
      if (first !== undefined && first < 10) m.recall10++;
      if (first !== undefined) m.mrr += 1 / (first + 1);
      else if ((search.documents ?? []).length === 0) m.uncovered++;
    }

    // Answer-level metrics (retrieval only — the LLM is skipped on purpose).
    const chat = await post("/api/chat", { question: item.question, mode: "research", skipLlm: true });
    const sources = chat.sources ?? [];
    if (sources.length > 0) {
      const cited = sources.filter((s) => s.chunkId && s.title && (s.page === null || typeof s.page === "number"));
      m.citationAccuracy += cited.length === sources.length ? 1 : 0;
      if (hasExpected) m.groundedness += sources.some((s) => matches(s, item.expected)) ? 1 : 0;
      else m.groundedness += 1;
    }
    if (!item.expectedLanguage || chat.language === item.expectedLanguage) m.languageAccuracy++;
    if (!chat.answered && chat.confidence === "INSUFFICIENT") m.insufficientHonesty++;
  }
  const withExpected = items.filter((i) => i.expected?.proclamationNumber).length || 1;
  const n = items.length || 1;
  return {
    ...m,
    recall5: +(m.recall5 / withExpected).toFixed(3),
    recall10: +(m.recall10 / withExpected).toFixed(3),
    mrr: +(m.mrr / withExpected).toFixed(3),
    citationAccuracy: +(m.citationAccuracy / n).toFixed(3),
    groundedness: +(m.groundedness / n).toFixed(3),
    languageAccuracy: +(m.languageAccuracy / n).toFixed(3),
    insufficientAnswers: m.insufficientHonesty,
    withExpectedSources: withExpected,
  };
}

const report = { generatedAt: new Date().toISOString(), base: BASE, datasets: [] };
for (const name of DATASETS) {
  const items = JSON.parse(await readFile(new URL(`../evaluation/${name}.json`, import.meta.url), "utf8"));
  console.log(`Evaluating ${name} (${items.length} questions)…`);
  const result = await evaluate(name, items);
  report.datasets.push(result);
  console.log(
    `  R@5 ${result.recall5} · R@10 ${result.recall10} · MRR ${result.mrr} · cite ${result.citationAccuracy} · grounded ${result.groundedness} · lang ${result.languageAccuracy} · uncovered ${result.uncovered}`,
  );
}
await writeFile(new URL("../evaluation/report.json", import.meta.url), JSON.stringify(report, null, 2));
console.log("Report written to evaluation/report.json");
