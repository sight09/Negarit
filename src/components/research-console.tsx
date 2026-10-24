"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  BookOpenText,
  Briefcase,
  ChevronDown,
  Database,
  ExternalLink,
  FileText,
  Home,
  Info,
  Landmark,
  Languages,
  Library,
  Lightbulb,
  Lock,
  Menu,
  Receipt,
  RotateCcw,
  Search,
  Shield,
  Star,
  X,
  Check,
  Scale,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { getHealth, getSource, postChat, type ChatFilters } from "@/lib/api";
import type { ChatResponse, HealthStatus, SourceCard, SourceDetail } from "@/lib/types";
import { t, type UiLang } from "@/lib/i18n";
import { Card, ConfidenceBadge, LangBadge, Spinner, StatusChip, cn } from "./ui";
import { Sidebar } from "./sidebar";

const JURISDICTIONS = [
  "federal",
  "oromia",
  "amhara",
  "tigray",
  "somali",
  "afar",
  "sidama",
  "benishangul_gumuz",
  "gambela",
  "harari",
  "snnpr",
  "south_west",
  "central_ethiopia",
  "dire_dawa",
  "addis_ababa",
];

const STATUSES = ["IN_FORCE", "AMENDED", "REPEALED", "SUPERSEDED", "HISTORICAL", "UNKNOWN"];

const STATUS_LABELS: Record<string, string> = {
  IN_FORCE: "In Force",
  AMENDED: "Amended",
  REPEALED: "Repealed",
  SUPERSEDED: "Superseded",
  HISTORICAL: "Historical",
  UNKNOWN: "Unknown",
};

const LEGAL_AREAS = [
  {
    key: "labor",
    icon: Briefcase,
    titleEn: "Labor Law",
    titleAm: "የሰራተኛ ሕግ",
    descEn: "Employment, contracts & wages",
    descAm: "የስራ ስምሪትና ደመወዝ",
    queryEn: "What are the rights of an employee when an employment contract is terminated?",
    queryAm: "የስራ ስምሪት ውል ሲቋረጥ የሰራተኛው መብቶች ምንድን ናቸው?",
  },
  {
    key: "startup",
    icon: Star,
    titleEn: "Startup Proclamation",
    titleAm: "የስታርታፕ አዋጅ",
    descEn: "Proclamation No. 1396/2025 incentives",
    descAm: "አዋጅ ቁጥር 1396/2025",
    queryEn: "What is the Ethiopian Startup Proclamation No. 1396/2025?",
    queryAm: "የኢትዮጵያ የስታርታፕ አዋጅ ቁጥር 1396/2025 ምንድነው?",
  },
  {
    key: "data_protection",
    icon: Shield,
    titleEn: "Data Protection",
    titleAm: "የመረጃ ጥበቃ",
    descEn: "Personal data, rights & privacy",
    descAm: "የግል መረጃ ጥበቃና ደህንነት",
    queryEn: "Which law regulates personal data protection in Ethiopia?",
    queryAm: "የግል መረጃ ጥበቃን የሚቆጣጠረው ሕግ የትኛው ነው?",
  },
  {
    key: "land",
    icon: Home,
    titleEn: "Land Administration",
    titleAm: "የመሬት ሕግ",
    descEn: "Ownership, leases & rural tenure",
    descAm: "የገጠርና የከተማ መሬት ይዞታ",
    queryEn: "What is the current law regarding rural land administration in Ethiopia?",
    queryAm: "ስለ ገጠር መሬት አስተዳደር ወቅታዊው ሕግ ምንድነው?",
  },
  {
    key: "commercial",
    icon: BookOpen,
    titleEn: "Commercial Code",
    titleAm: "የንግድ ሕግ",
    descEn: "Business formation & trade contracts",
    descAm: "የንግድ ድርጅቶችና ውሎች",
    queryEn: "What does the Commercial Code say about company formation and liability?",
    queryAm: "የንግድ ሕጉ ስለ ኩባንያ ምስረታ ምን ይላል?",
  },
  {
    key: "investment",
    icon: BarChart3,
    titleEn: "Investment Law",
    titleAm: "የኢንቨስትመንት ሕግ",
    descEn: "Foreign capital & incentives",
    descAm: "የውጭና የአገር ውስጥ ኢንቨስትመንት",
    queryEn: "What are the requirements for foreign investment registration in Ethiopia?",
    queryAm: "ለውጭ ኢንቬስትመንት ምዝገባ ምን ምን መስፈርቶች አሉ?",
  },
  {
    key: "banking",
    icon: Landmark,
    titleEn: "Banking & Finance",
    titleAm: "የባንክና ፋይናንስ",
    descEn: "NBE directives, credit & forex",
    descAm: "የብሔራዊ ባንክ መመሪያዎች",
    queryEn: "What are the legal requirements for commercial bank operations in Ethiopia?",
    queryAm: "የኢትዮጵያ ንግድ ባንኮች የሕግ ማዕቀፍ እና የብሔራዊ ባንክ መመሪያዎች ምንድን ናቸው?",
  },
  {
    key: "tax",
    icon: Receipt,
    titleEn: "Tax & Customs",
    titleAm: "የግብርና ጉምሩክ",
    descEn: "VAT, duties & corporate income tax",
    descAm: "የገቢ ግብርና ጉምሩክ ታሪፍ",
    queryEn: "What are the corporate income tax rates under Ethiopian tax proclamation?",
    queryAm: "በኢትዮጵያ የገቢ ግብር አዋጅ መሰረት የንግድ ድርጅቶች የግብር መጠን ስንት ነው?",
  },
  {
    key: "cybersecurity",
    icon: Lock,
    titleEn: "Cybersecurity",
    titleAm: "የሳይበር ደህንነት",
    descEn: "Computer crimes & digital law",
    descAm: "የኮምፒውተር ወንጀልና ኤሌክትሮኒክ ግብይት",
    queryEn: "What acts constitute computer crimes under Ethiopian law?",
    queryAm: "በኢትዮጵያ የኮምፒውተር ወንጀል አዋጅ መሰረት ወንጀል ተብለው የተከለከሉት ምንድናቸው?",
  },
  {
    key: "intellectual_property",
    icon: Lightbulb,
    titleEn: "Intellectual Property",
    titleAm: "የአእምሯዊ ንብረት",
    descEn: "Patents, trademarks & copyright",
    descAm: "የፈጠራ መብትና የንግድ ምልክት",
    queryEn: "How are trademarks and patents registered and protected in Ethiopia?",
    queryAm: "በኢትዮጵያ የንግድ ምልክትና የፓተንት ምዝገባ ሥነ ሥርዓት እንዴት ይከናወናል?",
  },
];

