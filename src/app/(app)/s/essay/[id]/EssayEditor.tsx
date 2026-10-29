"use client";
import { useState, useTransition } from "react";
import { useT } from "@/lib/i18n/client";
import { GENRES, SUBJECTS, wordCount } from "@/lib/essay";
import { FeedbackCard } from "@/components/essay/FeedbackCard";
import type { DictKey } from "@/lib/i18n/dict";
import type { EssayFeedback, EssayStatus, RubricScores } from "@/lib/db/schema";
import { assessEssay, deleteEssay, saveEssay, submitEssay, type EssayFields } from "../actions";

type Version = { version: number; feedback: EssayFeedback | null };

export function EssayEditor(props: {
  id: string;
  initial: EssayFields;
  status: EssayStatus;
  versions: Version[];
  teacher?: { grade: string | null; scores: RubricScores | null; comment: string };
}) {
  const { t } = useT();
  const [f, setF] = useState(props.initial);
  const [status, setStatus] = useState(props.status);
  const [versions, setVersions] = useState(props.versions);
  const [shown, setShown] = useState(props.versions.at(-1)?.version ?? 0);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<DictKey | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"save" | "assess" | "submit" | null>(null);
  const locked = status === "submitted";
  const set = <K extends keyof EssayFields>(k: K, v: EssayFields[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setDirty(true);
  };
  const run = (kind: "save" | "assess" | "submit", fn: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    start(async () => {
      await fn();
      setBusy(null);
    });
  };

  const save = () => run("save", async () => { await saveEssay(props.id, f); setDirty(false); });
  const assess = () =>
    run("assess", async () => {
      const r = await assessEssay(props.id, f);
      setDirty(false);
      if (r.error) return setError(r.error);
      setVersions((v) => [...v, { version: r.version!, feedback: r.feedback! }]);
      setShown(r.version!);
      setStatus("ai_scored");
    });
  const submit = () => run("submit", async () => { await submitEssay(props.id, f); setStatus("submitted"); setDirty(false); });
  const fb = versions.find((v) => v.version === shown)?.feedback;
  const words = wordCount(f.content);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-3">
        <div className="card space-y-3 p-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
            <input className="input font-semibold" value={f.title} onChange={(e) => set("title", e.target.value)} disabled={locked} aria-label={t("p2.title")} />
            <select className="input w-auto" value={f.subject} onChange={(e) => set("subject", e.target.value)} disabled={locked} aria-label={t("es.subject")}>
              {SUBJECTS.map((s) => <option key={s} value={s}>{t(`es.subject.${s}` as DictKey)}</option>)}
            </select>
            <select className="input w-auto" value={f.genre} onChange={(e) => set("genre", e.target.value)} disabled={locked} aria-label={t("es.genre")}>
              {GENRES.map((g) => <option key={g} value={g}>{t(`es.genre.${g}` as DictKey)}</option>)}
            </select>
            <label className="flex items-center gap-1 text-sm text-slate-600">
              {t("es.wordTarget")}
              <input className="input w-20" type="number" min={50} max={3000} step={50} value={f.wordTarget} onChange={(e) => set("wordTarget", Number(e.target.value))} disabled={locked} />
            </label>
          </div>
          <textarea className="input min-h-16 text-sm" value={f.prompt} onChange={(e) => set("prompt", e.target.value)} placeholder={t("es.promptPh")} disabled={locked} aria-label={t("es.prompt")} />
          <p className="text-xs text-slate-500">{t("es.rubric")}</p>
        </div>
        <textarea
          className="input min-h-[26rem] text-base leading-relaxed"
          value={f.content}
          onChange={(e) => set("content", e.target.value)}
          placeholder={t("es.writePh")}
          disabled={locked}
          data-testid="essay-content"
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-sm ${words >= f.wordTarget ? "text-teal-700" : "text-slate-500"}`}>{t("es.words", { n: words })} / {f.wordTarget}</span>
          <span className="ml-auto" />
          {!locked && (
            <>
              <button className="btn btn-ghost text-rose-700" onClick={() => window.confirm(t("p2.confirmDelete", { title: f.title })) && start(() => deleteEssay(props.id))}>{t("common.delete")}</button>
              <button className="btn" onClick={save} disabled={pending || !dirty}>{busy === "save" ? t("es.saving") : dirty ? t("es.save") : t("common.saved")}</button>
              <button className="btn" onClick={submit} disabled={pending || versions.length === 0} data-testid="essay-submit">{t("es.submit")}</button>
            </>
          )}
        </div>
        {locked && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{t("es.submitted")}</p>}
      </div>

      <aside className="space-y-4">
        {props.teacher?.grade && (
          <div className="card space-y-2 border-teal-200 p-4">
            <h3 className="font-semibold text-teal-800">{t("es.teacher")} · {props.teacher.grade}</h3>
            {props.teacher.comment && <p className="text-sm whitespace-pre-line">{props.teacher.comment}</p>}
          </div>
        )}
        <div className="card space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{t("es.panel")}</h3>
            {!locked && (
              <button className="btn btn-primary btn-sm" onClick={assess} disabled={pending} data-testid="essay-assess">
                {busy === "assess" ? t("p2.working") : versions.length ? t("es.reassess") : t("es.assess")}
              </button>
            )}
          </div>
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{t(error)}</p>}
          {fb ? <FeedbackCard feedback={fb} /> : <p className="text-sm text-slate-500">{t("es.noFeedback")}</p>}
          {versions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 border-t border-slate-100 pt-3 text-sm">
              <span className="mr-1 text-slate-500">{t("es.versions")}</span>
              {versions.map((v) => (
                <button key={v.version} className={`btn btn-sm ${v.version === shown ? "btn-primary" : ""}`} onClick={() => setShown(v.version)}>
                  {t("es.version", { n: v.version })}{v.feedback ? ` · ${v.feedback.grade}` : ""}
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
