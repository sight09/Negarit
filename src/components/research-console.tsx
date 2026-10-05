"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookOpenText,
  ChevronDown,
  Database,
  ExternalLink,
  FileText,
  Gavel,
  History,
  Info,
  Languages,
  Library,
  Scale,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { getHealth, getSource, postChat, type ChatFilters } from "@/lib/api";
import type { ChatResponse, HealthStatus, SourceCard, SourceDetail } from "@/lib/types";
import { t, type UiLang } from "@/lib/i18n";
import { Button, Card, ConfidenceBadge, LangBadge, Select, Spinner, StatusChip, cn } from "./ui";

const CATEGORIES = [
  "constitution","civil","criminal","criminal_procedure","commercial","business","labor",
  "family","land","property","tax","customs","banking","finance","insurance","investment",
  "startup","technology","cybersecurity","data_protection","telecommunications",
  "intellectual_property","environment","health","education","agriculture","mining",
  "energy","transport","procurement","public_finance","administrative","elections",
  "human_rights","immigration","citizenship","treaties","other",
];
const JURISDICTIONS = [
  "federal","oromia","amhara","tigray","somali","afar","sidama","benishangul_gumuz",
  "gambela","harari","snnpr","south_west","central_ethiopia","dire_dawa","addis_ababa",
];
const STATUSES = ["IN_FORCE","AMENDED","REPEALED","SUPERSEDED","HISTORICAL","UNKNOWN"];
const DOC_TYPES = ["constitution","proclamation","regulation","directive","code","treaty","other"];

const SAMPLE_AREAS: { key: string; en: string; am: string }[] = [
  { key: "labor", en: "What are the rights of an employee when an employment contract is terminated?", am: "የስራ ስምሪት ውል ሲቋረጥ የሰራተኛው መብቶች ምንድን ናቸው?" },
  { key: "startup", en: "What is the Ethiopian Startup Proclamation?", am: "የኢትዮጵያ የስታርታፕ አዋጅ ምንድነው?" },
  { key: "data_protection", en: "Which law regulates personal data protection in Ethiopia?", am: "የግል መረጃ ጥበቃን የሚቆጣጠረው ሕግ የትኛው ነው?" },
  { key: "land", en: "What is the current law regarding rural land administration?", am: "ስለ ገጠር መሬት አስተዳደር ወቅታዊው ሕግ ምንድነው?" },
  { key: "commercial", en: "What does the Commercial Code say about companies?", am: "የንግድ ሕግ ስለ ኩባኒያዎች ምን ይላል?" },
  { key: "investment", en: "What are the requirements for foreign investment registration?", am: "ለውጭ ኢንቬስትመንት ምዝገባ ምን ምን መስፈርቶች አሉ?" },
];

