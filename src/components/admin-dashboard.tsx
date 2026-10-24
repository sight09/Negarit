"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Database,
  FileText,
  FileUp,
  Globe,
  KeyRound,
  Landmark,
  Layers,
  Loader2,
  RefreshCw,
  Scale,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
  Menu,
  Activity,
  Cpu,
  Zap,
} from "lucide-react";
import {
  deleteDocument,
  getAnalytics,
  getChunks,
  getDocument,
  getDocuments,
  getHealth,
  reingest,
  testEmbeddings,
  uploadDocument,
} from "@/lib/api";
import type { Analytics, ChunkRow, DocumentRow, HealthStatus, JobRow } from "@/lib/types";
import { Button, Card, LangBadge, Spinner, StatusChip, cn } from "./ui";
import { Sidebar } from "./sidebar";

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
const JOB_STYLES: Record<string, string> = {
  COMPLETED: "text-jade-600 bg-jade-100 border-jade-600/30",
  FAILED: "text-clay-600 bg-clay-100 border-clay-600/30",
  PROCESSING: "text-brass-700 bg-brass-100 border-brass-500/40",
  QUEUED: "text-ink-500 bg-ink-100 border-ink-200",
};

export default function AdminDashboard() {
  const [token, setToken] = useState("");
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [chunksDoc, setChunksDoc] = useState<{ doc: DocumentRow; chunks: ChunkRow[]; lang: string } | null>(null);
  const [detail, setDetail] = useState<DocumentRow | null>(null);
  const [embedTest, setEmbedTest] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

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

  const refresh = useCallback(async () => {
    const [h, a, d] = await Promise.all([
      getHealth().catch(() => null),
      getAnalytics().catch(() => null),
      getDocuments(query ? { q: query } : undefined).catch(() => ({ documents: [], count: 0 })),
    ]);
    setHealth(h);
    setAnalytics(a);
    setDocs(d.documents);
  }, [query]);

  useEffect(() => {
    setToken(localStorage.getItem("elr-admin-token") ?? "");
    void refresh();
  }, [refresh]);

  // Live-poll while any ingestion job is active.
  const hasActiveJob = docs.some((d) => d.latestJob && ["QUEUED", "PROCESSING"].includes(d.latestJob.status));
  useEffect(() => {
    if (!hasActiveJob) return;
    const timer = setInterval(() => void refresh(), 2500);
    return () => clearInterval(timer);
  }, [hasActiveJob, refresh]);

  const saveToken = (value: string) => {
    setToken(value);
    localStorage.setItem("elr-admin-token", value);
  };

  const onUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setUploadMsg({ ok: false, text: "Choose a PDF file first." });
      return;
    }
    setUploading(true);
    setUploadMsg(null);
    try {
      const res = await uploadDocument(form, token);
      setUploadMsg({ ok: true, text: `“${res.document.title}” queued for ingestion (job ${res.jobId.slice(0, 8)}…).` });
      formRef.current?.reset();
      await refresh();
    } catch (err) {
      setUploadMsg({ ok: false, text: err instanceof Error ? err.message : "Upload failed." });
    } finally {
      setUploading(false);
    }
  };

  const runJob = async (id: string, kind: "ingest" | "reindex") => {
    setBusyId(id + kind);
    try {
      await reingest(id, kind, token);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to start job.");
    } finally {
      setBusyId(null);
    }
  };

  const removeDoc = async (doc: DocumentRow) => {
    if (!confirm(`Delete “${doc.title}” and all of its chunks, embeddings and index entries?`)) return;
    setBusyId(doc.id + "delete");
    try {
      await deleteDocument(doc.id, token);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusyId(null);
    }
  };

  const openChunks = async (doc: DocumentRow, lang = "any") => {
    const { chunks } = await getChunks(doc.id, lang !== "any" ? { language: lang } : undefined);
    setChunksDoc({ doc, chunks, lang });
  };

  const openDetail = async (doc: DocumentRow) => {
    if (expanded === doc.id) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    setExpanded(doc.id);
    setDetail(null);
    setDetail(await getDocument(doc.id));
  };

  const runEmbedTest = async () => {
    setEmbedTest("running…");
    try {
      const res = await testEmbeddings(
        ["employee annual leave rights", "የሰራተኛ ዓመታዊ ዕረፍት መብት"],
        token,
      );
      setEmbedTest(`BGE-M3 OK — ${res.count} bilingual vectors, ${res.dims} dims each (Amharic + English).`);
    } catch (err) {
      setEmbedTest(err instanceof Error ? err.message : "Embedding test failed.");
    }
  };

  const docsCount = analytics?.totals.documents ?? health?.stats.documents ?? 0;
  const chunksCount = analytics?.totals.chunks ?? health?.stats.chunks ?? 0;
  const embeddedCount = analytics?.totals.embeddedChunks ?? 0;
  const articlesCount = analytics?.totals.articles ?? health?.stats.articles ?? 0;
  const avgRetrieval = analytics?.totals.avgRetrievalMs ?? 0;
  const avgLlm = analytics?.totals.avgLlmMs ?? 0;
  const coveragePct = chunksCount > 0 ? Math.min(100, Math.round((embeddedCount / chunksCount) * 100)) : 0;

  return (
    <div className="flex min-h-screen bg-[#f7f4ed] text-ink-900 font-sans">
      <Sidebar
        activeItem="admin"
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapsed}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      <main className="flex-1 min-w-0 px-4 py-6 sm:px-8 lg:px-10 overflow-y-auto">
        <div className="mx-auto max-w-6xl pb-16">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ded5c2]/60 pb-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="rounded-lg border border-[#ded5c2] p-1.5 text-ink-700 hover:bg-white md:hidden"
                aria-label="Open sidebar"
              >
                <Menu className="size-5" />
              </button>
              <div className="flex items-center gap-2.5">
                <Image
                  src="/logo.png"
                  alt="Corpus Administration Logo"
                  width={36}
                  height={36}
                  className="size-9 object-contain"
                  priority
                />
                <div>
                  <h1 className="font-display text-lg font-bold leading-tight">Corpus Administration</h1>
                  <p className="text-[11px] text-ink-500">Ingest gazettes · monitor jobs · inspect chunks</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <KeyRound className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-400" />
                <input
                  value={token}
                  onChange={(e) => saveToken(e.target.value)}
                  placeholder="Admin token (if ADMIN_TOKEN is set)"
                  type="password"
                  className="w-64 rounded-lg border border-ink-200 bg-paper-50 py-1.5 pl-8 pr-3 text-[12px] outline-none focus:border-brass-500"
                />
              </div>
              <Button variant="outline" onClick={() => void refresh()}>
                <RefreshCw className="size-3.5" /> Refresh
              </Button>
            </div>
          </header>

      {/* ── Creative Bento Telemetry Suite ─────────────────────────── */}
      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Card 1: Official Gazette Corpus Assets (4 cols) */}
        <div className="lg:col-span-4 rounded-2xl border border-[#ded5c2] bg-white p-5 shadow-2xs flex flex-col justify-between transition-all hover:border-[#deb152]/60 hover:shadow-xs group">
          <div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f4eee2] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#8a6527]">
                <FileText className="size-3 text-[#deb152]" />
                Official Gazette Corpus
              </span>
              <span className="text-[11px] font-medium text-ink-400">Library Assets</span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-4">
              <div className="border-r border-[#f0e8db] pr-3">
                <p className="num text-3xl font-extrabold tracking-tight text-ink-950">
                  {docsCount}
                </p>
                <p className="mt-1 text-xs font-semibold text-ink-800">Gazette Documents</p>
                <p className="text-[10.5px] text-ink-400 mt-0.5">Enacted PDF Acts</p>
              </div>
              <div className="pl-1">
                <p className="num text-3xl font-extrabold tracking-tight text-[#b88c32]">
                  {articlesCount}
                </p>
                <p className="mt-1 text-xs font-semibold text-ink-800">Articles & Clauses</p>
                <p className="text-[10.5px] text-ink-400 mt-0.5">Indexed Provisions</p>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-[#f4ede2] flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-500">
              <span className={cn("size-2 rounded-full", docsCount > 0 ? "bg-[#10b981]" : "bg-[#f59e0b]")} />
              {docsCount > 0 ? "Corpus loaded & active" : "Ready for PDF upload"}
            </span>
            <span className="rounded-full bg-[#fbf5e7] border border-[#f0e3c5] px-2 py-0.5 font-bold text-[#8a6527] text-[10.5px]">
              Bilingual
            </span>
          </div>
        </div>

        {/* Card 2: Vector Space & Embeddings (4 cols) */}
        <div className="lg:col-span-4 rounded-2xl border border-[#ded5c2] bg-gradient-to-br from-white via-[#fcfaf5] to-[#fbf5e7] p-5 shadow-2xs flex flex-col justify-between transition-all hover:border-[#deb152]/60 hover:shadow-xs group">
          <div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#deb152]/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#8a6527]">
                <Sparkles className="size-3 text-[#deb152]" />
                Vector Intelligence
              </span>
              <span className="text-[11px] font-mono text-[#8a6527] font-semibold">1024-dim</span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-4">
              <div className="border-r border-[#eddcc0] pr-3">
                <p className="num text-3xl font-extrabold tracking-tight text-ink-950">
                  {chunksCount}
                </p>
                <p className="mt-1 text-xs font-semibold text-ink-800">Text Chunks</p>
                <p className="text-[10.5px] text-ink-400 mt-0.5">Bilingual Slices</p>
              </div>
              <div className="pl-1">
                <p className="num text-3xl font-extrabold tracking-tight text-[#b88c32]">
                  {embeddedCount}
                </p>
                <p className="mt-1 text-xs font-semibold text-ink-800">Vectors</p>
                <p className="text-[10.5px] text-ink-400 mt-0.5">Dense Points</p>
              </div>
            </div>

            {/* Vector Density Progress Track */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-[11px] mb-1.5">
                <span className="font-medium text-ink-600">Vector Index Density</span>
                <span className="font-bold text-[#8a6527]">{coveragePct}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#ede5d6]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#deb152] to-[#b38525] transition-all duration-500"
                  style={{ width: `${Math.max(coveragePct, chunksCount === 0 ? 0 : 5)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="mt-4 pt-2">
            <button
              onClick={() => void runEmbedTest()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#deb152]/50 bg-white/90 py-1.5 px-3 text-xs font-semibold text-[#8a6527] hover:bg-[#deb152] hover:text-ink-950 transition-all shadow-2xs cursor-pointer"
            >
              <Sparkles className="size-3.5 text-[#deb152]" /> Test BGE-M3 Embedding
            </button>
            {embedTest && (
              <p className="mt-2 text-[11px] text-ink-600 bg-white/80 rounded-lg p-2 border border-[#deb152]/40">
                {embedTest}
              </p>
            )}
          </div>
        </div>

        {/* Card 3: Real-Time Engine Telemetry (4 cols) */}
        <div className="lg:col-span-4 rounded-2xl border border-[#1e2d42] bg-[#0d1625] p-5 shadow-sm text-white flex flex-col justify-between transition-all hover:border-[#deb152]/40 group relative overflow-hidden">
          {/* Subtle background glow */}
          <div className="pointer-events-none absolute -right-12 -top-12 size-36 rounded-full bg-[#deb152]/5 blur-2xl" />

          <div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#17253a] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#deb152]">
                <Activity className="size-3 text-[#10b981]" />
                Engine Telemetry
              </span>
              <span className="inline-flex items-center gap-1 text-[10.5px] text-[#7e92ac]">
                <span className="size-1.5 rounded-full bg-[#10b981] animate-pulse" />
                Live Subsystems
              </span>
            </div>

            {/* Dual Latency HUD */}
            <div className="mt-5 grid grid-cols-2 gap-4">
              <div className="border-r border-[#1a283c] pr-3">
                <div className="flex items-baseline gap-1">
                  <span className="num text-3xl font-extrabold tracking-tight text-white">{avgRetrieval}</span>
                  <span className="text-xs text-[#7e92ac] font-mono">ms</span>
                </div>
                <div className="flex items-center gap-1 mt-1 text-xs font-semibold text-[#a6b8ce]">
                  <Zap className="size-3 text-[#deb152]" />
                  <span>Avg Retrieval</span>
                </div>
                <p className="text-[10px] text-[#5e718b] mt-0.5">Hybrid BM25 + Vector</p>
              </div>

              <div className="pl-1">
                <div className="flex items-baseline gap-1">
                  <span className="num text-3xl font-extrabold tracking-tight text-white">{avgLlm}</span>
                  <span className="text-xs text-[#7e92ac] font-mono">ms</span>
                </div>
                <div className="flex items-center gap-1 mt-1 text-xs font-semibold text-[#a6b8ce]">
                  <Cpu className="size-3 text-[#deb152]" />
                  <span>Avg LLM</span>
                </div>
                <p className="text-[10px] text-[#5e718b] mt-0.5">Synthesis Latency</p>
              </div>
            </div>
          </div>

          {/* Subsystem Health Status Ribbon */}
          <div className="mt-5 pt-3 border-t border-[#1a283c]">
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", health?.subsystems?.database ? "bg-[#10b981]" : "bg-[#ef4444]")} />
                <span className="text-[#a6b8ce] truncate">PostgreSQL</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", health?.subsystems?.qdrant === "ok" || health?.subsystems?.qdrant === "up" ? "bg-[#10b981]" : "bg-[#f87171]")} />
                <span className="text-[#a6b8ce] truncate">Qdrant ({health?.subsystems?.qdrant ?? "off"})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", health?.subsystems?.embeddings === "configured" ? "bg-[#10b981]" : "bg-[#f59e0b]")} />
                <span className="text-[#a6b8ce] truncate">BGE-M3</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", health?.subsystems?.llm === "configured" ? "bg-[#10b981]" : "bg-[#f59e0b]")} />
                <span className="text-[#a6b8ce] truncate">OpenRouter LLM</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Upload ──────────────────────────────────────────────────── */}
      <Card className="mt-6 p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <UploadCloud className="size-4.5 text-brass-600" />
          <h2 className="font-display text-lg font-semibold">Upload legal document (PDF)</h2>
        </div>
        <p className="mt-1 text-[12px] text-ink-500">
          Federal Negarit Gazette bilingual PDFs are fully supported — Amharic and English versions of the same
          article are chunked separately but stay linked. Only text-layer PDFs are indexed; scanned files are
          flagged as OCR-required instead of being silently mis-indexed. Max 25MB, SHA-256 duplicates are rejected.
        </p>
        <form ref={formRef} onSubmit={onUpload} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Title *" name="title" placeholder="Ethiopian Startup Proclamation" span={2} />
          <Field label="Amharic title" name="titleAm" placeholder="የስታርታፕ አዋጅ" amharic />
          <Field label="Proclamation №" name="proclamationNumber" placeholder="1396/2025" mono />
          <SelectField label="Document type" name="documentType" options={DOC_TYPES} defaultValue="proclamation" icon={FileText} />
          <SelectField label="Category" name="category" options={CATEGORIES} defaultValue="startup" icon={Layers} />
          <SelectField
            label="Jurisdiction"
            name="jurisdiction"
            options={JURISDICTIONS}
            defaultValue="federal"
            icon={Landmark}
            labels={{ federal: "Federal Negarit Gazette" }}
          />
          <SelectField
            label="Legal status"
            name="status"
            options={STATUSES}
            defaultValue="IN_FORCE"
            icon={ShieldCheck}
            labels={{
              IN_FORCE: "In Force",
              AMENDED: "Amended",
              REPEALED: "Repealed",
              SUPERSEDED: "Superseded",
              HISTORICAL: "Historical",
              UNKNOWN: "Unknown",
            }}
          />
          <SelectField
            label="Language"
            name="language"
            options={["bilingual", "am", "en"]}
            defaultValue="bilingual"
            icon={Globe}
            labels={{ bilingual: "Bilingual (Am + En)", am: "አማርኛ", en: "English" }}
          />
          <Field label="Publication date" name="publicationDate" placeholder="2025-07-17" mono />
          <Field label="Effective date" name="effectiveDate" placeholder="2025-07-17" mono />
          <Field label="Gazette name" name="gazetteName" placeholder="Federal Negarit Gazette" />
          <Field label="Gazette №" name="gazetteNumber" placeholder="Year 31 No. 60" />
          <Field label="Source (authority) *" name="source" placeholder="Federal Negarit Gazette" span={2} />
          <Field label="Source URL" name="sourceUrl" placeholder="https://…" mono />
          <SelectField
            label="Source type"
            name="sourceType"
            options={["PRIMARY", "SECONDARY"]}
            defaultValue="PRIMARY"
            icon={Scale}
            labels={{ PRIMARY: "Primary Source", SECONDARY: "Secondary Source" }}
          />
          <Field label="Amends (reference)" name="amends" placeholder="Proclamation № amended by this law" />
          <Field label="Repeals (reference)" name="repeals" placeholder="Proclamation № repealed by this law" />
          <Field label="Notes" name="notes" placeholder="Internal notes" span={2} />
          <div className="flex flex-col justify-end">
            <input ref={fileRef} name="file" type="file" accept="application/pdf,.pdf" required className="block w-full text-[12px] file:mr-3 file:rounded-lg file:border-0 file:bg-ink-900 file:px-3 file:py-2 file:text-[12px] file:font-semibold file:text-paper-50" />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={uploading} className="w-full">
              {uploading ? <Spinner /> : <FileUp className="size-4" />}
              {uploading ? "Uploading…" : "Upload & ingest"}
            </Button>
          </div>
        </form>
        {uploadMsg && (
          <div className={cn("mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px]", uploadMsg.ok ? "border-jade-600/30 bg-jade-100 text-jade-600" : "border-clay-600/30 bg-clay-100 text-clay-600")}>
            {uploadMsg.ok ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
            {uploadMsg.text}
          </div>
        )}
      </Card>

      {/* ── Documents table ─────────────────────────────────────────── */}
      <div className="mt-8 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Indexed documents ({docs.length})</h2>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void refresh()}
            placeholder="Search title / №…"
            className="w-full rounded-lg border border-ink-200 bg-paper-50 py-1.5 pl-8 pr-3 text-[12.5px] outline-none focus:border-brass-500"
          />
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border hairline bg-white/70">
        {docs.length === 0 && (
          <div className="p-10 text-center text-[13px] text-ink-400">
            No documents indexed yet. Upload the Ethiopian Startup Proclamation (№ 1396/2025) Federal Negarit
            Gazette PDF above to run the first end-to-end ingestion test.
          </div>
        )}
        {docs.map((doc) => {
          const job = doc.latestJob ?? null;
          const isOpen = expanded === doc.id;
          return (
            <div key={doc.id} className="border-b hairline last:border-0">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition hover:bg-brass-100/30">
                <button onClick={() => void openDetail(doc)} className="text-ink-400 hover:text-ink-800">
                  {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-ink-900">
                    {doc.title}
                    {doc.titleAm && <span className="ethiopic ml-2 font-normal text-ink-500">{doc.titleAm}</span>}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-ink-500">
                    {doc.proclamationNumber && <span className="num font-semibold text-brass-600">№ {doc.proclamationNumber}</span>}
                    <span className="capitalize">{doc.documentType}</span>
                    <span>·</span>
                    <span className="capitalize">{doc.category.replace(/_/g, " ")}</span>
                    <span>·</span>
                    <span className="capitalize">{doc.jurisdiction}</span>
                    {doc.publicationDate && <><span>·</span><span className="num">{doc.publicationDate}</span></>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <LangBadge language={doc.language} />
                  <StatusChip status={doc.status} />
                  <span className="num rounded bg-ink-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-600">
                    {doc.chunkCount ?? 0} chunks
                  </span>
                  {job && (
                    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold", JOB_STYLES[job.status] ?? JOB_STYLES.QUEUED)}>
                      {job.status === "PROCESSING" && <Loader2 className="size-3 animate-spin" />}
                      {job.status === "COMPLETED" && <CheckCircle2 className="size-3" />}
                      {job.status === "FAILED" && <AlertTriangle className="size-3" />}
                      {job.status}{job.status === "PROCESSING" && ` ${job.progress}%`}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <MiniAction label="Ingest" onClick={() => void runJob(doc.id, "ingest")} busy={busyId === doc.id + "ingest"} />
                  <MiniAction label="Re-index" onClick={() => void runJob(doc.id, "reindex")} busy={busyId === doc.id + "reindex"} />
                  <MiniAction label="Chunks" onClick={() => void openChunks(doc)} />
                  <button
                    onClick={() => void removeDoc(doc)}
                    className="rounded-md p-1.5 text-clay-600 transition hover:bg-clay-100"
                    aria-label="Delete document"
                  >
                    {busyId === doc.id + "delete" ? <Spinner /> : <Trash2 className="size-3.5" />}
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="border-t hairline bg-paper-50/70 px-6 py-4">
                  {!detail && <div className="shimmer h-24 rounded-lg" />}
                  {detail && (
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div>
                        <p className="label-caps mb-2">Metadata</p>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
                          <MetaRow k="SHA-256" v={detail.sha256.slice(0, 16) + "…"} mono />
                          <MetaRow k="File" v={detail.filename ?? "—"} />
                          <MetaRow k="Pages" v={String(detail.pageCount ?? "—")} mono />
                          <MetaRow k="Extraction" v={detail.extractionMethod ?? "—"} mono />
                          <MetaRow k="Source type" v={detail.sourceType} />
                          <MetaRow k="Amends" v={detail.amends ?? "—"} />
                          <MetaRow k="Repeals" v={detail.repeals ?? "—"} />
                          <MetaRow k="Notes" v={detail.notes ?? "—"} />
                        </dl>
                        {(detail.relationships?.length ?? 0) > 0 && (
                          <>
                            <p className="label-caps mt-3 mb-1.5">Legal relationships</p>
                            {detail.relationships!.map((r) => (
                              <p key={r.id} className="text-[12px] text-ink-600">
                                {r.direction === "outgoing" ? "This document" : r.other?.title} <span className="mx-1 rounded bg-ink-900 px-1.5 py-0.5 text-[10px] font-bold text-brass-300">{r.relationType}</span> {r.direction === "outgoing" ? r.other?.title : "this document"}
                              </p>
                            ))}
                          </>
                        )}
                        <a href={`/api/documents/${detail.id}/pdf`} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-brass-600 hover:underline">
                          <FileText className="size-3.5" /> View original PDF
                        </a>
                      </div>
                      <div>
                        <p className="label-caps mb-2">Ingestion jobs</p>
                        <div className="space-y-2">
                          {(detail.jobs ?? []).map((j) => (
                            <JobView key={j.id} job={j} />
                          ))}
                          {(detail.jobs ?? []).length === 0 && <p className="text-[12px] text-ink-400">No jobs yet.</p>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  </main>

  {/* ── Chunk explorer drawer ───────────────────────────────────── */}
  {chunksDoc && (
        <div className="fixed inset-0 z-40 flex justify-end bg-ink-950/40 backdrop-blur-[2px]" onClick={() => setChunksDoc(null)}>
          <aside className="flex h-full w-full max-w-2xl flex-col bg-paper-50 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b hairline bg-ink-900 px-5 py-4 text-paper-50">
              <div className="min-w-0">
                <p className="label-caps !text-brass-300">Chunk explorer</p>
                <h3 className="font-display truncate text-[15px] font-semibold">{chunksDoc.doc.title}</h3>
              </div>
              <div className="flex items-center gap-2">
                {["any", "am", "en"].map((l) => (
                  <button
                    key={l}
                    onClick={() => void openChunks(chunksDoc.doc, l)}
                    className={cn("rounded-md px-2 py-1 text-[11px] font-semibold", chunksDoc.lang === l ? "bg-brass-500 text-white" : "bg-ink-700 text-paper-200")}
                  >
                    {l === "any" ? "All" : l === "am" ? "አማርኛ" : "EN"}
                  </button>
                ))}
                <button onClick={() => setChunksDoc(null)} className="rounded-md p-1.5 hover:bg-ink-700" aria-label="Close">
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <div className="scroll-thin flex-1 space-y-2 overflow-y-auto p-4">
              {chunksDoc.chunks.length === 0 && <p className="p-6 text-center text-[12.5px] text-ink-400">No chunks for this language — the document may not have been ingested yet.</p>}
              {chunksDoc.chunks.map((c) => (
                <div key={c.id} className="rounded-lg border hairline bg-white/80 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-500">
                    {c.articleNumber ? (
                      <span className="rounded bg-brass-100 px-1.5 py-0.5 font-semibold text-brass-700">Article {c.articleNumber}{c.subArticle ? `(${c.subArticle})` : ""}</span>
                    ) : (
                      <span className="rounded bg-ink-100 px-1.5 py-0.5">preamble / unnumbered</span>
                    )}
                    {c.part && <span>{c.part}</span>}
                    {c.chapter && <span>{c.chapter}</span>}
                    <LangBadge language={c.language} />
                    {c.page != null && <span className="num">p. {c.page}</span>}
                    <span className="num">{c.charCount} chars</span>
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", c.hasEmbedding ? "bg-jade-100 text-jade-600" : "bg-gold-100 text-gold-600")}>
                      {c.hasEmbedding ? "embedded" : "no vector"}
                    </span>
                  </div>
                  <p className={cn("mt-1.5 whitespace-pre-wrap text-[12px] leading-relaxed text-ink-700", c.language === "am" && "ethiopic")}>
                    {c.text}{c.charCount > 420 && "…"}
                  </p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function MetaRow({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-ink-400">{k}</dt>
      <dd className={cn("truncate text-ink-800", mono && "num font-mono text-[11.5px]")}>{v}</dd>
    </>
  );
}

function MiniAction({ label, onClick, busy }: { label: string; onClick: () => void; busy?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-1 rounded-md border border-ink-200 px-2 py-1 text-[11px] font-semibold text-ink-600 transition hover:border-brass-500/60 hover:text-ink-900 disabled:opacity-50"
    >
      {busy && <Loader2 className="size-3 animate-spin" />}
      {label}
    </button>
  );
}

function JobView({ job }: { job: JobRow }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border hairline bg-white/80 p-2.5">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-left">
        <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-bold", JOB_STYLES[job.status] ?? JOB_STYLES.QUEUED)}>
          {job.status}
        </span>
        <span className="text-[11.5px] font-medium text-ink-600">{job.stage}</span>
        <span className="num ml-auto text-[10.5px] text-ink-400">{new Date(job.createdAt).toLocaleString()}</span>
      </button>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
        <div className={cn("h-full rounded-full transition-all", job.status === "FAILED" ? "bg-clay-600" : "bg-brass-500")} style={{ width: `${job.progress}%` }} />
      </div>
      {job.error && <p className="mt-1.5 rounded bg-clay-100 px-2 py-1 text-[11px] text-clay-600">{job.error}</p>}
      {open && (
        <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded bg-ink-950 p-2.5 font-mono text-[10px] leading-relaxed text-paper-200">
          {(job.log ?? []).map((entry, i) => (
            <p key={i} className={cn(entry.level === "error" && "text-clay-600", entry.level === "warn" && "text-gold-600")}>
              [{entry.stage}] {entry.message}
            </p>
          ))}
          {job.stats && <p className="pt-1 text-brass-300">stats: {JSON.stringify(job.stats)}</p>}
          {(job.log ?? []).length === 0 && <p>No log entries.</p>}
        </div>
      )}
      <button onClick={() => setOpen((v) => !v)} className="mt-1.5 text-[10.5px] font-semibold text-brass-600 hover:underline">
        {open ? "Hide log" : "Show log / stats"}
      </button>
    </div>
  );
}

function Field({
  label, name, placeholder, span, mono, amharic,
}: {
  label: string; name: string; placeholder?: string; span?: number; mono?: boolean; amharic?: boolean;
}) {
  return (
    <label className={cn("block", span === 2 && "sm:col-span-2")}>
      <span className="label-caps mb-1 block text-ink-600 font-semibold">{label}</span>
      <input
        name={name}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-xl border border-[#ded5c2] bg-white px-3 py-2 text-xs outline-none transition-all shadow-2xs focus:border-[#deb152] focus:bg-[#fdfaf3] text-ink-900 placeholder:text-ink-400",
          mono && "num font-mono",
          amharic && "ethiopic",
        )}
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  options,
  defaultValue,
  labels,
  icon: Icon,
}: {
  label: string;
  name: string;
  options: string[];
  defaultValue?: string;
  labels?: Record<string, string>;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const [value, setValue] = useState(defaultValue ?? options[0]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const displayLabel = labels?.[value] ?? value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="relative block" ref={containerRef}>
      <input type="hidden" name={name} value={value} />
      <span className="label-caps mb-1 block text-ink-600 font-semibold">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-all shadow-2xs cursor-pointer text-left",
          open
            ? "border-[#deb152] bg-[#fdfaf3] text-ink-950 font-semibold ring-2 ring-[#deb152]/20"
            : "border-[#ded5c2] bg-white text-ink-800 hover:border-[#deb152] hover:bg-[#fdfaf3]",
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          {Icon && <Icon className="size-3.5 shrink-0 text-[#b88c32]" />}
          <span className="truncate">{displayLabel}</span>
        </div>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-ink-400 transition-transform duration-200",
            open && "rotate-180 text-ink-800",
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-1.5 w-full min-w-[200px] rounded-2xl border border-[#ded5c2] bg-white p-1.5 shadow-xl animate-fade-in">
          <div className="px-2.5 py-1.5 border-b border-[#f0e9dc] mb-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#8a7550]">{label}</p>
            <p className="text-[10.5px] text-ink-400">Select option</p>
          </div>
          <div className="max-h-56 overflow-y-auto scroll-thin space-y-0.5">
            {options.map((o) => {
              const isSelected = value === o;
              const text = labels?.[o] ?? o.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => {
                    setValue(o);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer",
                    isSelected
                      ? "bg-[#fbf5e7] font-bold text-[#8a6527]"
                      : "text-ink-700 hover:bg-[#f4eee2] hover:text-ink-950",
                  )}
                >
                  <span className="truncate">{text}</span>
                  {isSelected && <Check className="size-3.5 text-[#deb152] shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
