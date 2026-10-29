"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Camera, Loader2, Upload } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import type { DictKey } from "@/lib/i18n/dict";
import { withBase } from "@/lib/base-path";
import { Markdown } from "@/components/Markdown";

type Result = { id: string; conversationId: string; question: string; reply: string; mock: boolean; subject: string; topic: string };
const SUBJECTS = ["數學", "物理", "化學", "生物", "企業會計與財務概論", "資訊及通訊科技"];

export function PhotoPractice() {
  const { t } = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [subject, setSubject] = useState("數學");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  function pick(f: File | null) {
    setFile(f);
    setResult(null);
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || (!file && !text.trim())) return;
    setBusy(true);
    setError(null);
    setResult(null);
    const fd = new FormData();
    if (file) fd.set("file", file);
    fd.set("text", text);
    fd.set("subject", subject);
    try {
      const res = await fetch(withBase("/api/practice/photo"), { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setError(t(`p7.photo.err.${j.error ?? "generic"}` as DictKey) || j.error);
      else setResult(j as Result);
    } catch {
      setError(t("p7.photo.err.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <form onSubmit={submit} className="card space-y-3 p-4" data-testid="photo-form">
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)} data-testid="photo-file" />
        <button type="button" onClick={() => fileRef.current?.click()} className="grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-500 hover:border-brand-400">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt={t("p7.photo.preview")} className="h-full w-full object-contain" />
          ) : (
            <span className="flex flex-col items-center gap-2 text-sm"><Camera className="h-8 w-8" />{t("p7.photo.pick")}</span>
          )}
        </button>
        <div>
          <label className="label" htmlFor="photo-subject">{t("bk.subject")}</label>
          <select id="photo-subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)}>
            {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="photo-text">{t("p7.photo.typed")}</label>
          <textarea id="photo-text" className="input min-h-16 text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("p7.photo.typedHint")} />
        </div>
        <button className="btn btn-primary w-full" disabled={busy || (!file && !text.trim())} data-testid="photo-submit">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {busy ? t("p7.photo.reading") : t("p7.photo.go")}
        </button>
        <p className="text-xs text-slate-500">{t("p7.photo.rules")}</p>
      </form>

      <section className="card min-h-64 p-4" aria-live="polite" data-testid="photo-result">
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert" data-testid="photo-error">{error}</p>}
        {!result && !error && <p className="text-sm text-slate-500">{busy ? t("p7.photo.reading") : t("p7.photo.empty")}</p>}
        {result && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="badge">{result.subject}{result.topic && ` · ${result.topic}`}</span>
              {result.mock && <span className="badge bg-amber-50 text-amber-800">{t("p7.demo")}</span>}
              <span className="badge bg-emerald-50 text-emerald-700">{t("p7.photo.guided")}</span>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-sm" data-testid="photo-ocr">
              <div className="mb-1 text-xs text-slate-500">{t("p7.photo.ocr")}</div>
              <Markdown>{result.question}</Markdown>
            </div>
            <div className="text-sm" data-testid="photo-reply"><Markdown>{result.reply}</Markdown></div>
            <Link href={`/ai/c/${result.conversationId}`} className="btn btn-primary" data-testid="photo-continue">{t("p7.photo.continue")} →</Link>
          </div>
        )}
      </section>
    </div>
  );
}
