"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Database, Package, RefreshCw, Save, Shield, Trash2, Undo2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import type { DictKey } from "@/lib/i18n/dict";
import type { AppStatus } from "@/lib/db/schema";
import { STATUS_CLS } from "@/lib/p6/app-templates";
import { deleteApp, saveApp, submitApp, vibeAppAction, withdrawApp, type AppFields } from "../../actions";
import { VibeBar, type VibeResult } from "@/components/p7/VibeBar";
import { WebPreview, type WebRun } from "@/components/p8/WebPreview";
import { errorText, ExportButtons, FileEditor, FlowSteps, type FileTab } from "@/components/p8/ProjectParts";
import { stitch, type ProjectFiles } from "@/lib/p8/files";

type Meta = Omit<AppFields, "html" | "files">;

export function AppBuilder(p: { id: string; subjects: string[]; initial: Meta; files: ProjectFiles; status: AppStatus; version: number; reviewNote: string }) {
  const { t } = useT();
  const [f, setF] = useState<Meta>(p.initial);
  const [files, setFilesRaw] = useState(p.files);
  const [tab, setTab] = useState<FileTab>("html");
  const [status, setStatus] = useState(p.status);
  const [preview, setPreview] = useState(() => stitch(p.files));
  const [runId, setRunId] = useState(0);
  const [run, setRun] = useState<WebRun | null>(null);
  const [stage, setStage] = useState(p.status === "pending" ? 4 : 0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const html = useMemo(() => stitch(files), [files]);
  const set = (patch: Partial<Meta>) => { setF((x) => ({ ...x, ...patch })); setDirty(true); };
  const setFiles = (next: ProjectFiles) => { setFilesRaw(next); setDirty(true); setStage(1); };
  const fields = (): AppFields => ({ ...f, html, files });

  // Live preview, debounced.
  useEffect(() => {
    const h = setTimeout(() => setPreview(html), 600);
    return () => clearTimeout(h);
  }, [html]);

  function onRun(r: WebRun) {
    setRun(r);
    if (r.status === "error" || r.status === "timeout") setStage(3);
    else if (r.status === "ok") setStage((s) => (s === 1 || s === 3 ? 2 : s));
  }

  function applyVibe(r: VibeResult) {
    if (!r.files) return;
    setFilesRaw(r.files);
    setPreview(stitch(r.files));
    setRunId((n) => n + 1);
    setStatus("draft");
    setStage(2);
  }

  const err = (e: string) => setMsg({ ok: false, text: t(e === "too_big" ? "p6.ap.tooBig" : e === "empty" ? "p6.ap.emptyErr" : "p6.err.generic") });
  const failed = run && (run.status === "error" || run.status === "timeout");
  const color = { log: "text-slate-100", info: "text-slate-100", warn: "text-amber-300", error: "text-rose-300" } as const;

  return (
    <div className="mt-2 space-y-3" data-testid="app-builder">
      <div className="flex flex-wrap items-center gap-2">
        <input className="input w-14 text-center text-xl" value={f.emoji} onChange={(e) => set({ emoji: e.target.value })} aria-label="emoji" />
        <input className="input max-w-sm flex-1 text-lg font-semibold" value={f.title} onChange={(e) => set({ title: e.target.value })} aria-label={t("p6.ap.name")} data-testid="app-title" />
        <span className={`badge ${STATUS_CLS[status]}`} data-testid="app-status">{t(`p6.ap.st.${status}` as DictKey)}</span>
        {p.version > 0 && <span className="text-xs text-slate-500">v{p.version} {t("p6.ap.live")}</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          <ExportButtons files={files} title={f.title} testPrefix="app" onExport={() => setStage(4)} />
          <button className="btn btn-sm" disabled={pending || !dirty} onClick={() => start(async () => { const r = await saveApp(p.id, fields()); if (r.error) return err(r.error); setDirty(false); setStatus("draft"); setMsg({ ok: true, text: t("common.saved") }); })} data-testid="app-save"><Save className="h-4 w-4" /> {t("common.save")}</button>
          {status === "pending" ? (
            <button className="btn btn-sm" disabled={pending} onClick={() => start(async () => { const r = await withdrawApp(p.id); if (r.status) setStatus("draft"); })}><Undo2 className="h-4 w-4" /> {t("p6.ap.withdraw")}</button>
          ) : (
            <button className="btn btn-sm btn-primary" disabled={pending} title={t("p8.publish.note")} onClick={() => start(async () => { const r = await submitApp(p.id, fields()); if (r.error) return err(r.error); setStatus("pending"); setDirty(false); setStage(4); setMsg({ ok: true, text: t("p6.ap.submitted") }); })} data-testid="app-submit"><Package className="h-4 w-4" /> {t("p6.ap.submit")}</button>
          )}
          <button className="btn btn-sm btn-ghost text-rose-700" onClick={() => window.confirm(t("p2.confirmDelete", { title: f.title })) && start(() => deleteApp(p.id))} aria-label={t("common.delete")}><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
      {p.reviewNote && status === "rejected" && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{t("p6.ap.reviewNote")}：{p.reviewNote}</p>}
      {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`} role="status">{msg.text}</p>}
      <div className="grid gap-2 sm:grid-cols-[1fr_10rem_10rem]">
        <input className="input" value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder={t("p6.ap.descPh")} />
        <select className="input" value={f.subject} onChange={(e) => set({ subject: e.target.value })} aria-label={t("bk.subject")}>{p.subjects.map((s) => <option key={s}>{s}</option>)}</select>
        <select className="input" value={f.audience} onChange={(e) => set({ audience: e.target.value as AppFields["audience"] })} aria-label={t("p6.ap.audience")}>
          <option value="all">{t("p6.ap.aud.all")}</option>
          <option value="teacher">{t("p6.ap.aud.teacher")}</option>
        </select>
      </div>
      <div className="card space-y-1.5 p-2">
        <FlowSteps stage={stage} />
        <VibeBar
          run={(ins) => vibeAppAction(p.id, ins, files)}
          fix={failed ? () => vibeAppAction(p.id, t("p8.fix.ask"), files, errorText(run.status, run.lines)) : null}
          onResult={applyVibe}
          placeholder={`${t("p7.vibe.appPh")}／${t("p8.edit.ph")}`}
        />
      </div>
      <div className="grid h-[calc(100vh-17rem)] min-h-[30rem] gap-3 lg:grid-cols-2">
        <section className="card flex min-h-0 flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-200 p-2 text-xs text-slate-500">HTML / CSS / JavaScript <span className="ml-auto">{(new Blob([html]).size / 1024).toFixed(1)} KB / 200 KB</span></div>
          <FileEditor files={files} onChange={setFiles} tab={tab} onTab={setTab} editorTestId="app-js" small />
        </section>
        <section className="card flex min-h-0 flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-200 p-2 text-xs text-slate-500">
            <Shield className="h-3.5 w-3.5 text-emerald-600" /> {t("p6.ap.previewSandbox")}
            {/campus\.mock/.test(html) || files.data.trim() ? <span className="badge bg-amber-50 text-amber-800" title={t("p8.mock.tip")}><Database className="h-3 w-3" /> {t("p8.mock.badge")}</span> : null}
            <button className="btn btn-sm btn-ghost ml-auto" onClick={() => { setPreview(html); setRunId((n) => n + 1); }} aria-label={t("p6.ap.reload")} data-testid="app-reload"><RefreshCw className="h-3.5 w-3.5" /></button>
          </div>
          <WebPreview html={preview} runId={runId} onRun={onRun} title={t("p6.ap.preview")} testId="app-preview" className="flex-1" />
          <div className="border-t border-slate-200">
            <div className="flex items-center gap-2 px-2 py-1 text-xs">
              <span className="font-medium text-slate-500">{t("p8.console")}</span>
              {run && run.status !== "running" && <span className={`badge ml-auto ${run.status === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`} data-testid="app-run-status">{t(`p6.cr.st.${run.status}`)}</span>}
            </div>
            <pre className="h-24 overflow-auto bg-slate-900 p-2 font-mono text-xs whitespace-pre-wrap" data-testid="app-console">
              {(run?.lines ?? []).map((l, i) => <div key={i} className={color[l.kind] ?? "text-slate-100"}>{l.text}</div>)}
            </pre>
          </div>
        </section>
      </div>
      <p className="text-xs text-slate-500">{t("p6.ap.flowNote")} {t("p8.publish.note")}</p>
      <p className="text-xs text-slate-500">{t("p8.mock.tip")}</p>
    </div>
  );
}
