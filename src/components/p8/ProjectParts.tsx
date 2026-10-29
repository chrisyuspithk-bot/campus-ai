"use client";
import { Database, FileArchive, FileCode } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import type { DictKey } from "@/lib/i18n/dict";
import { downloadBlob, safeName } from "@/lib/export-client";
import { exportEntries, stitch, type ProjectFiles } from "@/lib/p8/files";
import { exportRuntime } from "@/lib/p8/runtime";
import { makeZip } from "@/lib/p8/zip";
import { BlockEditor } from "./BlockEditor";

export type FileTab = "html" | "css" | "js" | "data" | "blocks";
const TABS: { key: FileTab; label: string }[] = [
  { key: "html", label: "index.html" },
  { key: "css", label: "style.css" },
  { key: "js", label: "script.js" },
  { key: "data", label: "data.json" },
  { key: "blocks", label: "" },
];

/** 描述 → 編輯／積木 → 預覽 → 修錯 → 導出／上架 — the current step is highlighted. */
export function FlowSteps({ stage, student }: { stage: number; student?: boolean }) {
  const { t } = useT();
  const steps: DictKey[] = ["p8.flow.describe", "p8.flow.edit", "p8.flow.preview", "p8.flow.fix", student ? "p8.flow.exportStudent" : "p8.flow.export"];
  return (
    <ol className="flex flex-wrap items-center gap-1 px-1 text-xs" data-testid="p8-flow">
      {steps.map((k, i) => (
        <li key={k} className="flex items-center gap-1">
          {i > 0 && <span className="text-slate-300">→</span>}
          <span className={`rounded-full px-2 py-0.5 ${i === stage ? "bg-violet-600 text-white" : i < stage ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-500"}`} data-active={i === stage || undefined}>
            {i + 1}. {t(k)}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** File tabs + editor (textarea per file, block editor for 積木). */
export function FileEditor({ files, onChange, tab, onTab, editorTestId, onKeyDown, small }: {
  files: ProjectFiles;
  onChange: (f: ProjectFiles) => void;
  tab: FileTab;
  onTab: (t: FileTab) => void;
  editorTestId: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  small?: boolean;
}) {
  const { t } = useT();
  const size = (k: FileTab) => (k === "blocks" ? files.blocks.length : files[k].length);
  return (
    <>
      <div className="flex flex-wrap gap-0.5 border-b border-slate-200 bg-slate-50 px-1 pt-1" role="tablist" data-testid="file-tabs">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`rounded-t-md px-2.5 py-1 font-mono text-xs ${tab === key ? "border border-b-0 border-slate-200 bg-white font-semibold text-slate-900" : "text-slate-500 hover:text-slate-800"}`}
            onClick={() => onTab(key)}
            data-testid={`tab-${key}`}
          >
            {key === "blocks" ? `🧩 ${t("p8.tab.blocks")}` : label}
            {size(key) > 0 && <span className="ml-1 text-[10px] text-violet-500">●</span>}
          </button>
        ))}
      </div>
      {tab === "blocks" ? (
        <BlockEditor blocks={files.blocks} html={files.html} onChange={(blocks) => onChange({ ...files, blocks })} />
      ) : (
        <>
          {tab === "data" && <p className="flex items-start gap-1 bg-amber-50 px-3 py-1.5 text-xs text-amber-900" data-testid="mock-tip"><Database className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t("p8.mock.tip")}</p>}
          <textarea
            key={tab}
            className={`min-h-0 flex-1 resize-none bg-slate-950 p-3 font-mono ${small ? "text-xs" : "text-sm"} leading-relaxed text-slate-100 outline-none`}
            spellCheck={false}
            value={files[tab]}
            onChange={(e) => onChange({ ...files, [tab]: e.target.value })}
            onKeyDown={onKeyDown}
            placeholder={tab === "data" ? '{ "options": ["A", "B"] }' : tab === "html" ? '<main>\n  <button id="go">Go</button>\n  <p id="out"></p>\n</main>' : ""}
            aria-label={`${t("p6.cr.editor")} ${tab}`}
            data-testid={tab === "js" ? editorTestId : `file-${tab}`}
          />
        </>
      )}
    </>
  );
}

/** ZIP of the project (+ optional single-file downloads, kept from P7). */
export function ExportButtons({ files, title, onExport, js, testPrefix }: { files: ProjectFiles; title: string; onExport?: () => void; js?: boolean; testPrefix: string }) {
  const { t } = useT();
  const zip = () => {
    const bytes = makeZip(exportEntries(files, title, exportRuntime(files.data)));
    downloadBlob(new Blob([bytes as BlobPart], { type: "application/zip" }), `${safeName(title)}.zip`);
    onExport?.();
  };
  const web = files.html.trim() || files.blocks.length;
  return (
    <>
      <button type="button" className="btn btn-sm" onClick={zip} title={t("p8.export.zipNote")} data-testid={`${testPrefix}-zip`}><FileArchive className="h-4 w-4" /> {t("p8.export.zip")}</button>
      {web ? <button type="button" className="btn btn-sm" onClick={() => { downloadBlob(new Blob([stitch(files)], { type: "text/html" }), `${safeName(title)}.html`); onExport?.(); }} data-testid={`${testPrefix}-html-export`}><FileCode className="h-4 w-4" /> {t("p8.export.html")}</button> : null}
      {js && <button type="button" className="btn btn-sm" onClick={() => { downloadBlob(new Blob([files.js], { type: "text/javascript" }), `${safeName(title)}.js`); onExport?.(); }} data-testid={`${testPrefix}-export`}><FileCode className="h-4 w-4" /> {t("p7.vibe.export")}</button>}
    </>
  );
}

/** Error/timeout text of a run, for 「用 AI 修」. */
export function errorText(status: string, lines: { kind: string; text: string }[]) {
  const errs = lines.filter((l) => l.kind === "error").map((l) => l.text);
  return [`status: ${status}`, ...errs.slice(-8)].join("\n").slice(0, 3000);
}
