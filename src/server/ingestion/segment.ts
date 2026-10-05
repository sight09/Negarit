/**
 * Bilingual legal segmentation & chunking (mirrors backend/app/ingestion).
 *
 * Federal Negarit Gazette PDFs commonly contain the same instrument twice —
 * Amharic text followed by the English text (sometimes interleaved).
 * This module:
 *   1. splits the text layer into contiguous Amharic / English segments,
 *   2. detects structural markers (Part / Chapter / ክፍል / ምዕራፍ, Article N / አንቀጽ N),
 *   3. chunks on ARTICLE boundaries (never blind 500-char splits),
 *   4. pairs Amharic and English versions of the same article so both
 *      language chunks stay linked to one legal article.
 */
import type { ExtractedPage } from "./pdf";

export type ChunkLanguage = "am" | "en";

export interface ChunkDraft {
  articleNumber: string | null;
  title: string | null;
  subArticle: string | null;
  part: string | null;
  chapter: string | null;
  language: ChunkLanguage;
  text: string;
  page: number | null;
}

export interface SegmentResult {
  chunks: ChunkDraft[];
  detectedLanguages: ChunkLanguage[];
  articleCount: number;
  warnings: string[];
}

const ETHIOPIC_RE = /[ሀ-፟ᎀ-᎟ⶀ-ⷞꬁ-꬯]/;
const ARTICLE_EN = /^article\s+([0-9]{1,3})\b[.:)\-\s]*/i;
const ARTICLE_AM = /^አንቀጽ\s*([0-9]{1,3})\s*[.:)፡።\-]*/;
const PART_EN = /^part\s+([0-9]{1,2}|[A-Z]{1,4})\b/i;
const PART_AM = /^ክፍል\s*([0-9]{1,2})/;
const CHAPTER_EN = /^chapter\s+([0-9]{1,2}|[A-Z]{1,4})\b/i;
const CHAPTER_AM = /^ምዕራፍ\s*([0-9]{1,2})/;
const SUB_ARTICLE = /^\(?([0-9]{1,2})\)\s+\S/;

const MAX_CHUNK_CHARS = 1500;
const HARD_MAX_CHARS = 2300;
const MIN_CHUNK_CHARS = 120;

export function lineLanguage(line: string): ChunkLanguage | null {
  const letters = line.replace(/[\s\d\p{P}፡።፣፤፥፦፧]/gu, "");
  if (letters.length === 0) return null;
  const ethiopic = (letters.match(/[ሀ-፟ᎀ-᎟ⶀ-ⷞꬁ-꬯]/g) ?? []).length;
  return ethiopic / letters.length >= 0.5 ? "am" : "en";
}

export function detectTextLanguage(text: string): ChunkLanguage {
  const scores = { am: 0, en: 0 };
  for (const line of text.split("\n")) {
    const lang = lineLanguage(line);
    if (lang) scores[lang] += line.length;
  }
  return scores.am > scores.en ? "am" : "en";
}

interface Unit {
  language: ChunkLanguage;
  lines: string[];
  page: number;
}

/** Split pages into contiguous same-language units (bilingual separation). */
function toLanguageUnits(pages: ExtractedPage[], warnings: string[]): Unit[] {
  const units: Unit[] = [];
  let interleavedPages = 0;
  for (const page of pages) {
    let current: Unit | null = null;
    let pageSwitches = 0;
    let lastLang: ChunkLanguage | null = null;
    for (const line of page.lines) {
      const lang: ChunkLanguage = lineLanguage(line) ?? lastLang ?? "en";
      if (lastLang && lang !== lastLang) pageSwitches++;
      lastLang = lang;
      if (!current || current.language !== lang) {
        current = { language: lang, lines: [], page: page.page };
        units.push(current);
      }
      current.lines.push(line);
    }
    if (pageSwitches >= 4) interleavedPages++;
  }
  if (interleavedPages > 0) {
    warnings.push(
      `${interleavedPages} page(s) appear to interleave Amharic and English (multi-column layout). Bilingual pairing is best-effort for those pages; review chunks manually.`,
    );
  }
  return units;
}