/** Minimal legal-markdown renderer (bold, blockquote, headings, lists, hr). */
function renderMd(text: string, ethiopic: boolean): ReactNode {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let list: string[] = [];
  const inline = (s: string, k: string): ReactNode => {
    const parts = s.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) =>
      p.startsWith("**") && p.endsWith("**") ? (
        <strong key={`${k}-${i}`}>{p.slice(2, -2)}</strong>
      ) : (
        <span key={`${k}-${i}`}>{p}</span>
      ),
    );
  };
  const flushList = (key: string) => {
    if (list.length) {
      out.push(
        <ul key={key} className="my-2 list-disc space-y-1 pl-6">
          {list.map((li, i) => (
            <li key={i}>{inline(li, `${key}-${i}`)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushList(`ul-${idx}`);
      return;
    }
    if (line.startsWith("> ")) {
      flushList(`ul-${idx}`);
      out.push(<blockquote key={idx}>{inline(line.slice(2), `q${idx}`)}</blockquote>);
      return;
    }
    if (/^-{3,}$/.test(line.trim())) {
      flushList(`ul-${idx}`);
      out.push(<hr key={idx} />);
      return;
    }
    if (/^(#{2,4}\s+.+)$/.test(line)) {
      flushList(`ul-${idx}`);
      out.push(<h4 key={idx}>{inline(line.replace(/^#{2,4}\s+/, ""), `h${idx}`)}</h4>);
      return;
    }
    if (/^(Issue|Applicable law|Relevant provisions|Explanation|Related provisions|Comparison|Summary|Current law|Historical law)[:\s]/i.test(line)) {
      flushList(`ul-${idx}`);
      out.push(<h4 key={idx}>{inline(line.replace(/:$/, ""), `h${idx}`)}</h4>);
      return;
    }
    if (/^([-*•]|\d+[.)])\s+/.test(line)) {
      list.push(line.replace(/^([-*•]|\d+[.)])\s+/, ""));
      return;
    }
    flushList(`ul-${idx}`);
    out.push(<p key={idx}>{inline(line, `p${idx}`)}</p>);
  });
  flushList("ul-end");
  return <div className={cn("answer-md text-[15px] text-ink-800", ethiopic && "ethiopic")}>{out}</div>;
}

function SourceSheet({
  chunkId,
  uiLang,
  onClose,
}: {
  chunkId: string;
  uiLang: UiLang;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<SourceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPair, setShowPair] = useState(false);

  useEffect(() => {
    setDetail(null);
    setError(null);
    setShowPair(false);
    getSource(chunkId)
      .then(setDetail)
      .catch((e) => setError(e.message));
  }, [chunkId]);

  const active = detail ? (showPair && detail.pair ? detail.pair : detail.chunk) : null;
  const isAm = active?.language === "am";

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink-950/40 backdrop-blur-[2px]" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-xl flex-col border-l border-ink-200 bg-paper-50 shadow-2xl animate-rise"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b hairline bg-ink-900 px-5 py-4 text-paper-50">
          <div className="min-w-0">
            <p className="label-caps !text-brass-300">{t(uiLang, "sourceViewer")}</p>
            <h3 className="font-display mt-1 truncate text-lg font-semibold">
              {detail?.document?.title ?? "…"}
            </h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-paper-200/80">
              {detail?.document?.proclamationNumber && (
                <span className="rounded bg-ink-700 px-1.5 py-0.5">№ {detail.document.proclamationNumber}</span>
              )}
              {detail?.document && <StatusChip status={detail.document.status} />}
              {active && <LangBadge language={active.language} />}
            </div>
          </div>
          <button onClick={onClose} aria-label={t(uiLang, "close")} className="rounded-md p-1.5 text-paper-200 transition hover:bg-ink-700">
            <X className="size-4" />
          </button>
        </div>

        <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-clay-600/30 bg-clay-100 p-3 text-sm text-clay-600">
              <AlertTriangle className="size-4 shrink-0" /> {error}
            </div>
          )}
          {!detail && !error && <div className="shimmer h-64 rounded-xl" />}
          {detail && active && (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border hairline bg-white/60 p-3 text-[12.5px] sm:grid-cols-3">
                {active.articleNumber && (
                  <div><p className="label-caps">{t(uiLang, "article")}</p><p className="num font-semibold">{active.articleNumber}</p></div>
                )}
                {active.page != null && (
                  <div><p className="label-caps">{t(uiLang, "page")}</p><p className="num font-semibold">{active.page}</p></div>
                )}
                <div><p className="label-caps">{t(uiLang, "jurisdiction")}</p><p className="font-semibold capitalize">{detail.document?.jurisdiction}</p></div>
                <div><p className="label-caps">{t(uiLang, "category")}</p><p className="font-semibold capitalize">{detail.document?.category.replace(/_/g, " ")}</p></div>
                <div><p className="label-caps">{t(uiLang, "extraction")}</p><p className="font-semibold">{active.extractionMethod ?? "—"}</p></div>
                {detail.document?.publicationDate && (
                  <div><p className="label-caps">{t(uiLang, "published")}</p><p className="num font-semibold">{detail.document.publicationDate}</p></div>
                )}
                {(detail.document?.gazetteName || detail.document?.gazetteNumber) && (
                  <div className="col-span-2">
                    <p className="label-caps">{t(uiLang, "source")}</p>
                    <p className="font-semibold">
                      {[detail.document.gazetteName, detail.document.gazetteNumber && `№ ${detail.document.gazetteNumber}`].filter(Boolean).join(" — ") || detail.document.source || "—"}
                    </p>
                  </div>
                )}
              </div>

              {detail.pair && (
                <button
                  onClick={() => setShowPair((v) => !v)}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg border border-brass-500/40 bg-brass-100/60 px-3 py-1.5 text-[12px] font-medium text-brass-700 transition hover:bg-brass-100"
                >
                  <Languages className="size-3.5" />
                  {showPair
                    ? active.language === "am" ? "Show English version" : "በአማርኛ አሳይ"
                    : detail.pair.language === "am" ? "የአማርኛ ስሪት አሳይ (Amharic)" : "Show English version (English)"}
                </button>
              )}

              <div className={cn("mt-4 whitespace-pre-wrap rounded-lg border hairline bg-white/70 p-4 text-[13.5px] leading-relaxed text-ink-800", isAm && "ethiopic text-[14px]")}>
                {active.text}
              </div>

              {detail.siblings.length > 1 && (
                <p className="mt-3 text-[11.5px] text-ink-500">
                  {detail.siblings.length} chunks make up this article ({detail.siblings.map((s) => s.language.toUpperCase()).join(" · ")}).
                </p>
              )}
            </>
          )}
        </div>

        {detail?.document && (
          <div className="flex items-center justify-between gap-3 border-t hairline bg-paper-100 px-5 py-3">
            <div className="text-[11px] text-ink-500">
              {detail.document.source && <span className="mr-2">{detail.document.source}</span>}
              <span className="rounded bg-ink-100 px-1.5 py-0.5 font-semibold text-ink-600">
                {detail.document.sourceType}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {detail.document.sourceUrl && (
                <a href={detail.document.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] font-medium text-brass-600 hover:underline">
                  {t(uiLang, "source")} <ExternalLink className="size-3" />
                </a>
              )}
              <a
                href={`/api/documents/${detail.document.id}/pdf${active?.page ? `#page=${active.page}` : ""}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-ink-900 px-3 py-1.5 text-[12px] font-medium text-paper-50 transition hover:bg-ink-700"
              >
                <FileText className="size-3.5" /> {t(uiLang, "viewPdf")}
              </a>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

export default function ResearchConsole() {
  const [uiLang, setUiLang] = useState<UiLang>("en");
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<"quick" | "research" | "compare">("research");
  const [filters, setFilters] = useState<ChatFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<ChatResponse | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [recent, setRecent] = useState<string[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [activeChunk, setActiveChunk] = useState<string | null>(null);

  useEffect(() => {
    const lang = localStorage.getItem("elr-lang");
    if (lang === "am" || lang === "en") setUiLang(lang);
    const sid = localStorage.getItem("elr-session");
    if (sid) setSessionId(sid);
    try {
      setRecent(JSON.parse(localStorage.getItem("elr-recent") ?? "[]"));
    } catch {
      setRecent([]);
    }
    getHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  const switchLang = (lang: UiLang) => {
    setUiLang(lang);
    localStorage.setItem("elr-lang", lang);
    document.documentElement.lang = lang === "am" ? "am" : "en";
  };

  const ask = useCallback(
    async (q?: string) => {
      const text = (q ?? question).trim();
      if (!text || loading) return;
      setLoading(true);
      setError(null);
      try {
        const res = await postChat({
          question: text,
          sessionId,
          mode,
          filters,
          answerLanguage: "auto",
        });
        setResponse(res);
        setSessionId(res.sessionId);
        localStorage.setItem("elr-session", res.sessionId);
        setRecent((prev) => {
          const next = [text, ...prev.filter((r) => r !== text)].slice(0, 8);
          localStorage.setItem("elr-recent", JSON.stringify(next));
          return next;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed.");
      } finally {
        setLoading(false);
      }
    },
    [question, loading, sessionId, mode, filters],
  );

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((v) => v && v !== "any").length,
    [filters],
  );
  const corpusEmpty = health !== null && health.stats.documents === 0;
  const answerIsAm = response?.language === "am";

  const filterSelect = (key: keyof ChatFilters, label: string, options: string[]) => (
    <div key={key} className="min-w-32 flex-1 sm:flex-none sm:w-40">
      <p className="label-caps mb-1">{label}</p>
      <Select
        ariaLabel={label}
        value={filters[key] ?? "any"}
        onChange={(v) => setFilters((f) => ({ ...f, [key]: v === "any" ? undefined : v }))}
        options={[
          { value: "any", label: t(uiLang, "any") },
          ...options.map((o) => ({ value: o, label: o.replace(/_/g, " ") })),
        ]}
      />
    </div>
  );

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-16 sm:px-6">
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between gap-4 border-b hairline py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-ink-900 text-brass-300 shadow-inner">
            <Scale className="size-5" />
          </div>
          <div>
            <h1 className="font-display text-lg font-bold leading-tight tracking-tight">
              {uiLang === "am" ? t("am", "appTitle") : t("en", "appTitle")}
              <span className="ethiopic ml-2 font-normal text-ink-500">የኢትዮጵያ ሕግ</span>
            </h1>
            <p className="text-[11.5px] text-ink-500">{t(uiLang, "tagline")}</p>
          </div>
        </div>
        <nav className="flex items-center gap-2">
          <button
            onClick={() => switchLang(uiLang === "am" ? "en" : "am")}
            className="flex items-center gap-1.5 rounded-lg border border-ink-200 bg-paper-50 px-3 py-1.5 text-[12.5px] font-semibold text-ink-700 transition hover:border-brass-500/60"
          >
            <Languages className="size-3.5" />
            <span className={uiLang === "am" ? "" : "ethiopic"}>{uiLang === "am" ? "English" : "አማርኛ"}</span>
          </button>
          <Link
            href="/admin"
            className="flex items-center gap-1.5 rounded-lg border border-ink-200 bg-paper-50 px-3 py-1.5 text-[12.5px] font-medium text-ink-600 transition hover:border-brass-500/60"
          >
            <Database className="size-3.5" /> {t(uiLang, "navAdmin")}
          </Link>
        </nav>
      </header>

      {/* ── Ask hero ────────────────────────────────────────────────── */}
      <section className="mt-8">
        <div className="rule-double mb-6" />
        <h2 className="font-display text-center text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
          {uiLang === "am" ? "ስለ ኢትዮጵያ ሕግ ምን ማወቅ ይፈልጋሉ?" : "Research Ethiopian law with grounded citations"}
        </h2>
        <p className={cn("mx-auto mt-2 max-w-2xl text-center text-[13.5px] text-ink-500", uiLang === "am" && "ethiopic")}>
          {t(uiLang, "emptyBody")}
        </p>

        <Card className="mx-auto mt-6 max-w-3xl p-4 sm:p-5">
          <div className="flex flex-col gap-3">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void ask();
                }
              }}
              rows={2}
              placeholder={uiLang === "am" ? t("am", "askPlaceholder") : t("en", "askPlaceholder")}
              className={cn(
                "w-full resize-none rounded-lg border border-ink-200 bg-white/80 px-3.5 py-2.5 text-[15px] text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-brass-500 focus:ring-2 focus:ring-brass-300/40",
                uiLang === "am" && "ethiopic",
              )}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex overflow-hidden rounded-lg border border-ink-200">
                {(["quick", "research", "compare"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={cn(
                      "px-3 py-1.5 text-[12px] font-semibold transition",
                      mode === m ? "bg-ink-900 text-paper-50" : "bg-paper-50 text-ink-500 hover:bg-ink-100/60",
                    )}
                  >
                    {m === "quick" ? t(uiLang, "quick") : m === "research" ? t(uiLang, "research") : t(uiLang, "compare")}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowFilters((v) => !v)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition",
                    showFilters || activeFilterCount > 0
                      ? "border-brass-500/50 bg-brass-100/60 text-brass-700"
                      : "border-ink-200 text-ink-600 hover:bg-ink-100/60",
                  )}
                >
                  <SlidersHorizontal className="size-3.5" />
                  {t(uiLang, "filters")}
                  {activeFilterCount > 0 && (
                    <span className="rounded-full bg-brass-500 px-1.5 text-[10px] font-bold text-white">{activeFilterCount}</span>
                  )}
                  <ChevronDown className={cn("size-3 transition-transform", showFilters && "rotate-180")} />
                </button>
                <Button onClick={() => void ask()} disabled={loading || !question.trim()}>
                  {loading ? <Spinner /> : <Search className="size-4" />}
                  {loading ? t(uiLang, "asking") : t(uiLang, "ask")}
                </Button>
              </div>
            </div>
          </div>
          {showFilters && (
            <div className="mt-4 animate-rise border-t hairline pt-4">
              <div className="flex flex-wrap gap-3">
                {filterSelect("language", t(uiLang, "fLanguage"), ["am", "en", "bilingual"])}
                {filterSelect("jurisdiction", t(uiLang, "fJurisdiction"), JURISDICTIONS)}
                {filterSelect("category", t(uiLang, "fCategory"), CATEGORIES)}
                {filterSelect("status", t(uiLang, "fStatus"), STATUSES)}
                {filterSelect("documentType", t(uiLang, "fDocType"), DOC_TYPES)}
                <div className="w-28">
                  <p className="label-caps mb-1">{t(uiLang, "fYear")}</p>
                  <input
                    value={filters.year ?? ""}
                    onChange={(e) => setFilters((f) => ({ ...f, year: e.target.value || undefined }))}
                    placeholder="2025"
                    className="num w-full rounded-lg border border-ink-200 bg-paper-50 px-2.5 py-1.5 text-[13px] outline-none focus:border-brass-500"
                  />
                </div>
                <div className="w-36">
                  <p className="label-caps mb-1">{t(uiLang, "fProc")}</p>
                  <input
                    value={filters.proclamationNumber ?? ""}
                    onChange={(e) => setFilters((f) => ({ ...f, proclamationNumber: e.target.value || undefined }))}
                    placeholder="1396/2025"
                    className="num w-full rounded-lg border border-ink-200 bg-paper-50 px-2.5 py-1.5 text-[13px] outline-none focus:border-brass-500"
                  />
                </div>
                <div className="flex items-end">
                  <Button variant="ghost" className="!px-2.5" onClick={() => setFilters({})}>
                    {t(uiLang, "clear")}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Popular areas */}
        <div className="mx-auto mt-5 max-w-3xl">
          <p className="label-caps mb-2 text-center">{t(uiLang, "popular")}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {SAMPLE_AREAS.map((area) => (
              <button
                key={area.key}
                onClick={() => {
                  setFilters((f) => ({ ...f, category: area.key }));
                  setQuestion(uiLang === "am" ? area.am : area.en);
                }}
                className="group flex items-center gap-1.5 rounded-full border border-ink-200 bg-paper-50 px-3 py-1 text-[12px] text-ink-600 transition hover:border-brass-500/60 hover:text-ink-900"
              >
                <Gavel className="size-3 text-brass-500" />
                <span className="capitalize">{area.key.replace("_", " ")}</span>
                <ArrowRight className="size-3 opacity-0 transition group-hover:opacity-100" />
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Corpus status / empty state ─────────────────────────────── */}
      {corpusEmpty && !response && (
        <Card className="mx-auto mt-10 max-w-3xl animate-rise border-dashed p-8 text-center">
          <Library className="mx-auto size-10 text-brass-500" />
          <h3 className="font-display mt-3 text-xl font-semibold">{t(uiLang, "corpusEmpty")}</h3>
          <p className={cn("mx-auto mt-2 max-w-xl text-[13.5px] leading-relaxed text-ink-500", uiLang === "am" && "ethiopic")}>
            {t(uiLang, "corpusEmptyBody")}
          </p>
          <Link href="/admin">
            <Button className="mt-4">{t(uiLang, "goAdmin")}</Button>
          </Link>
          {health && (
            <div className="mx-auto mt-6 flex max-w-md flex-wrap justify-center gap-2 text-[11px] text-ink-500">
              <span className={cn("rounded-full border px-2 py-0.5", health.subsystems.database ? "border-jade-600/30 bg-jade-100 text-jade-600" : "border-clay-600/30 bg-clay-100 text-clay-600")}>
                PostgreSQL {health.subsystems.database ? "connected" : "down"}
              </span>
              <span className="rounded-full border border-ink-200 bg-ink-50 px-2 py-0.5">Qdrant: {health.subsystems.qdrant.replace("_", " ")}</span>
              <span className={cn("rounded-full border px-2 py-0.5", health.subsystems.embeddings === "configured" ? "border-jade-600/30 bg-jade-100 text-jade-600" : "border-gold-600/30 bg-gold-100 text-gold-600")}>
                BGE-M3: {health.subsystems.embeddings === "configured" ? "configured" : "HF_TOKEN missing (BM25 mode)"}
              </span>
              <span className={cn("rounded-full border px-2 py-0.5", health.subsystems.llm === "configured" ? "border-jade-600/30 bg-jade-100 text-jade-600" : "border-gold-600/30 bg-gold-100 text-gold-600")}>
                LLM: {health.subsystems.llm === "configured" ? "configured" : "not configured (extractive answers)"}
              </span>
            </div>
          )}
        </Card>
      )}

      {/* ── Loading skeleton ────────────────────────────────────────── */}
      {loading && (
        <div className="mx-auto mt-10 w-full max-w-3xl animate-rise">
          <div className="shimmer h-6 w-52 rounded" />
          <div className="shimmer mt-3 h-36 rounded-xl" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="shimmer h-28 rounded-xl" />
            <div className="shimmer h-28 rounded-xl" />
          </div>
        </div>
      )}

      {error && (
        <div className="mx-auto mt-8 flex max-w-3xl items-center gap-2 rounded-xl border border-clay-600/30 bg-clay-100 p-4 text-sm text-clay-600">
          <AlertTriangle className="size-4 shrink-0" /> {error}
        </div>
      )}

      {/* ── Answer + sources ────────────────────────────────────────── */}
      {response && !loading && (
        <section key={response.sessionId + String(response.retrieval.latencyMs)} className="mx-auto mt-10 w-full max-w-3xl animate-rise">
          <div className="flex flex-wrap items-center gap-2">
            <ConfidenceBadge
              level={response.confidence}
              label={
                response.confidence === "STRONG"
                  ? t(uiLang, "strong")
                  : response.confidence === "MODERATE"
                    ? t(uiLang, "moderate")
                    : t(uiLang, "insufficient")
              }
            />
            <span className="rounded-full border border-ink-200 bg-ink-50 px-2.5 py-1 text-[11px] font-medium text-ink-600">
              {t(uiLang, "route")}: {response.route}
            </span>
            <span className="rounded-full border border-ink-200 bg-ink-50 px-2.5 py-1 text-[11px] font-medium text-ink-600">
              {response.mode === "quick" ? t(uiLang, "quick") : response.mode === "research" ? t(uiLang, "research") : t(uiLang, "compare")}
            </span>
            <span className="num ml-auto text-[11px] text-ink-400">
              {response.retrieval.latencyMs}ms{response.retrieval.llmLatencyMs != null && ` · LLM ${response.retrieval.llmLatencyMs}ms`}
            </span>
          </div>

          {response.notices.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {response.notices.map((n, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-gold-600/25 bg-gold-100/70 px-3 py-2 text-[12px] text-gold-600">
                  <Info className="mt-0.5 size-3.5 shrink-0" />
                  <span className={cn(uiLang === "am" && "ethiopic")}>{n}</span>
                </div>
              ))}
            </div>
          )}

          {response.answer ? (
            <Card className="mt-4 p-5 sm:p-6">
              <p className="label-caps mb-3 flex items-center gap-1.5">
                <BookOpenText className="size-3.5" /> {t(uiLang, "answer")}
              </p>
              {renderMd(response.answer, answerIsAm)}
            </Card>
          ) : (
            <Card className="mt-4 border-dashed p-5 text-[13px] text-ink-500">
              {t(uiLang, "noSources")}
            </Card>
          )}

          {response.sources.length > 0 && (
            <div className="mt-6">
              <p className="label-caps mb-3 flex items-center gap-1.5">
                <Library className="size-3.5" /> {t(uiLang, "sources")} · {response.sources.length}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {response.sources.map((s) => (
                  <SourceCardView key={s.chunkId} source={s} uiLang={uiLang} onOpen={() => setActiveChunk(s.chunkId)} />
                ))}
              </div>
            </div>
          )}

          {response.relatedDocuments.length > 0 && (
            <div className="mt-5">
              <p className="label-caps mb-2">{t(uiLang, "relatedDocs")}</p>
              <div className="flex flex-wrap gap-2">
                {response.relatedDocuments.map((d) => (
                  <span key={d.documentId} className="inline-flex items-center gap-2 rounded-lg border hairline bg-white/70 px-2.5 py-1.5 text-[12px] text-ink-700">
                    <FileText className="size-3.5 text-brass-500" />
                    {d.title}
                    {d.proclamationNumber && <span className="num text-ink-400">№ {d.proclamationNumber}</span>}
                    <StatusChip status={d.status} />
                  </span>
                ))}
              </div>
            </div>
          )}

          <details className="mt-5 rounded-xl border hairline bg-white/50 px-4 py-3 text-[12px] text-ink-500">
            <summary className="cursor-pointer font-semibold text-ink-600">{t(uiLang, "diagnostics")}</summary>
            <div className="num mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div>vector: {response.retrieval.vectorResults}</div>
              <div>BM25: {response.retrieval.keywordResults}</div>
              <div>fused: {response.retrieval.fusedResults}</div>
              <div>reranked: {response.retrieval.rerankedResults}</div>
              <div>backend: {response.retrieval.vectorBackend}</div>
              <div>dense: {response.retrieval.denseEnabled ? "on" : "off"}</div>
              <div>top score: {response.retrieval.topScore}</div>
              <div>lang: {response.retrieval.detectedLanguage}</div>
            </div>
            <div className="mt-2 space-y-0.5">
              {response.retrieval.searchesPerformed.map((sp, i) => (
                <p key={i} className="font-mono text-[10.5px] text-ink-400">{sp}</p>
              ))}
            </div>
            {Object.keys(response.retrieval.filtersApplied).length > 0 && (
              <p className="mt-1">filters: {JSON.stringify(response.retrieval.filtersApplied)}</p>
            )}
            <p className="mt-2 border-t hairline pt-2 text-[11px] italic">
              confidence basis: {response.confidenceBasis} — confidence labels derive from retrieval scores and exact-metadata matching, never from model self-assessment.
            </p>
          </details>
        </section>
      )}

      {/* ── Recent searches ─────────────────────────────────────────── */}
      {recent.length > 0 && !loading && (
        <div className="mx-auto mt-12 w-full max-w-3xl">
          <p className="label-caps mb-2 flex items-center gap-1.5">
            <History className="size-3.5" /> {t(uiLang, "recent")}
          </p>
          <div className="flex flex-col divide-y divide-ink-100 rounded-xl border hairline bg-white/60">
            {recent.slice(0, 6).map((r) => (
              <button
                key={r}
                onClick={() => {
                  setQuestion(r);
                  void ask(r);
                }}
                className={cn(
                  "flex items-center justify-between gap-3 px-4 py-2.5 text-left text-[13px] text-ink-700 transition hover:bg-brass-100/40",
                  /[ሀ-፞]/.test(r) && "ethiopic",
                )}
              >
                <span className="truncate">{r}</span>
                <ArrowRight className="size-3.5 shrink-0 text-ink-300" />
              </button>
            ))}
          </div>
        </div>
      )}

      <footer className="mt-14 border-t hairline pt-4">
        <p className={cn("mx-auto max-w-3xl text-center text-[11.5px] leading-relaxed text-ink-400", uiLang === "am" && "ethiopic")}>
          {t(uiLang, "disclaimer")}
        </p>
        <p className="mt-1 text-center text-[10.5px] text-ink-300">
          Ethiopian Legal RAG · hybrid BGE-M3 + BM25 retrieval · article-level citations · federal &amp; regional jurisdiction aware
        </p>
      </footer>

      {activeChunk && <SourceSheet chunkId={activeChunk} uiLang={uiLang} onClose={() => setActiveChunk(null)} />}
    </div>
  );
}

function SourceCardView({
  source: s,
  uiLang,
  onOpen,
}: {
  source: SourceCard;
  uiLang: UiLang;
  onOpen: () => void;
}) {
  return (
    <Card hover onClick={onOpen} className="flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="rounded-md bg-ink-900 px-2 py-0.5 font-mono text-[11px] font-bold text-brass-300">[{s.ref}]</span>
        <StatusChip status={s.status} />
      </div>
      <h4 className="font-display mt-2 line-clamp-2 text-[14.5px] font-semibold leading-snug text-ink-900">
        {s.title}
      </h4>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-ink-500">
        {s.proclamationNumber && <span className="num font-semibold text-brass-600">№ {s.proclamationNumber}</span>}
        {s.article && (
          <span className="rounded bg-brass-100 px-1.5 py-0.5 font-semibold text-brass-700">
            {t(uiLang, "article")} {s.article}{s.subArticle ? `(${s.subArticle})` : ""}
          </span>
        )}
        {s.page != null && <span className="num">{t(uiLang, "page")} {s.page}</span>}
        <LangBadge language={s.language} />
        {s.pairedLanguage && (
          <span className="inline-flex items-center gap-0.5 rounded border border-brass-500/30 px-1 py-0.5 text-[9.5px] text-brass-600">
            <Languages className="size-2.5" /> pair
          </span>
        )}
      </div>
      <p className={cn("mt-2 line-clamp-3 text-[12px] leading-relaxed text-ink-600", s.language === "am" && "ethiopic")}>
        {s.excerpt.slice(0, 220)}…
      </p>
      <div className="mt-auto flex items-center justify-between pt-3 text-[10.5px] text-ink-400">
        <span className="capitalize">{s.jurisdiction} · {s.category.replace(/_/g, " ")}</span>
        <span className="num">{t(uiLang, "score")} {s.score.toFixed(2)}</span>
      </div>
    </Card>
  );
}
