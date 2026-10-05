/**
 * BM25 (Okapi) keyword retrieval with a Unicode-aware tokenizer that keeps
 * Ethiopic (Amharic) characters, Latin letters, digits and the "/" used in
 * proclamation numbers such as 1396/2025.
 */

const TOKEN_SPLIT = /[^\p{L}\p{N}/]+/u;

const EN_STOPWORDS = new Set([
  "the", "a", "an", "of", "in", "on", "for", "to", "is", "are", "was", "were",
  "what", "which", "who", "whom", "does", "do", "did", "and", "or", "by",
  "with", "under", "according", "say", "says", "about", "regarding", "law",
  "ethiopian", "ethiopia", "be", "been", "it", "its", "this", "that",
]);

const AM_STOPWORDS = new Set(["ምንድን", "ምንድነው", "ናቸው", "ነው", "የ", "ለ", "በ", "ስለ", "እና", "ወይም"]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(TOKEN_SPLIT)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !EN_STOPWORDS.has(t) && !AM_STOPWORDS.has(t));
}

export interface Bm25Doc {
  id: string;
  tokens: string[];
  length: number;
}

export class BM25Index {
  private docs: Bm25Doc[];
  private df = new Map<string, number>();
  private tf: Map<string, number>[] = [];
  private avgLen = 0;
  private k1 = 1.5;
  private b = 0.75;

  constructor(rows: { id: string; text: string }[]) {
    this.docs = rows.map((r) => {
      const tokens = tokenize(r.text);
      return { id: r.id, tokens, length: tokens.length };
    });
    this.avgLen =
      this.docs.reduce((s, d) => s + d.length, 0) / Math.max(1, this.docs.length);
    for (const doc of this.docs) {
      const tf = new Map<string, number>();
      for (const token of doc.tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
      this.tf.push(tf);
      for (const token of tf.keys()) this.df.set(token, (this.df.get(token) ?? 0) + 1);
    }
  }

  search(query: string, topK: number): { id: string; score: number }[] {
    const terms = tokenize(query);
    if (terms.length === 0 || this.docs.length === 0) return [];
    const n = this.docs.length;
    const scored: { id: string; score: number }[] = [];
    for (let i = 0; i < n; i++) {
      const doc = this.docs[i];
      const tf = this.tf[i];
      let score = 0;
      for (const term of terms) {
        const f = tf.get(term) ?? 0;
        if (f === 0) continue;
        const df = this.df.get(term) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        const denom = f + this.k1 * (1 - this.b + (this.b * doc.length) / this.avgLen);
        score += idf * ((f * (this.k1 + 1)) / denom);
      }
      if (score > 0) scored.push({ id: doc.id, score });
    }
    scored.sort((a2, b2) => b2.score - a2.score);
    return scored.slice(0, topK);
  }
}
