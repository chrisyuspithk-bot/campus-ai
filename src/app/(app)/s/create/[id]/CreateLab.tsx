"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Monitor, Smartphone, Code, Download, Share2, Image as ImageIcon, Presentation } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import type { DictKey } from "@/lib/i18n/dict";
import type { CreateKind, CreateMessage } from "@/lib/db/schema";
import { downloadBlob, htmlSlidesToPptx, htmlToImage, safeName } from "@/lib/export-client";
import { deleteProject, sendCreate, shareProject } from "../actions";

export function CreateLab(props: { id: string; kind: CreateKind; title: string; messages: CreateMessage[]; html: string; shared: boolean }) {
  const { t } = useT();
  const [messages, setMessages] = useState(props.messages);
  const [html, setHtml] = useState(props.html);
  const [title, setTitle] = useState(props.title);
  const [input, setInput] = useState("");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [showCode, setShowCode] = useState(false);
  const [error, setError] = useState<DictKey | null>(null);
  const [shared, setShared] = useState(props.shared);
  const [pending, start] = useTransition();
  const [exporting, setExporting] = useState<"png" | "pptx" | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, pending]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending) return;
    setInput("");
    setError(null);
    setMessages((m) => [...m, { role: "user", content: text }]);
    start(async () => {
      const r = await sendCreate(props.id, text);
      if (r.error) {
        setError(r.error);
        setMessages((m) => m.slice(0, -1));
        setInput(text);
        return;
      }
      setMessages(r.messages!);
      setHtml(r.html!);
      setTitle(r.title!);
    });
  }

  function exportHtml() {
    downloadBlob(new Blob([html], { type: "text/html" }), `${safeName(title)}.html`);
  }

  async function exportFile(type: "png" | "pptx") {
    setExporting(type);
    setError(null);
    try {
      if (type === "pptx") await htmlSlidesToPptx(html, title);
      else downloadBlob(await htmlToImage(html, { width: props.kind === "poster" ? 900 : 1100 }), `${safeName(title)}.png`);
    } catch (e) {
      console.error(e);
      setError("cr.exportFailed");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="flex h-[calc(100vh-11rem)] min-h-[32rem] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="page-title mr-auto truncate">{title}</h1>
        <button className="btn btn-sm" onClick={() => start(async () => { await shareProject(props.id); setShared(true); })} disabled={!html || pending} data-testid="create-share">
          <Share2 className="h-4 w-4" /> {shared ? t("cr.shared") : t("cr.share")}
        </button>
        <button className="btn btn-sm btn-ghost text-rose-700" onClick={() => window.confirm(t("p2.confirmDelete", { title })) && start(() => deleteProject(props.id))}>{t("common.delete")}</button>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[22rem_1fr]">
        <section className="card flex min-h-0 flex-col" aria-label={t("cr.chat")}>
          <div className="flex-1 space-y-3 overflow-y-auto p-3 text-sm">
            <p className="rounded-lg bg-slate-100 p-2.5">{t("cr.hello")}</p>
            {messages.map((m, i) => (
              <p key={i} className={`rounded-lg p-2.5 whitespace-pre-wrap ${m.role === "user" ? "ml-6 bg-brand-600 text-white" : "mr-6 bg-slate-100"}`}>{m.content}</p>
            ))}
            {pending && <p className="mr-6 animate-pulse rounded-lg bg-slate-100 p-2.5 text-slate-500">{t("p2.working")}</p>}
            <div ref={endRef} />
          </div>
          {error && <p className="mx-3 mb-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{t(error)}</p>}
          <form onSubmit={send} className="flex gap-2 border-t border-slate-200 p-2">
            <input className="input flex-1" value={input} onChange={(e) => setInput(e.target.value)} placeholder={t("cr.inputPh")} data-testid="create-input" />
            <button className="btn btn-primary" disabled={pending || !input.trim()}>{t("cr.send")}</button>
          </form>
        </section>
        <section className="card flex min-h-0 flex-col" aria-label={t("cr.preview")}>
          <div className="flex flex-wrap gap-1.5 border-b border-slate-200 p-2">
            <button className={`btn btn-sm ${device === "desktop" ? "btn-primary" : ""}`} onClick={() => setDevice("desktop")}><Monitor className="h-4 w-4" /> {t("cr.desktop")}</button>
            <button className={`btn btn-sm ${device === "mobile" ? "btn-primary" : ""}`} onClick={() => setDevice("mobile")}><Smartphone className="h-4 w-4" /> {t("cr.mobile")}</button>
            <button className={`btn btn-sm ${showCode ? "btn-primary" : ""}`} onClick={() => setShowCode(!showCode)} disabled={!html} data-testid="create-code"><Code className="h-4 w-4" /> {t("cr.code")}</button>
            <span className="ml-auto" />
            {props.kind === "slides" && (
              <button className="btn btn-sm btn-primary" onClick={() => exportFile("pptx")} disabled={!html || !!exporting} data-testid="create-export-pptx">
                <Presentation className="h-4 w-4" /> {exporting === "pptx" ? t("cr.exporting") : t("cr.exportPptx")}
              </button>
            )}
            <button className={`btn btn-sm ${props.kind === "poster" ? "btn-primary" : ""}`} onClick={() => exportFile("png")} disabled={!html || !!exporting} data-testid="create-export-png">
              <ImageIcon className="h-4 w-4" /> {exporting === "png" ? t("cr.exporting") : t("cr.exportImage")}
            </button>
            <button className="btn btn-sm" onClick={exportHtml} disabled={!html} data-testid="create-export-html"><Download className="h-4 w-4" /> {t("cr.export")}</button>
          </div>
          <div className="grid min-h-0 flex-1 place-items-center overflow-auto bg-slate-100 p-3">
            {html && showCode ? (
              <pre className="h-full w-full overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100" data-testid="create-source">{html}</pre>
            ) : html ? (
              // sandbox="" → no scripts, no same-origin access, no navigation.
              <iframe
                sandbox=""
                srcDoc={html}
                title={t("cr.preview")}
                className={`h-full rounded-lg bg-white shadow ${device === "mobile" ? "w-[390px] max-w-full" : "w-full"}`}
                data-testid="create-preview"
              />
            ) : (
              <p className="text-sm text-slate-500">{t("cr.noPreview")}</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
