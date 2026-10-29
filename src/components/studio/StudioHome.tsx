"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { withBase } from "@/lib/base-path";
import { api } from "@/lib/p2-client";
import type { DictKey } from "@/lib/i18n/dict";

type Option = { id: string; title: string };
type Source = "paste" | "upload" | "library" | "draft";
const ICON: Record<string, string> = { mindmap: "🧠", flashcards: "🗂️", quiz: "✅", worksheet: "📄", youtube: "▶️" };

export function StudioHome(props: {
  teacher: boolean;
  youtube: boolean;
  library: Option[];
  drafts: Option[];
  initialItem?: string;
  accept: string;
}) {
  const { t } = useT();
  const router = useRouter();
  const [source, setSource] = useState<Source>(props.initialItem ? "library" : "paste");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [itemId, setItemId] = useState(props.initialItem ?? "");
  const [draftId, setDraftId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<DictKey | null>(null);
  const [ytUrl, setYtUrl] = useState("");
  const [ytText, setYtText] = useState("");
  const [ytOpen, setYtOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const ytRef = useRef<HTMLInputElement>(null);
  const kinds = props.teacher ? (["worksheet", "mindmap", "flashcards", "quiz"] as const) : (["mindmap", "flashcards", "quiz"] as const);

  async function make(kind: (typeof kinds)[number]) {
    setBusy(kind);
    setError(null);
    let libraryItemId = source === "library" ? itemId : "";
    if (source === "upload" && file) {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(withBase("/api/library"), { method: "POST", body: fd }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as { files?: { id?: string }[] } | null;
      libraryItemId = j?.files?.[0]?.id ?? "";
      if (!libraryItemId) {
        setBusy(null);
        return setError("p2.err.generic");
      }
    }
    const r = await api<{ href: string }>("/api/studio/generate", {
      kind,
      title,
      text: source === "paste" ? text : "",
      libraryItemId: libraryItemId || undefined,
      draftId: source === "draft" ? draftId : undefined,
    });
    if (!r.ok) {
      setBusy(null);
      return setError(r.error);
    }
    router.push(r.data.href);
  }

  async function youtube(e: React.FormEvent) {
    e.preventDefault();
    setBusy("youtube");
    setError(null);
    const r = await api<{ href: string }>("/api/studio/youtube", { url: ytUrl.trim(), transcript: ytText, title });
    if (!r.ok) {
      setBusy(null);
      return setError(r.error);
    }
    router.push(r.data.href);
  }

  function openYoutube() {
    setYtOpen(true);
    setError(null);
    requestAnimationFrame(() => {
      document.getElementById("youtube")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      ytRef.current?.focus();
    });
  }

  const tab = (s: Source, label: DictKey) => (
    <button type="button" role="tab" aria-selected={source === s} className={`btn btn-sm ${source === s ? "btn-primary" : ""}`} onClick={() => setSource(s)}>
      {t(label)}
    </button>
  );

  return (
    <div className="space-y-6">
      <section className="card space-y-3 p-5">
        <h2 className="section-title">{t("st.source")}</h2>
        <div role="tablist" className="flex flex-wrap gap-2">
          {tab("paste", "st.paste")}
          {tab("upload", "st.uploadFile")}
          {tab("library", "st.fromLibrary")}
          {props.teacher && tab("draft", "st.fromDraft")}
        </div>
        {source === "paste" && (
          <textarea className="input min-h-40 font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("st.pastePh")} data-testid="studio-text" />
        )}
        {source === "upload" && (
          <div className="flex items-center gap-3">
            <input ref={fileRef} type="file" accept={props.accept} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
            <span className="text-xs text-slate-500">{t("lib.uploadHint")}</span>
          </div>
        )}
        {source === "library" && (
          <select className="input" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">{t("st.pick")}</option>
            {props.library.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
          </select>
        )}
        {source === "draft" && (
          <select className="input" value={draftId} onChange={(e) => setDraftId(e.target.value)}>
            <option value="">{t("st.pick")}</option>
            {props.drafts.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
          </select>
        )}
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("st.titlePh")} maxLength={120} />
      </section>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{t(error)}</p>}

      <section className={`grid gap-3 sm:grid-cols-2 ${props.teacher ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            className="card flex flex-col items-start gap-1 p-4 text-left transition hover:border-brand-300 hover:shadow disabled:opacity-60"
            disabled={!!busy || (source === "library" && !itemId) || (source === "draft" && !draftId) || (source === "upload" && !file)}
            onClick={() => make(k)}
            data-testid={`studio-make-${k}`}
          >
            <span className="text-2xl" aria-hidden>{ICON[k]}</span>
            <span className="font-semibold">{busy === k ? t("p2.working") : t(`st.k.${k}` as DictKey)}</span>
            <span className="text-xs text-slate-500">{t(`st.k.${k}Desc` as DictKey)}</span>
          </button>
        ))}
        {(props.youtube || !props.teacher) && (
          <button
            type="button"
            className={`card flex flex-col items-start gap-1 p-4 text-left transition hover:border-brand-300 hover:shadow disabled:opacity-60 ${ytOpen ? "border-brand-400 ring-2 ring-brand-100" : ""}`}
            disabled={!props.youtube || !!busy}
            onClick={openYoutube}
            aria-expanded={ytOpen}
            aria-controls="youtube"
            data-testid="studio-make-youtube"
          >
            <span className="text-2xl" aria-hidden>{ICON.youtube}</span>
            <span className="font-semibold">{busy === "youtube" ? t("p2.working") : t("st.k.youtube")}</span>
            <span className="text-xs text-slate-500">{props.youtube ? t("st.k.youtubeDesc") : t("st.yt.off")}</span>
          </button>
        )}
      </section>

      {props.youtube && ytOpen && (
        <section className="card space-y-3 p-5" id="youtube" data-testid="yt-panel">
          <h2 className="section-title"><span aria-hidden>{ICON.youtube}</span> {t("st.k.youtube")}</h2>
          <form onSubmit={youtube} className="space-y-2">
            <input
              ref={ytRef}
              className="input"
              type="url"
              required
              value={ytUrl}
              onChange={(e) => setYtUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
              aria-label={t("st.yt.url")}
              data-testid="yt-url"
            />
            <p className="text-xs text-slate-500">{t("st.yt.auto")}</p>
            <details className="text-sm">
              <summary className="cursor-pointer text-slate-600">{t("st.yt.addTranscript")}</summary>
              <textarea className="input mt-2 min-h-20 text-sm" value={ytText} onChange={(e) => setYtText(e.target.value)} placeholder={t("st.yt.transcript")} />
            </details>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">{t("st.yt.copyright")}</p>
              <button className="btn btn-primary" disabled={!!busy} data-testid="yt-make">{busy === "youtube" ? t("st.yt.working") : t("st.make")}</button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
