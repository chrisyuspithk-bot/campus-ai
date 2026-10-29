"use client";
import { useEffect, useState, useTransition } from "react";
import { Database, Globe, Play, Save, Share2, Shield, Square, Terminal, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { runSandboxed, RUN_TIMEOUT_MS, type RunLine, type RunResult } from "@/lib/p6/sandbox";
import { deleteProject, saveCode, shareProject, vibeCodeAction } from "../actions";
import { VibeBar, type VibeResult } from "@/components/p7/VibeBar";
import { WebPreview, type WebRun } from "@/components/p8/WebPreview";
import { errorText, ExportButtons, FileEditor, FlowSteps, type FileTab } from "@/components/p8/ProjectParts";
import { isWeb, stitch, type ProjectFiles } from "@/lib/p8/files";

const SAMPLES: Record<string, string> = {
  hello: 'console.log("你好，Campus AI！");\nfor (let i = 1; i <= 5; i++) console.log(i, "² =", i * i);',
  stats: "const marks = [56, 72, 88, 64, 91, 77];\nconst mean = marks.reduce((a, b) => a + b, 0) / marks.length;\nconst sorted = [...marks].sort((a, b) => a - b);\nconst mid = sorted.length / 2;\nconst median = sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;\nconsole.log({ mean: mean.toFixed(1), median, range: sorted.at(-1) - sorted[0] });",
  quadratic: "function solve(a, b, c) {\n  const d = b * b - 4 * a * c;\n  if (d < 0) return \"冇實根\";\n  return [(-b + Math.sqrt(d)) / (2 * a), (-b - Math.sqrt(d)) / (2 * a)];\n}\nconsole.log(\"x² − 5x + 6 = 0 →\", solve(1, -5, 6));\nconsole.log(\"x² + 1 = 0 →\", solve(1, 0, 1));",
  loop: "// 試吓：無限迴圈會喺 3 秒後被沙盒停止\nlet n = 0;\nwhile (true) n++;",
  network: "// 沙盒冇網絡：以下會失敗\nawait fetch(\"https://example.com\");",
};

const WEB_STARTER: Pick<ProjectFiles, "html" | "css"> = {
  html: '<main class="card">\n  <h2>我嘅網頁</h2>\n  <p id="out">撳掣試吓</p>\n  <button id="go">撳我</button>\n</main>',
  css: "body { font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; background: #f1f5f9; }\n.card { background: #fff; padding: 24px; border-radius: 16px; text-align: center; }\nbutton { font: inherit; padding: 8px 18px; border-radius: 999px; border: 0; background: #4f46e5; color: #fff; }",
};

/** Stage on the flow line: 0 描述 · 1 編輯／積木 · 2 預覽 · 3 修錯 · 4 導出／分享 */
type Stage = 0 | 1 | 2 | 3 | 4;

export function CodeLab(props: { id: string; title: string; files: ProjectFiles; shared: boolean }) {
  const { t } = useT();
  const [files, setFilesRaw] = useState(props.files);
  const [tab, setTab] = useState<FileTab>("js");
  const [title, setTitle] = useState(props.title);
  const [lines, setLines] = useState<RunLine[]>([]);
  const [result, setResult] = useState<Pick<RunResult, "status" | "ms"> | null>(null);
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState(0);
  const [webHtml, setWebHtml] = useState(() => stitch(props.files));
  const [saved, setSaved] = useState(true);
  const [shared, setShared] = useState(props.shared);
  const [stage, setStage] = useState<Stage>(0);
  const [pending, start] = useTransition();
  const web = isWeb(files);
  const code = files.js;

  // Live preview in web mode (debounced); Run / AI results reload it immediately.
  useEffect(() => {
    if (!isWeb(files)) return;
    const h = setTimeout(() => setWebHtml(stitch(files)), 800);
    return () => clearTimeout(h);
  }, [files]);

  const setFiles = (f: ProjectFiles) => { setFilesRaw(f); setSaved(false); setStage(1); };
  const setCode = (js: string) => setFiles({ ...files, js });

  async function run(src = files) {
    if (running) return;
    setStage(2);
    setResult(null);
    setLines([]);
    if (isWeb(src)) {
      setRunning(true);
      setWebHtml(stitch(src));
      setRunId((n) => n + 1);
      return;
    }
    setRunning(true);
    const r = await runSandboxed(src.js, (l) => setLines((x) => [...x, l]), RUN_TIMEOUT_MS, src.data);
    setResult(r);
    if (r.status !== "ok") setStage(3);
    setRunning(false);
  }

  function onWebRun(r: WebRun) {
    setLines(r.lines);
    if (r.status === "running") return;
    setRunning(false);
    setResult({ status: r.status, ms: r.ms });
    if (r.status !== "ok") setStage(3);
  }

  const save = () => start(async () => { await saveCode(props.id, files, title); setSaved(true); });

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      run();
    } else if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      save();
    } else if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.currentTarget;
      const { selectionStart: a, selectionEnd: b } = ta;
      const key = tab === "blocks" ? "js" : tab;
      const next = files[key].slice(0, a) + "  " + files[key].slice(b);
      setFiles({ ...files, [key]: next });
      requestAnimationFrame(() => ta.setSelectionRange(a + 2, a + 2));
    }
  }

  // Generated code is only ever run by the button / here via runSandboxed or the sandboxed preview.
  function applyVibe(r: VibeResult) {
    if (!r.files) return;
    setFilesRaw(r.files);
    setSaved(true);
    if (isWeb(r.files) && !isWeb(files)) setTab("html");
    run(r.files);
  }

  const failed = result && result.status !== "ok";
  const color = { log: "text-slate-100", info: "text-slate-100", warn: "text-amber-300", error: "text-rose-300" } as const;
  const output = (
    <pre className="min-h-0 flex-1 overflow-auto bg-slate-900 p-3 font-mono text-xs whitespace-pre-wrap" data-testid="code-output">
      {lines.length === 0 && !running && <span className="text-slate-500">{t("p6.cr.hint")}</span>}
      {lines.map((l, i) => <div key={i} className={color[l.kind] ?? "text-slate-100"}>{l.text}</div>)}
      {running && <span className="animate-pulse text-slate-400">▍</span>}
    </pre>
  );
  const statusBadge = result && (
    <span className={`badge ml-auto ${result.status === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`} data-testid="code-status">
      {t(`p6.cr.st.${result.status}`)} · {result.ms} ms
    </span>
  );

  return (
    <div className="flex h-[calc(100vh-11rem)] min-h-[36rem] flex-col gap-3" data-testid="code-lab">
      <div className="flex flex-wrap items-center gap-2">
        <input className="input mr-auto max-w-md text-lg font-semibold" value={title} onChange={(e) => { setTitle(e.target.value); setSaved(false); }} aria-label={t("p6.cr.title")} />
        <span className="badge bg-emerald-50 text-emerald-700" title={t("p6.cr.sandboxTip")}><Shield className="h-3.5 w-3.5" /> {t("p6.cr.sandbox", { s: RUN_TIMEOUT_MS / 1000 })}</span>
        <ExportButtons files={files} title={title} js testPrefix="code" onExport={() => setStage(4)} />
        <button className="btn btn-sm" onClick={save} disabled={pending || saved} data-testid="code-save"><Save className="h-4 w-4" /> {saved ? t("common.saved") : t("common.save")}</button>
        <button className="btn btn-sm" onClick={() => start(async () => { await saveCode(props.id, files, title); await shareProject(props.id); setSaved(true); setShared(true); setStage(4); })} disabled={pending}><Share2 className="h-4 w-4" /> {shared ? t("cr.shared") : t("cr.share")}</button>
        <button className="btn btn-sm btn-ghost text-rose-700" onClick={() => window.confirm(t("p2.confirmDelete", { title })) && start(() => deleteProject(props.id))} aria-label={t("common.delete")}><Trash2 className="h-4 w-4" /></button>
      </div>
      <div className="card space-y-1.5 p-2">
        <FlowSteps stage={stage} student />
        <VibeBar
          run={(ins) => vibeCodeAction(props.id, ins, files)}
          fix={failed ? () => vibeCodeAction(props.id, t("p8.fix.ask"), files, errorText(result.status, lines)) : null}
          onResult={applyVibe}
          placeholder={web ? t("p8.edit.ph") : t("p7.vibe.codePh")}
        />
      </div>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
        <section className="card flex min-h-0 flex-col overflow-hidden">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 p-2">
            <span className="flex items-center gap-1 text-xs font-medium text-slate-500" data-testid="code-mode">
              {web ? <Globe className="h-3.5 w-3.5" /> : <Terminal className="h-3.5 w-3.5" />} {web ? t("p8.mode.web") : t("p8.mode.console")}
            </span>
            <select className="input ml-auto w-auto py-1 text-xs" value="" onChange={(e) => { if (e.target.value) { setCode(SAMPLES[e.target.value]); setTab("js"); } }} aria-label={t("p6.cr.samples")} data-testid="code-sample">
              <option value="">{t("p6.cr.samples")}</option>
              {Object.keys(SAMPLES).map((k) => <option key={k} value={k}>{t(`p6.cr.sample.${k}` as "p6.cr.sample.hello")}</option>)}
            </select>
            {web ? (
              <button className="btn btn-sm btn-ghost text-xs" onClick={() => window.confirm(t("p8.mode.toConsoleConfirm")) && (setFiles({ ...files, html: "", css: "", blocks: [] }), setTab("js"))} data-testid="to-console">{t("p8.mode.toConsole")}</button>
            ) : (
              <button className="btn btn-sm text-xs" onClick={() => { setFiles({ ...files, ...WEB_STARTER }); setTab("html"); }} data-testid="to-web">{t("p8.mode.toWeb")}</button>
            )}
            <button className="btn btn-sm btn-primary" onClick={() => run()} disabled={running} data-testid="code-run">
              {running ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />} {running ? t("p6.cr.running") : t("p6.cr.run")}
            </button>
          </div>
          <FileEditor files={files} onChange={setFiles} tab={tab} onTab={setTab} editorTestId="code-editor" onKeyDown={onKey} />
        </section>
        <section className="card flex min-h-0 flex-col overflow-hidden">
          {web ? (
            <>
              <div className="flex items-center gap-2 border-b border-slate-200 p-2 text-xs text-slate-500">
                <Shield className="h-3.5 w-3.5 text-emerald-600" /> {t("p8.preview")} · {t("p6.ap.previewSandbox")}
                {/campus\.mock/.test(files.js) || files.data.trim() ? <span className="badge bg-amber-50 text-amber-800" title={t("p8.mock.tip")}><Database className="h-3 w-3" /> {t("p8.mock.badge")}</span> : null}
              </div>
              <WebPreview html={webHtml} runId={runId} onRun={onWebRun} title={t("p8.preview")} testId="code-preview" className="h-1/2 flex-1 border-b border-slate-200" />
              <div className="flex items-center gap-2 border-b border-slate-200 p-1.5 text-xs">
                <span className="font-medium text-slate-500">{t("p8.console")}</span>
                <span className="text-slate-400">{t("p8.loopGuard")}</span>
                {statusBadge}
              </div>
              <div className="flex h-36 min-h-0 flex-col">{output}</div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-slate-200 p-2 text-xs">
                <span className="font-medium text-slate-500">{t("p6.cr.output")}</span>
                {statusBadge}
              </div>
              {output}
            </>
          )}
        </section>
      </div>
      <p className="text-xs text-slate-500">{t("p8.mock.tip")}</p>
    </div>
  );
}
