"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Database,
  FileText,
  FileUp,
  KeyRound,
  Layers,
  Loader2,
  RefreshCw,
  Scale,
  Search,
  Server,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
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

function Stat({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Database }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className="flex size-10 items-center justify-center rounded-lg bg-ink-900 text-brass-300">
        <Icon className="size-5" />
      </div>
      <div>
        <p className="num text-xl font-bold leading-none">{value}</p>
        <p className="mt-1 text-[11px] font-medium text-ink-500">{label}</p>
      </div>
    </Card>
  );
}

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
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

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

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 pb-16 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b hairline py-4">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-500 hover:text-ink-800">
            <ArrowLeft className="size-3.5" /> Research console
          </Link>
          <span className="text-ink-200">|</span>
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-ink-900 text-brass-300">
              <Scale className="size-4.5" />
            </div>
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

      {/* ── System + analytics ──────────────────────────────────────── */}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Documents" value={analytics?.totals.documents ?? health?.stats.documents ?? 0} icon={FileText} />
        <Stat label="Chunks" value={analytics?.totals.chunks ?? 0} icon={Layers} />
        <Stat label="Embedded chunks" value={analytics?.totals.embeddedChunks ?? 0} icon={Sparkles} />
        <Stat label="Articles" value={analytics?.totals.articles ?? 0} icon={Database} />
        <Stat label="Avg retrieval ms" value={analytics?.totals.avgRetrievalMs ?? 0} icon={Clock3} />
        <Stat label="Avg LLM ms" value={analytics?.totals.avgLlmMs ?? 0} icon={Server} />
      </section>

      <Card className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 p-3.5 text-[12px]">
        <span className="label-caps">Subsystems</span>
        <Subsys ok={health?.subsystems.database === true} label="PostgreSQL" />
        <Subsys ok={health?.subsystems.qdrant === "up"} warn={health?.subsystems.qdrant === "not_configured"} label={`Qdrant (${health?.subsystems.qdrant ?? "…"})`} />
        <Subsys ok={health?.subsystems.embeddings === "configured"} warn label="BGE-M3 / HF" />
        <Subsys ok={health?.subsystems.llm === "configured"} warn label="OpenRouter LLM" />
        <button onClick={() => void runEmbedTest()} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-brass-500/40 bg-brass-100/50 px-2.5 py-1 font-semibold text-brass-700 transition hover:bg-brass-100">
          <Sparkles className="size-3.5" /> Test BGE-M3 bilingual embedding
        </button>
        {embedTest && <span className="w-full text-[11.5px] text-ink-500">{embedTest}</span>}
      </Card>

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
          <SelectField label="Document type" name="documentType" options={DOC_TYPES} defaultValue="proclamation" />
          <SelectField label="Category" name="category" options={CATEGORIES} defaultValue="startup" />
          <SelectField label="Jurisdiction" name="jurisdiction" options={JURISDICTIONS} />
          <SelectField label="Legal status" name="status" options={STATUSES} />
          <SelectField
            label="Language"
            name="language"
            options={["bilingual", "am", "en"]}
            defaultValue="bilingual"
            labels={{ bilingual: "Bilingual (Am + En)", am: "አማርኛ", en: "English" }}
          />
          <Field label="Publication date" name="publicationDate" placeholder="2025-07-17" mono />
          <Field label="Effective date" name="effectiveDate" placeholder="2025-07-17" mono />
          <Field label="Gazette name" name="gazetteName" placeholder="Federal Negarit Gazette" />
          <Field label="Gazette №" name="gazetteNumber" placeholder="Year 31 No. 60" />
          <Field label="Source (authority) *" name="source" placeholder="Federal Negarit Gazette" span={2} />
          <Field label="Source URL" name="sourceUrl" placeholder="https://…" mono />
          <SelectField label="Source type" name="sourceType" options={["PRIMARY", "SECONDARY"]} />
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

function Subsys({ ok, warn, label }: { ok: boolean; warn?: boolean; label: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold",
      ok ? "border-jade-600/30 bg-jade-100 text-jade-600" : warn ? "border-gold-600/30 bg-gold-100 text-gold-600" : "border-clay-600/30 bg-clay-100 text-clay-600",
    )}>
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
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
      <span className="label-caps mb-1 block">{label}</span>
      <input
        name={name}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-lg border border-ink-200 bg-paper-50 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-brass-500",
          mono && "num font-mono",
          amharic && "ethiopic",
        )}
      />
    </label>
  );
}

function SelectField({
  label, name, options, defaultValue, labels,
}: {
  label: string; name: string; options: string[]; defaultValue?: string; labels?: Record<string, string>;
}) {
  return (
    <label className="block">
      <span className="label-caps mb-1 block">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue ?? options[0]}
        className="w-full appearance-none rounded-lg border border-ink-200 bg-paper-50 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-brass-500"
      >
        {options.map((o) => (
          <option key={o} value={o}>{labels?.[o] ?? o.replace(/_/g, " ")}</option>
        ))}
      </select>
    </label>
  );
}
