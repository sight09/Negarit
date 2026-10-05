/**
 * PDF text extraction (mirrors backend/app/ingestion). Uses PDF.js in Node —
 * the TS equivalent of the PyMuPDF first-pass: if a usable text layer exists
 * we extract it verbatim; otherwise the document is flagged as needing OCR
 * instead of silently inventing content.
 */

export interface ExtractedPage {
  page: number;
  text: string;
  lines: string[];
  extractionMethod: "TEXT_LAYER" | "OCR" | "MANUAL";
}

export class ScannedPdfError extends Error {}

interface PdfTextItem {
  str?: string;
  transform?: number[];
  hasEOL?: boolean;
}

interface PdfPageLike {
  getTextContent(): Promise<{ items: PdfTextItem[] }>;
}

interface PdfDocumentLike {
  numPages: number;
  getPage(n: number): Promise<PdfPageLike>;
  destroy(): Promise<void>;
}

interface PdfjsLike {
  getDocument(opts: Record<string, unknown>): {
    promise: Promise<PdfDocumentLike>;
  };
  GlobalWorkerOptions: { workerSrc?: string };
}

function ensureNodeCompat() {
  // pdfjs v4 expects Promise.withResolvers (Node >= 22). Polyfill for Node 20.
  const p = Promise as unknown as { withResolvers?: unknown };
  if (typeof p.withResolvers !== "function") {
    (Promise as unknown as Record<string, unknown>).withResolvers = function withResolvers<T>() {
      let resolve!: (v: T) => void;
      let reject!: (e?: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
  }
}

const ETHIOPIC = /[ሀ-፟ᎀ-᎟ⶀ-ⷞꬁ-꬯]/;  // U+1200-137F, 1380-139F, 2D80-2DDF, AB00-AB2F

function looksCorrupted(text: string): boolean {
  // Replacement glyphs / private-use noise are typical of a broken text layer.
  const bad = (text.match(/�|[-]/g) ?? []).length;
  return text.length > 40 && bad / text.length > 0.02;
}

export async function extractPdfPages(buffer: Buffer): Promise<{
  pages: ExtractedPage[];
  pageCount: number;
  warnings: string[];
}> {
  ensureNodeCompat();
  const warnings: string[] = [];
  let pdfjs: PdfjsLike;
  try {
    const mod = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs = mod as unknown as PdfjsLike;
    // Node needs a concrete worker module URL; pdfjs will run it or fall back
    // to the main thread for text extraction.
    const { pathToFileURL } = await import("url");
    const { existsSync } = await import("fs");
    const pathMod = await import("path");
    let workerPath = pathMod.join(
      process.cwd(),
      "node_modules",
      "pdfjs-dist",
      "legacy",
      "build",
      "pdf.worker.min.mjs",
    );
    if (!existsSync(workerPath)) {
      // Bundled deployments: resolve via package exports instead.
      const { createRequire } = await import("module");
      const req = createRequire(process.cwd() + "/");
      workerPath = req.resolve("pdfjs-dist/legacy/build/pdf.worker.min.mjs");
    }
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).toString();
  } catch (err) {
    throw new Error(
      `Failed to load PDF engine: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true,
    verbosity: 0,
  });
  const doc = await task.promise;
  const pages: ExtractedPage[] = [];

  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      // Reconstruct reading-order lines from positioned text runs.
      const rows = new Map<number, { x: number; str: string }[]>();
      for (const item of content.items) {
        const str = item.str ?? "";
        if (!str.trim()) continue;
        const y = Math.round((item.transform?.[5] ?? 0) / 3) * 3;
        const x = item.transform?.[4] ?? 0;
        const bucket = rows.get(y) ?? [];
        bucket.push({ x, str });
        rows.set(y, bucket);
      }
      const lines = [...rows.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, items]) =>
          items
            .sort((a, b) => a.x - b.x)
            .map((i) => i.str)
            .join(" ")
            .replace(/\s{2,}/g, " ")
            .trim(),
        )
        .filter((l) => l.length > 0);
      const text = lines.join("\n");
      if (looksCorrupted(text)) {
        warnings.push(
          `Page ${n}: text layer appears corrupted (possible bad encoding). Manual review required.`,
        );
      }
      pages.push({ page: n, text, lines, extractionMethod: "TEXT_LAYER" });
    }
  } finally {
    await doc.destroy();
  }

  const totalChars = pages.reduce((sum, p) => sum + p.text.length, 0);
  const alphaChars = totalChars - (pages.join.length ? 0 : 0);
  void alphaChars;
  const hasAmharic = pages.some((p) => ETHIOPIC.test(p.text));
  if (totalChars < 25 * Math.max(1, doc.numPages)) {
    throw new ScannedPdfError(
      "This PDF has no usable text layer (likely a scanned image). OCR is required before indexing — the document has been queued with status FAILED and extraction method OCR so it is never silently treated as authoritative.",
    );
  }
  if (!hasAmharic) {
    warnings.push("No Ethiopic script detected — document is treated as English-only unless metadata says bilingual.");
  }
  return { pages, pageCount: doc.numPages, warnings };
}