/** Chunk one language unit on structural boundaries. */
function chunkUnits(units: Unit[], warnings: string[]): ChunkDraft[] {
  const drafts: ChunkDraft[] = [];
  let part: string | null = null;
  let chapter: string | null = null;
  let articleNumber: string | null = null;
  let articleTitle: string | null = null;

  const push = (
    language: ChunkLanguage,
    text: string,
    page: number,
    subArticle: string | null,
  ) => {
    const cleaned = text.replace(/[ \t]{2,}/g, " ").trim();
    if (!cleaned) return;
    drafts.push({
      articleNumber,
      title: articleTitle,
      subArticle,
      part,
      chapter,
      language,
      text: cleaned,
      page,
    });
  };

  for (const unit of units) {
    let buffer: string[] = [];
    let bufferPage = unit.page;
    const flush = (sub: string | null = null) => {
      if (buffer.length) push(unit.language, buffer.join("\n"), bufferPage, sub);
      buffer = [];
    };

    for (const rawLine of unit.lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const partMatch = line.match(unit.language === "am" ? PART_AM : PART_EN);
      if (partMatch) {
        flush();
        part = `${unit.language === "am" ? "ክፍል" : "Part"} ${partMatch[1]}`;
        chapter = null;
        buffer.push(line);
        bufferPage = unit.page;
        continue;
      }
      const chapterMatch = line.match(unit.language === "am" ? CHAPTER_AM : CHAPTER_EN);
      if (chapterMatch) {
        flush();
        chapter = `${unit.language === "am" ? "ምዕራፍ" : "Chapter"} ${chapterMatch[1]}`;
        buffer.push(line);
        bufferPage = unit.page;
        continue;
      }
      const articleMatch =
        unit.language === "am" ? line.match(ARTICLE_AM) : line.match(ARTICLE_EN);
      if (articleMatch) {
        flush();
        articleNumber = articleMatch[1];
        articleTitle =
          line
            .replace(unit.language === "am" ? ARTICLE_AM : ARTICLE_EN, "")
            .trim()
            .slice(0, 160) || null;
        buffer.push(line);
        bufferPage = unit.page;
        continue;
      }

      // Split oversized buffers on sub-article enumeration first, otherwise
      // hard-split while keeping legal metadata attached to every fragment.
      const merged = buffer.join("\n");
      if (merged.length + line.length > MAX_CHUNK_CHARS) {
        const subMatch = line.match(SUB_ARTICLE);
        if (subMatch && merged.length >= MIN_CHUNK_CHARS) {
          flush(subMatch[1]);
          buffer.push(line);
          continue;
        }
        if (merged.length > HARD_MAX_CHARS) {
          flush();
          buffer.push(line);
          continue;
        }
      }
      buffer.push(line);
    }
    flush();
  }

  // Merge tiny fragments with their neighbour so no chunk is context-poor.
  const merged: ChunkDraft[] = [];
  for (const draft of drafts) {
    const prev = merged[merged.length - 1];
    if (
      draft.text.length < MIN_CHUNK_CHARS &&
      prev &&
      prev.language === draft.language &&
      prev.articleNumber === draft.articleNumber &&
      prev.text.length + draft.text.length <= HARD_MAX_CHARS
    ) {
      prev.text = `${prev.text}\n${draft.text}`;
      continue;
    }
    merged.push(draft);
  }
  if (merged.every((d) => d.articleNumber === null)) {
    warnings.push(
      "No Article markers were detected. The document was chunked on structural/size boundaries; consider re-checking the source scan.",
    );
  }
  return merged;
}

export function segmentPages(pages: ExtractedPage[]): SegmentResult {
  const warnings: string[] = [];
  const units = toLanguageUnits(pages, warnings);
  const chunks = chunkUnits(units, warnings);
  const languages = [...new Set(chunks.map((c) => c.language))];
  const articleNumbers = new Set(
    chunks.filter((c) => c.articleNumber).map((c) => `${c.language}:${c.articleNumber}`),
  );
  return { chunks, detectedLanguages: languages, articleCount: articleNumbers.size, warnings };
}

/** Aggregate per-article bilingual texts for the articles table. */
export function pairArticles(chunks: ChunkDraft[]): Map<
  string,
  { amText: string[]; enText: string[]; amPage: number | null; enPage: number | null; title: string | null }
> {
  const out = new Map<string, { amText: string[]; enText: string[]; amPage: number | null; enPage: number | null; title: string | null }>();
  for (const chunk of chunks) {
    if (!chunk.articleNumber) continue;
    const entry =
      out.get(chunk.articleNumber) ??
      { amText: [], enText: [], amPage: null, enPage: null, title: null };
    if (chunk.language === "am") {
      entry.amText.push(chunk.text);
      entry.amPage = entry.amPage ?? chunk.page;
    } else {
      entry.enText.push(chunk.text);
      entry.enPage = entry.enPage ?? chunk.page;
    }
    entry.title = entry.title ?? chunk.title;
    out.set(chunk.articleNumber, entry);
  }
  return out;
}