const DEFAULT_RECENT = [
  { text: "What is the Ethiopian Startup Proclamation?", time: "Yesterday" },
  { text: "Labor notice period under Ethiopian law", time: "2 days ago" },
  { text: "Commercial Code regulations on share companies", time: "3 days ago" },
];

const TRY_SUGGESTIONS = [
  { text: "Startup Proclamation 1396/2025", q: "What is Startup Proclamation 1396/2025?" },
  { text: "Notice period for termination", q: "What is the legal notice period for employment termination?" },
  { text: "የሥራ ውል", q: "የሥራ ውል ማቋረጥ ሕጋዊ ሥነ ሥርዓት ምንድነው?" },
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
    if (
      /^(Issue|Applicable law|Relevant provisions|Explanation|Related provisions|Comparison|Summary|Current law|Historical law)[:\s]/i.test(
        line,
      )
    ) {
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
  return <div className={cn("answer-md text-[14.5px] text-ink-900 leading-relaxed", ethiopic && "ethiopic")}>{out}</div>;
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
    <div className="fixed inset-0 z-50 flex justify-end bg-ink-950/45 backdrop-blur-[2px]" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-xl flex-col border-l border-ink-200 bg-white shadow-2xl animate-rise"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b hairline bg-[#0e1726] px-5 py-4 text-white">
          <div className="min-w-0">
            <p className="label-caps !text-[#deb152]">{t(uiLang, "sourceViewer")}</p>
            <h3 className="font-display mt-1 truncate text-lg font-semibold text-white">
              {detail?.document?.title ?? "…"}
            </h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-paper-200/80">
              {detail?.document?.proclamationNumber && (
                <span className="rounded bg-ink-800 px-1.5 py-0.5">№ {detail.document.proclamationNumber}</span>
              )}
              {detail?.document && <StatusChip status={detail.document.status} />}
              {active && <LangBadge language={active.language} />}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t(uiLang, "close")}
            className="rounded-md p-1.5 text-paper-200 transition hover:bg-ink-800"
          >
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
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-ink-100 bg-paper-50 p-3.5 text-[12px] sm:grid-cols-3">
                {active.articleNumber && (
                  <div>
                    <p className="label-caps">{t(uiLang, "article")}</p>
                    <p className="num font-semibold">{active.articleNumber}</p>
                  </div>
                )}
                {active.page != null && (
                  <div>
                    <p className="label-caps">{t(uiLang, "page")}</p>
                    <p className="num font-semibold">{active.page}</p>
                  </div>
                )}
                <div>
                  <p className="label-caps">{t(uiLang, "jurisdiction")}</p>
                  <p className="font-semibold capitalize">{detail.document?.jurisdiction}</p>
                </div>
                <div>
                  <p className="label-caps">{t(uiLang, "category")}</p>
                  <p className="font-semibold capitalize">{detail.document?.category.replace(/_/g, " ")}</p>
                </div>
                <div>
                  <p className="label-caps">{t(uiLang, "extraction")}</p>
                  <p className="font-semibold">{active.extractionMethod ?? "—"}</p>
                </div>
                {detail.document?.publicationDate && (
                  <div>
                    <p className="label-caps">{t(uiLang, "published")}</p>
                    <p className="num font-semibold">{detail.document.publicationDate}</p>
                  </div>
                )}
                {(detail.document?.gazetteName || detail.document?.gazetteNumber) && (
                  <div className="col-span-2">
                    <p className="label-caps">{t(uiLang, "source")}</p>
                    <p className="font-semibold">
                      {[detail.document.gazetteName, detail.document.gazetteNumber && `№ ${detail.document.gazetteNumber}`]
                        .filter(Boolean)
                        .join(" — ") || detail.document.source || "—"}
                    </p>
                  </div>
                )}
              </div>

              {detail.pair && (
                <button
                  onClick={() => setShowPair((v) => !v)}
                  className="mt-3.5 inline-flex items-center gap-2 rounded-lg border border-[#deb152]/50 bg-[#fbf5e7] px-3.5 py-1.5 text-[12px] font-semibold text-[#8a6527] transition hover:bg-[#f6ebd1]"
                >
                  <Languages className="size-3.5" />
                  {showPair
                    ? active.language === "am"
                      ? "Show English version"
                      : "በአማርኛ አሳይ"
                    : detail.pair.language === "am"
                      ? "የአማርኛ ስሪት አሳይ (Amharic)"
                      : "Show English version (English)"}
                </button>
              )}

              <div
                className={cn(
                  "mt-4 whitespace-pre-wrap rounded-xl border border-ink-100 bg-[#fbf9f4] p-4 text-[13.5px] leading-relaxed text-ink-900",
                  isAm && "ethiopic text-[14.5px]",
                )}
              >
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
          <div className="flex items-center justify-between gap-3 border-t border-ink-100 bg-paper-50 px-5 py-3">
            <div className="text-[11px] text-ink-500">
              {detail.document.source && <span className="mr-2">{detail.document.source}</span>}
              <span className="rounded bg-ink-100 px-1.5 py-0.5 font-semibold text-ink-600">
                {detail.document.sourceType}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {detail.document.sourceUrl && (
                <a
                  href={detail.document.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-[#b88c32] hover:underline"
                >
                  {t(uiLang, "source")} <ExternalLink className="size-3" />
                </a>
              )}
              <a
                href={`/api/documents/${detail.document.id}/pdf${active?.page ? `#page=${active.page}` : ""}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0e1726] px-3.5 py-1.5 text-[12px] font-medium text-white transition hover:bg-ink-800"
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
  const [filters, setFilters] = useState<ChatFilters>({ jurisdiction: "federal", status: "IN_FORCE" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<ChatResponse | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [recent, setRecent] = useState<{ text: string; time: string }[]>(DEFAULT_RECENT);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [activeChunk, setActiveChunk] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("elr-sidebar-collapsed");
      if (saved !== null) {
        setSidebarCollapsed(saved === "true");
      }
    } catch {
      // default is false (showing sidebar)
    }
  }, []);

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("elr-sidebar-collapsed", String(next));
      return next;
    });
  };

  // Dropdown states for filter pills
  const [showJurisdictionMenu, setShowJurisdictionMenu] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const jurRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const lang = localStorage.getItem("elr-lang");
    if (lang === "am" || lang === "en") setUiLang(lang);
    const sid = localStorage.getItem("elr-session");
    if (sid) setSessionId(sid);
    try {
      const stored = JSON.parse(localStorage.getItem("elr-recent-v2") ?? "null");
      if (Array.isArray(stored) && stored.length > 0) setRecent(stored);
    } catch {
      // keep default
    }
    getHealth()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (jurRef.current && !jurRef.current.contains(e.target as Node)) {
        setShowJurisdictionMenu(false);
      }
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setShowStatusMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
          const filtered = prev.filter((r) => r.text !== text);
          const next = [{ text, time: "Just now" }, ...filtered].slice(0, 8);
          localStorage.setItem("elr-recent-v2", JSON.stringify(next));
          return next;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed.");
      } finally {
        setLoading(false);
      }
    },
    [filters, loading, mode, question, sessionId],
  );

  const answerIsAm = useMemo(() => {
    if (!response?.answer) return uiLang === "am";
    return response.language === "am" || /[ሀ-፞]/.test(response.answer);
  }, [response, uiLang]);

  return (
    <div className="flex min-h-screen bg-[#f7f4ed] text-ink-900 font-sans">
      {/* ── Left Sidebar (Dark Navy & Collapsible) ────────────────────────── */}
      <Sidebar
        activeItem={mode}
        onSelectMode={(m) => setMode(m)}
        recentSearches={recent}
        onSelectRecent={(text) => {
          setQuestion(text);
          void ask(text);
        }}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapsed}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      {/* ── Main Content Area ──────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 px-5 py-6 sm:px-8 lg:px-12 overflow-y-auto">
        <div className="mx-auto max-w-6xl">
          {/* Top Bar: Breadcrumb + Language Toggle */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="rounded-lg border border-[#ded5c2] p-1.5 text-ink-700 hover:bg-white md:hidden"
                aria-label="Open sidebar"
              >
                <Menu className="size-5" />
              </button>
              <nav className="text-xs text-ink-500 font-medium">
                <span>Workspace</span>
                <span className="mx-1.5 text-ink-400">›</span>
                <span className="text-ink-900 font-semibold capitalize">
                  {mode === "research" ? "Legal Research" : mode === "quick" ? "Quick Answer" : "Compare Laws"}
                </span>
              </nav>
            </div>

            {/* Language Pill Toggle */}
            <div className="inline-flex items-center rounded-full border border-[#ded5c2] bg-[#eee7d8] p-1 shadow-2xs">
              <button
                onClick={() => switchLang("en")}
                className={cn(
                  "rounded-full px-4 py-1 text-xs font-semibold transition-all",
                  uiLang === "en"
                    ? "bg-[#0d1625] text-white shadow-xs"
                    : "text-ink-700 hover:text-ink-950",
                )}
              >
                English
              </button>
              <button
                onClick={() => switchLang("am")}
                className={cn(
                  "ethiopic rounded-full px-4 py-1 text-xs font-medium transition-all",
                  uiLang === "am"
                    ? "bg-[#0d1625] text-white shadow-xs font-bold"
                    : "text-ink-700 hover:text-ink-950",
                )}
              >
                አማርኛ
              </button>
            </div>
          </div>

          {/* Hero Heading */}
          <div className="mt-8 flex flex-col items-center text-center">
            <h1 className="font-display font-serif text-3xl sm:text-4xl lg:text-[40px] font-bold tracking-tight text-[#0c1626] leading-tight text-balance">
              {uiLang === "am"
                ? "የኢትዮጵያን ሕግ በታማኝ የነጋሪት ጋዜጣ አንቀጾች ይመርምሩ"
                : "Research Ethiopian Law with Verified Citations"}
            </h1>
            <p className="mt-2.5 w-full max-w-4xl text-sm leading-relaxed text-ink-600 mx-auto text-center">
              {uiLang === "am"
                ? "ይፋዊ የፌዴራል ነጋሪት ጋዜጣ ድንጋጌዎችን በአማርኛ እና በእንግሊዝኛ በታማኝ ማስረጃዎች ይመርምሩ።"
                : "Bilingual legal intelligence across official Federal Negarit Gazettes with zero-hallucination citations in Amharic and English."}
            </p>
          </div>

          {/* ── Search & Filter Box ────────────────────────────────────────── */}
          <div className="mt-7 rounded-2xl border border-[#ded5c2] bg-white p-5 shadow-xs">
            {/* Top Row: Mode Indicator + AI Model-Picker Style Dropdowns */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0e9dc] pb-4">
              {/* Left: Active Mode Indicator */}
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-xl bg-[#fbf5e7] border border-[#f0e3c5] text-[#b88c32] shadow-2xs">
                  {mode === "research" ? (
                    <Search className="size-4" />
                  ) : mode === "quick" ? (
                    <Zap className="size-4" />
                  ) : (
                    <Scale className="size-4" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold text-ink-950 leading-none">
                    {mode === "research"
                      ? "Legal Research"
                      : mode === "quick"
                        ? "Quick Answer"
                        : "Compare Laws"}
                  </p>
                  <p className="text-[10.5px] text-ink-400 mt-0.5">
                    {mode === "research"
                      ? "Grounded provision retrieval"
                      : mode === "quick"
                        ? "Direct extractive answer"
                        : "Statutory provision comparison"}
                  </p>
                </div>
              </div>

              {/* Right: Model-Picker Style Filter Selectors */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Jurisdiction Model-Picker */}
                <div className="relative" ref={jurRef}>
                  <button
                    onClick={() => {
                      setShowJurisdictionMenu((v) => !v);
                      setShowStatusMenu(false);
                    }}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-xl border px-3.5 py-1.5 text-xs font-medium transition-all shadow-2xs cursor-pointer",
                      filters.jurisdiction
                        ? "border-[#deb152] bg-[#fdfaf3] text-ink-950 font-semibold"
                        : "border-[#ded5c2] bg-white text-ink-700 hover:border-[#deb152] hover:bg-[#fdfaf3]",
                    )}
                  >
                    <Landmark className={cn("size-3.5", filters.jurisdiction ? "text-[#b88c32]" : "text-ink-400")} />
                    <span className="truncate max-w-[130px] sm:max-w-none">
                      {filters.jurisdiction
                        ? filters.jurisdiction === "federal"
                          ? "Federal Law"
                          : filters.jurisdiction.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
                        : "All Jurisdictions"}
                    </span>
                    <ChevronDown
                      className={cn(
                        "size-3 transition-transform text-ink-400",
                        showJurisdictionMenu && "rotate-180 text-ink-800",
                      )}
                    />
                  </button>

                  {showJurisdictionMenu && (
                    <div className="absolute right-0 top-full z-30 mt-1.5 w-60 rounded-2xl border border-[#ded5c2] bg-white p-2 shadow-xl animate-fade-in">
                      <div className="px-2.5 py-1.5 border-b border-[#f0e9dc] mb-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#8a7550]">JURISDICTION</p>
                        <p className="text-[11px] text-ink-400">Select legal territory</p>
                      </div>
                      <div className="max-h-64 overflow-y-auto scroll-thin space-y-0.5">
                        <button
                          onClick={() => {
                            setFilters((f) => ({ ...f, jurisdiction: undefined }));
                            setShowJurisdictionMenu(false);
                          }}
                          className={cn(
                            "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors",
                            !filters.jurisdiction
                              ? "bg-[#fbf5e7] font-bold text-[#8a6527]"
                              : "text-ink-700 hover:bg-[#f4eee2]",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <Landmark className="size-3.5 text-ink-400" />
                            <span>All Jurisdictions</span>
                          </div>
                          {!filters.jurisdiction && <Check className="size-3.5 text-[#deb152]" />}
                        </button>
                        {JURISDICTIONS.map((j) => {
                          const active = filters.jurisdiction === j;
                          const label =
                            j === "federal"
                              ? "Federal Negarit Gazette"
                              : j.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                          return (
                            <button
                              key={j}
                              onClick={() => {
                                setFilters((f) => ({ ...f, jurisdiction: j }));
                                setShowJurisdictionMenu(false);
                              }}
                              className={cn(
                                "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors",
                                active ? "bg-[#fbf5e7] font-bold text-[#8a6527]" : "text-ink-700 hover:bg-[#f4eee2]",
                              )}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <span className={cn("size-1.5 rounded-full shrink-0", active ? "bg-[#deb152]" : "bg-ink-300")} />
                                <span className="truncate">{label}</span>
                              </div>
                              {active && <Check className="size-3.5 text-[#deb152] shrink-0 ml-1.5" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Status Model-Picker */}
                <div className="relative" ref={statusRef}>
                  <button
                    onClick={() => {
                      setShowStatusMenu((v) => !v);
                      setShowJurisdictionMenu(false);
                    }}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-xl border px-3.5 py-1.5 text-xs font-medium transition-all shadow-2xs cursor-pointer",
                      filters.status
                        ? "border-[#deb152] bg-[#fdfaf3] text-ink-950 font-semibold"
                        : "border-[#ded5c2] bg-white text-ink-700 hover:border-[#deb152] hover:bg-[#fdfaf3]",
                    )}
                  >
                    <ShieldCheck className={cn("size-3.5", filters.status ? "text-[#b88c32]" : "text-ink-400")} />
                    <span className="truncate max-w-[120px] sm:max-w-none">
                      {filters.status ? STATUS_LABELS[filters.status] ?? filters.status : "All Statuses"}
                    </span>
                    <ChevronDown
                      className={cn(
                        "size-3 transition-transform text-ink-400",
                        showStatusMenu && "rotate-180 text-ink-800",
                      )}
                    />
                  </button>

                  {showStatusMenu && (
                    <div className="absolute right-0 top-full z-30 mt-1.5 w-56 rounded-2xl border border-[#ded5c2] bg-white p-2 shadow-xl animate-fade-in">
                      <div className="px-2.5 py-1.5 border-b border-[#f0e9dc] mb-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#8a7550]">ENACTMENT STATUS</p>
                        <p className="text-[11px] text-ink-400">Filter by legal validity</p>
                      </div>
                      <div className="space-y-0.5">
                        <button
                          onClick={() => {
                            setFilters((f) => ({ ...f, status: undefined }));
                            setShowStatusMenu(false);
                          }}
                          className={cn(
                            "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors",
                            !filters.status
                              ? "bg-[#fbf5e7] font-bold text-[#8a6527]"
                              : "text-ink-700 hover:bg-[#f4eee2]",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="size-3.5 text-ink-400" />
                            <span>All Statuses</span>
                          </div>
                          {!filters.status && <Check className="size-3.5 text-[#deb152]" />}
                        </button>
                        {STATUSES.map((s) => {
                          const active = filters.status === s;
                          return (
                            <button
                              key={s}
                              onClick={() => {
                                setFilters((f) => ({ ...f, status: s }));
                                setShowStatusMenu(false);
                              }}
                              className={cn(
                                "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors",
                                active ? "bg-[#fbf5e7] font-bold text-[#8a6527]" : "text-ink-700 hover:bg-[#f4eee2]",
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    "size-1.5 rounded-full shrink-0",
                                    s === "IN_FORCE"
                                      ? "bg-[#10b981]"
                                      : s === "AMENDED"
                                        ? "bg-[#deb152]"
                                        : "bg-ink-400",
                                  )}
                                />
                                <span>{STATUS_LABELS[s] ?? s}</span>
                              </div>
                              {active && <Check className="size-3.5 text-[#deb152] shrink-0 ml-1.5" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Search Input Row */}
            <div className="mt-4 flex flex-col sm:flex-row gap-2.5">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void ask();
                  }
                }}
                placeholder={
                  uiLang === "am"
                    ? "ስለ ኢትዮጵያ ሕግ ይጠይቁ… ለምሳሌ «የአዋጅ 1396/2025 አንቀጽ 3 ምን ይላል?»"
                    : 'Ask about Ethiopian law, e.g. "What does Article 3 of Proclamation 1396/2025 say?"'
                }
                className={cn(
                  "flex-1 rounded-xl border border-[#ded5c2] bg-white px-4 py-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-[#deb152] focus:outline-none focus:ring-2 focus:ring-[#deb152]/30 shadow-2xs",
                  uiLang === "am" && "ethiopic",
                )}
              />
              <button
                onClick={() => void ask()}
                disabled={loading || !question.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#deb152] px-8 py-3 text-sm font-semibold text-ink-950 transition-all hover:bg-[#d4a544] disabled:cursor-not-allowed disabled:opacity-50 shadow-sm shrink-0"
              >
                {loading ? <Spinner /> : <Search className="size-4" />}
                <span>{loading ? "Searching…" : "Search"}</span>
              </button>
            </div>

            {/* Try Suggestions Row */}
            <div className="mt-3.5 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium text-ink-400">Try</span>
              {TRY_SUGGESTIONS.map((item, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setQuestion(item.q);
                    void ask(item.q);
                  }}
                  className={cn(
                    "rounded-full border border-[#ded5c2] bg-[#fbf9f4] px-3.5 py-1 text-xs text-ink-700 transition-colors hover:border-[#deb152] hover:bg-[#fdfaf3] hover:text-ink-900",
                    /[ሀ-፞]/.test(item.text) && "ethiopic font-medium",
                  )}
                >
                  {item.text}
                </button>
              ))}
            </div>
          </div>

          {/* ── Search Results (When Active) ─────────────────────────────────── */}
          {loading && (
            <div className="mt-8 rounded-2xl border border-[#ded5c2] bg-white p-6 shadow-xs animate-rise">
              <div className="shimmer h-6 w-48 rounded" />
              <div className="shimmer mt-4 h-32 rounded-xl" />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="shimmer h-24 rounded-xl" />
                <div className="shimmer h-24 rounded-xl" />
              </div>
            </div>
          )}

          {error && (
            <div className="mt-6 flex items-center justify-between rounded-xl border border-clay-600/30 bg-clay-100 p-4 text-sm text-clay-600">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 shrink-0" />
                <span>{error}</span>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-xs font-semibold underline hover:text-clay-700"
              >
                Dismiss
              </button>
            </div>
          )}

          {response && !loading && (
            <div className="mt-8 rounded-2xl border border-[#ded5c2] bg-white p-6 shadow-sm animate-rise">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0e9dc] pb-4">
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
                  <span className="rounded-full border border-ink-200 bg-[#fbf9f4] px-2.5 py-1 text-[11px] font-medium text-ink-600">
                    Route: {response.route}
                  </span>
                  <span className="num text-[11px] text-ink-400">
                    {response.retrieval.latencyMs}ms
                    {response.retrieval.llmLatencyMs != null && ` · LLM ${response.retrieval.llmLatencyMs}ms`}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setResponse(null);
                    setQuestion("");
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1 text-xs font-medium text-ink-600 transition hover:bg-ink-50"
                >
                  <RotateCcw className="size-3.5" /> Back to overview
                </button>
              </div>

              {response.notices.length > 0 && (
                <div className="mt-3.5 space-y-1.5">
                  {response.notices.map((n, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 rounded-lg border border-gold-600/25 bg-gold-100/70 px-3 py-2 text-[12px] text-gold-600"
                    >
                      <Info className="mt-0.5 size-3.5 shrink-0" />
                      <span className={cn(uiLang === "am" && "ethiopic")}>{n}</span>
                    </div>
                  ))}
                </div>
              )}

              {response.answer ? (
                <div className="mt-4">
                  <p className="label-caps mb-3 flex items-center gap-1.5 text-[#8a7550]">
                    <BookOpenText className="size-3.5" /> {t(uiLang, "answer")}
                  </p>
                  {renderMd(response.answer, answerIsAm)}
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-ink-200 p-4 text-xs text-ink-500">
                  {t(uiLang, "noSources")}
                </div>
              )}

              {response.sources.length > 0 && (
                <div className="mt-7 border-t border-[#f0e9dc] pt-5">
                  <p className="label-caps mb-3 flex items-center gap-1.5 text-[#8a7550]">
                    <Library className="size-3.5" /> {t(uiLang, "sources")} · {response.sources.length}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {response.sources.map((s) => (
                      <SourceCardView
                        key={s.chunkId}
                        source={s}
                        uiLang={uiLang}
                        onOpen={() => setActiveChunk(s.chunkId)}
                      />
                    ))}
                  </div>
                </div>
              )}

              <details className="mt-6 rounded-xl border border-[#e8dfcf] bg-[#fbf9f4] p-3 text-[11.5px] text-ink-500">
                <summary className="cursor-pointer font-semibold text-ink-700">Retrieval diagnostics</summary>
                <div className="num mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div>vector: {response.retrieval.vectorResults}</div>
                  <div>BM25: {response.retrieval.keywordResults}</div>
                  <div>fused: {response.retrieval.fusedResults}</div>
                  <div>top score: {response.retrieval.topScore}</div>
                </div>
                <p className="mt-2 text-[10.5px] italic text-ink-400">
                  confidence basis: {response.confidenceBasis}
                </p>
              </details>
            </div>
          )}

          {/* ── Auto-Sliding Dynamic Horizontal LEGAL AREAS Carousel ─────────── */}
          <section className="mt-8">
            <div className="mb-3.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#8a7550]">LEGAL AREAS</p>
            </div>

            {/* Marquee Container with edge gradients */}
            <div className="relative overflow-hidden rounded-2xl border border-[#ded5c2] bg-gradient-to-b from-[#fbf9f4] to-white p-3.5 shadow-2xs group">
              {/* Left and right gradient fade overlays */}
              <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white/90 to-transparent z-10" />
              <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white/90 to-transparent z-10" />

              <div className="animate-marquee flex gap-3.5 py-1">
                {[...LEGAL_AREAS, ...LEGAL_AREAS].map((area, idx) => {
                  const Icon = area.icon;
                  return (
                    <button
                      key={`${area.key}-${idx}`}
                      onClick={() => {
                        setFilters((f) => ({ ...f, category: area.key }));
                        const q = uiLang === "am" ? area.queryAm : area.queryEn;
                        setQuestion(q);
                        void ask(q);
                      }}
                      className="group/card flex w-64 sm:w-72 shrink-0 flex-col rounded-xl border border-[#ded5c2] bg-white p-4 text-left transition-all hover:border-[#deb152] hover:shadow-md hover:-translate-y-0.5 cursor-pointer shadow-2xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex size-9 items-center justify-center rounded-lg border border-[#f0e3c5] bg-[#fbf5e7] text-[#c2963a] transition-transform group-hover/card:scale-110">
                          <Icon className="size-4.5" />
                        </div>
                        <span className="rounded-full bg-[#f4eee2] px-2 py-0.5 text-[10px] font-semibold text-[#8a6527] uppercase tracking-wide">
                          Law
                        </span>
                      </div>
                      <div className="mt-3">
                        <h4 className="text-sm font-bold text-ink-950 group-hover/card:text-[#9e7626] transition-colors">
                          {uiLang === "am" ? area.titleAm : area.titleEn}
                        </h4>
                        <p className="mt-0.5 text-xs text-ink-500 line-clamp-1">
                          {uiLang === "am" ? area.descAm : area.descEn}
                        </p>
                      </div>
                      <div className="mt-3.5 flex items-center justify-between pt-2.5 border-t border-[#f2ede4]">
                        <span className="text-[11px] font-medium text-[#b88c32]">
                          {health?.stats?.chunks ?? 0} provisions
                        </span>
                        <span className="text-xs font-semibold text-ink-400 group-hover/card:text-[#b88c32] group-hover/card:translate-x-0.5 transition-all">
                          Search →
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ── Priority Sources Section ───────────────────────────────────── */}
          <div className="mt-8">
            <div className="flex items-center justify-between mb-3.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#8a7550]">PRIORITY SOURCES</p>
              <Link
                href="/admin"
                className="text-xs font-semibold text-[#8a6527] hover:text-[#5e4312] transition-colors"
              >
                Open Corpus Library →
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-2xl border border-[#ded5c2] bg-white p-5 shadow-2xs">
              <div className="flex items-center justify-between rounded-xl border border-[#f2ede4] bg-[#fbf9f4] p-4 text-xs">
                <div>
                  <p className="font-bold text-sm text-ink-950">Startup Proclamation No. 1396/2025</p>
                  <p className="text-[11px] text-ink-500 mt-0.5">Federal Negarit Gazette · Official Enactment</p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-semibold shrink-0 ml-3",
                    (health?.stats?.documents ?? 0) > 0
                      ? "bg-[#dcefdf] text-[#2e7d4f]"
                      : "bg-[#fceee4] text-[#b45309]",
                  )}
                >
                  {(health?.stats?.documents ?? 0) > 0 ? "Indexed & Grounded" : "Not uploaded"}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[#f2ede4] bg-[#fbf9f4] p-4 text-xs">
                <div>
                  <p className="font-bold text-sm text-ink-950">Federal Gazettes & Proclamations</p>
                  <p className="text-[11px] text-ink-500 mt-0.5">Labor, Commercial Code, Civil Code & Regulations</p>
                </div>
                <span className="rounded-full bg-[#f1f3f6] px-3 py-1 text-[11px] font-semibold text-ink-600 shrink-0 ml-3">
                  {health?.stats?.documents ?? 0} uploaded
                </span>
              </div>
            </div>
          </div>

          {/* Footer Disclaimer */}
          <footer className="mt-14 border-t border-[#ded5c2]/60 py-6 text-center">
            <p className="text-xs text-ink-400">
              Legal information based on indexed official sources, not a substitute for advice from a qualified legal
              professional.
            </p>
          </footer>
        </div>
      </main>

      {/* Slide-over Source Sheet */}
      {activeChunk && (
        <SourceSheet chunkId={activeChunk} uiLang={uiLang} onClose={() => setActiveChunk(null)} />
      )}
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
    <Card hover onClick={onOpen} className="flex flex-col p-4 bg-white border-[#ded5c2] rounded-xl shadow-2xs">
      <div className="flex items-start justify-between gap-2">
        <span className="rounded-md bg-[#0d1625] px-2 py-0.5 font-mono text-[11px] font-bold text-[#deb152]">
          [{s.ref}]
        </span>
        <StatusChip status={s.status} />
      </div>
      <h4 className="font-display mt-2 line-clamp-2 text-[14px] font-semibold leading-snug text-ink-950">
        {s.title}
      </h4>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-500">
        {s.proclamationNumber && <span className="num font-semibold text-[#b88c32]">№ {s.proclamationNumber}</span>}
        {s.article && (
          <span className="rounded bg-[#fbf5e7] border border-[#f0e3c5] px-1.5 py-0.5 font-semibold text-[#8a6527]">
            {t(uiLang, "article")} {s.article}
            {s.subArticle ? `(${s.subArticle})` : ""}
          </span>
        )}
        {s.page != null && <span className="num">{t(uiLang, "page")} {s.page}</span>}
        <LangBadge language={s.language} />
        {s.pairedLanguage && (
          <span className="inline-flex items-center gap-0.5 rounded border border-[#deb152]/40 bg-[#fbf5e7] px-1 py-0.5 text-[9.5px] text-[#8a6527]">
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
