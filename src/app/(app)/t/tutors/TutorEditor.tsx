"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { deleteTutor, saveTutor, type TutorInput } from "./actions";
import { withBase } from "@/lib/base-path";

type Tutor = TutorInput & { id: string; slug: string; status: "draft" | "published" };
type FileRow = { id: string; filename: string; size: number; status: "indexing" | "ready" | "unsupported"; chunkCount: number };

const LEVELS = ["S1", "S2", "S3", "S4", "S5", "S6"];
const STRATEGIES = ["strict", "moderate", "answers"] as const;

function kb(n: number) {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function TutorEditor({ tutor, files, models }: { tutor: Tutor; files: FileRow[]; models: { id: string; displayName: string }[] }) {
  const { t } = useT();
  const router = useRouter();
  const [form, setForm] = useState<TutorInput>({
    name: tutor.name,
    nameEn: tutor.nameEn,
    subject: tutor.subject,
    emoji: tutor.emoji,
    levels: tutor.levels,
    strategy: tutor.strategy,
    tagline: tutor.tagline,
    blurb: tutor.blurb,
    will: tutor.will,
    wont: tutor.wont,
    topics: tutor.topics,
    systemPrompt: tutor.systemPrompt,
    modelWhitelist: tutor.modelWhitelist,
  });
  const [pending, start] = useTransition();
  const [flash, setFlash] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof TutorInput>(k: K, v: TutorInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggleIn = (k: "levels" | "modelWhitelist", v: string) =>
    setForm((f) => ({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] }));

  function save(status?: "draft" | "published") {
    start(async () => {
      await saveTutor(tutor.id, form, status);
      setFlash(true);
      setTimeout(() => setFlash(false), 1500);
      router.refresh();
    });
  }

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setUploading(true);
    setUploadError(null);
    const fd = new FormData();
    for (const f of Array.from(list)) fd.append("file", f);
    const res = await fetch(withBase(`/api/tutors/${tutor.id}/files`), { method: "POST", body: fd });
    if (!res.ok) setUploadError(`HTTP ${res.status}`);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  async function removeFile(id: string) {
    await fetch(withBase(`/api/tutor-files/${id}`), { method: "DELETE" });
    router.refresh();
  }

  const published = tutor.status === "published";

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6" data-testid="tutor-editor">
      <div className="flex items-center gap-3">
        <span className="text-3xl" aria-hidden>{form.emoji}</span>
        <h2 className="page-title flex-1">{form.name}</h2>
        <span className={`badge ${published ? "bg-teal-50 text-teal-700" : ""}`}>{published ? t("tt.published") : t("tt.draft")}</span>
      </div>

      <div className="card space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_5rem]">
          <div>
            <label className="label" htmlFor="tname">{t("tt.name")}</label>
            <input id="tname" className="input" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="tnameen">{t("tt.nameEn")}</label>
            <input id="tnameen" className="input" value={form.nameEn} onChange={(e) => set("nameEn", e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="temoji">{t("tt.emoji")}</label>
            <input id="temoji" className="input text-center" value={form.emoji} onChange={(e) => set("emoji", e.target.value)} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="tsubject">{t("tt.subject")}</label>
            <input id="tsubject" className="input" value={form.subject} onChange={(e) => set("subject", e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="ttagline">{t("tt.tagline")}</label>
            <input id="ttagline" className="input" value={form.tagline} onChange={(e) => set("tagline", e.target.value)} />
          </div>
        </div>
        <fieldset>
          <legend className="label">{t("tt.levels")}</legend>
          <div className="flex flex-wrap gap-3">
            {LEVELS.map((l) => (
              <label key={l} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={form.levels.includes(l)} onChange={() => toggleIn("levels", l)} /> {l}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="label">{t("tt.strategy")}</legend>
          <div className="flex flex-wrap gap-4">
            {STRATEGIES.map((s) => (
              <label key={s} className="flex items-center gap-1.5 text-sm">
                <input type="radio" name="strategy" className="h-4 w-4" checked={form.strategy === s} onChange={() => set("strategy", s)} /> {t(`tutors.strategy.${s}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label className="label" htmlFor="tblurb">{t("tt.blurb")}</label>
          <textarea id="tblurb" className="input" rows={2} value={form.blurb} onChange={(e) => set("blurb", e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="twill">{t("tt.will")}</label>
            <textarea id="twill" className="input" rows={3} value={form.will} onChange={(e) => set("will", e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="twont">{t("tt.wont")}</label>
            <textarea id="twont" className="input" rows={3} value={form.wont} onChange={(e) => set("wont", e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="ttopics">{t("tt.topics")}</label>
          <input id="ttopics" className="input" value={form.topics} onChange={(e) => set("topics", e.target.value)} />
        </div>
        <fieldset>
          <legend className="label">{t("tt.models")}</legend>
          <div className="flex flex-wrap gap-3">
            {models.map((m) => (
              <label key={m.id} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={form.modelWhitelist.includes(m.id)} onChange={() => toggleIn("modelWhitelist", m.id)} /> {m.displayName}
              </label>
            ))}
          </div>
        </fieldset>
        <details>
          <summary className="cursor-pointer text-sm font-medium text-slate-700">{t("tt.system")}</summary>
          <textarea className="input mt-2 font-mono text-xs" rows={6} value={form.systemPrompt} onChange={(e) => set("systemPrompt", e.target.value)} />
        </details>
      </div>

      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="section-title">{t("tt.files")}</h3>
          <button className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} {t("tt.upload")}
          </button>
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => upload(e.target.files)} data-testid="kb-upload" />
        </div>
        {files.length === 0 ? (
          <p className="text-sm text-slate-400">{t("tt.noFiles")}</p>
        ) : (
          <ul className="divide-y divide-slate-100" data-testid="kb-files">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-3 py-2 text-sm">
                <FileText className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <span className="flex-1 truncate">{f.filename}</span>
                <span className="text-xs text-slate-400">{kb(f.size)}</span>
                <span
                  className={`badge ${f.status === "ready" ? "bg-teal-50 text-teal-700" : f.status === "unsupported" ? "bg-amber-50 text-amber-800" : ""}`}
                >
                  {f.status === "ready" ? `✓ ${t("tt.fileReady")} · ${t("tt.chunks", { n: f.chunkCount })}` : f.status === "unsupported" ? t("tt.fileUnsupported") : t("tt.fileIndexing")}
                </span>
                <button className="rounded p-1 text-slate-400 hover:text-rose-600" onClick={() => removeFile(f.id)} aria-label={`${t("common.delete")} ${f.filename}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-500">{t("tt.uploadHint")}</p>
        {uploadError && <p className="mt-2 text-xs text-rose-600">{uploadError}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <a href={withBase(`/ai?tutor=${tutor.slug}&preview=1`)} target="_blank" rel="noreferrer" className="btn">
          <ExternalLink className="h-4 w-4" /> {t("tt.previewStudent")}
        </a>
        <div className="flex-1" />
        <button className="btn btn-danger" onClick={() => window.confirm(t("tt.deleteConfirm")) && start(() => deleteTutor(tutor.id))} disabled={pending}>
          <Trash2 className="h-4 w-4" />
        </button>
        <button className="btn" onClick={() => save()} disabled={pending}>
          {flash ? <Check className="h-4 w-4" /> : null} {t("tt.saveDraft")}
        </button>
        {published ? (
          <button className="btn" onClick={() => save("draft")} disabled={pending}>{t("tt.unpublish")}</button>
        ) : (
          <button className="btn btn-primary" onClick={() => save("published")} disabled={pending}>{t("tt.publish")}</button>
        )}
      </div>
    </div>
  );
}
