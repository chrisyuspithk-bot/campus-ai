"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CloudOff, Loader2, Lock, Upload } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { withBase } from "@/lib/base-path";
import { Markdown } from "@/components/Markdown";
import type { AttemptAnswers } from "@/lib/db/schema";
import type { ExamQuestion } from "@/lib/p3/exam";
import { saveAttemptAction, submitAttemptAction } from "../../actions";

const LETTERS = "ABCDEF";
const fileKey = (qid: string) => `${qid}:file`;

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

export function ExamClient(props: {
  assignment: { id: string; title: string; lockAi: boolean; timed: boolean };
  attemptId: string;
  deadline: number;
  serverNow: number;
  questions: ExamQuestion[];
  initialAnswers: AttemptAnswers;
  initialBlur: number;
  savedAt: number;
}) {
  const { t } = useT();
  const router = useRouter();
  const qs = props.questions;
  const storeKey = `campus.exam.${props.attemptId}`;
  const [answers, setAnswers] = useState<AttemptAnswers>(props.initialAnswers);
  const [i, setI] = useState(0);
  const [save, setSave] = useState<"saved" | "saving" | "offline">("saved");
  const [now, setNow] = useState(props.serverNow);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const blur = useRef(props.initialBlur);
  const answersRef = useRef(answers);
  const dirty = useRef(false);
  const doneRef = useRef(false);
  const skew = useRef(0);

  // Clock: follow the server's time so a wrong device clock can't stretch the exam.
  useEffect(() => {
    skew.current = props.serverNow - Date.now();
    const h = setInterval(() => setNow(Date.now() + skew.current), 1000);
    return () => clearInterval(h);
  }, [props.serverNow]);

  // Restore a newer local draft (e.g. saved while offline before a reload).
  useEffect(() => {
    try {
      const local = JSON.parse(localStorage.getItem(storeKey) ?? "null") as { at: number; answers: AttemptAnswers } | null;
      if (local && local.at > props.savedAt) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
        setAnswers((a) => ({ ...a, ...local.answers }));
        dirty.current = true;
      }
    } catch {}
  }, [storeKey, props.savedAt]);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  // Window switches are only logged for the teacher — no warning in the UI.
  useEffect(() => {
    const onBlur = () => {
      blur.current += 1;
      dirty.current = true;
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, []);

  const flush = useCallback(async () => {
    if (!dirty.current || doneRef.current) return;
    dirty.current = false;
    setSave("saving");
    try {
      const r = await saveAttemptAction(props.attemptId, answersRef.current, blur.current);
      if (r.ok) setSave("saved");
      else if (r.closed) router.refresh();
    } catch {
      dirty.current = true;
      setSave("offline");
    }
  }, [props.attemptId, router]);

  // Autosave: debounce edits, retry while offline.
  useEffect(() => {
    const h = setInterval(() => void flush(), 4000);
    return () => clearInterval(h);
  }, [flush]);

  function setAnswer(key: string, value: string) {
    setAnswers((a) => {
      const next = { ...a, [key]: value };
      try {
        localStorage.setItem(storeKey, JSON.stringify({ at: Date.now(), answers: next }));
      } catch {}
      return next;
    });
    dirty.current = true;
    setSave("saving");
  }

  const submit = useCallback(
    async (auto: boolean) => {
      if (doneRef.current) return;
      doneRef.current = true;
      setSubmitting(true);
      for (let tries = 0; tries < 5; tries++) {
        try {
          const r = await submitAttemptAction(props.attemptId, answersRef.current, blur.current, auto);
          localStorage.removeItem(storeKey);
          router.replace(r.next);
          return;
        } catch {
          setSave("offline");
          await new Promise((res) => setTimeout(res, 3000));
        }
      }
      doneRef.current = false;
      setSubmitting(false);
    },
    [props.attemptId, router, storeKey],
  );

  const remaining = props.deadline - now;
  useEffect(() => {
    if (remaining <= 0 && !doneRef.current) void submit(true);
  }, [remaining, submit]);

  async function upload(qid: string, file: File) {
    setUploading(qid);
    setUploadErr(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("folder", "功課");
    try {
      const res = await fetch(withBase("/api/library"), { method: "POST", body: fd });
      const j = (await res.json()) as { files?: { id?: string; filename: string; error?: string }[] };
      const f = j.files?.[0];
      if (!res.ok || !f?.id) throw new Error(f?.error ?? "upload");
      setAnswer(fileKey(qid), `${f.id}|${f.filename}`);
    } catch {
      setUploadErr(qid);
    } finally {
      setUploading(null);
    }
  }

  const isAnswered = (qid: string) => !!(answers[qid]?.trim() || answers[fileKey(qid)]);
  const answered = qs.filter((q) => isAnswered(q.id)).length;
  const q = qs[i];
  const low = props.assignment.timed && remaining < 5 * 60_000;
  const fileName = q ? answers[fileKey(q.id)]?.split("|").slice(1).join("|") : undefined;

  return (
    <div className="flex min-h-full flex-col" data-testid="exam-shell">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-brand-700">
            {props.assignment.lockAi && <Lock className="h-4 w-4" aria-label="AI locked" />} {t("ex.brand")}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">{props.assignment.title}</span>
          <span className={`font-mono text-sm tabular-nums ${low ? "font-bold text-rose-600" : "text-slate-700"}`} data-testid="exam-timer" aria-live="off">
            {t("ex.remaining")} {fmt(remaining)}
          </span>
          <span className="flex items-center gap-1 text-xs text-slate-500" data-testid="exam-save">
            {save === "saved" && <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> {t("ex.saved")}</>}
            {save === "saving" && <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("ex.saving")}</>}
            {save === "offline" && <><CloudOff className="h-3.5 w-3.5 text-amber-600" /> {t("ex.offline")}</>}
          </span>
          <button className="btn btn-primary" onClick={() => { void flush(); setConfirming(true); }} disabled={submitting} data-testid="exam-submit">
            {t("ex.submit")}
          </button>
        </div>
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-1.5 px-4 pb-2">
          {qs.map((x, n) => (
            <button
              key={x.id}
              onClick={() => setI(n)}
              aria-current={n === i ? "step" : undefined}
              className={`h-8 min-w-8 rounded-lg border px-2 text-sm font-medium ${
                n === i ? "border-brand-600 bg-brand-600 text-white" : isAnswered(x.id) ? "border-brand-200 bg-brand-50 text-brand-700" : "border-slate-300 bg-white text-slate-600"
              }`}
            >
              {n + 1}
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-500" data-testid="exam-answered">{t("ex.answered", { n: answered, total: qs.length })}</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        {submitting ? (
          <div className="card p-8 text-center text-slate-600"><Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />{remaining <= 0 ? t("ex.timeUp") : t("ex.saving")}</div>
        ) : q ? (
          <div className="card p-5 sm:p-6" data-testid="exam-question">
            {q.section && <div className="mb-2 text-xs font-semibold tracking-wide text-slate-400">{q.section}</div>}
            <div className="mb-3 flex items-baseline gap-2">
              <span className="font-semibold">{t("ex.q", { n: i + 1 })}</span>
              {q.marks > 0 && <span className="text-sm text-slate-500">（{t("p3.marks", { n: q.marks })}）</span>}
            </div>
            <Markdown>{q.stem}</Markdown>

            <div className="mt-5">
              {q.type === "mc" && (
                <fieldset className="space-y-2">
                  <legend className="sr-only">{t("ex.q", { n: i + 1 })}</legend>
                  {q.options.map((o, k) => (
                    <label key={k} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${answers[q.id] === String(k) ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:bg-slate-50"}`}>
                      <input type="radio" name={`q-${q.id}`} className="mt-1" checked={answers[q.id] === String(k)} onChange={() => setAnswer(q.id, String(k))} />
                      <span className="font-medium">{LETTERS[k]}</span>
                      <div className="min-w-0 flex-1"><Markdown>{o}</Markdown></div>
                    </label>
                  ))}
                </fieldset>
              )}
              {q.type === "short" && (
                <input className="input max-w-md" placeholder={t("ex.shortPh")} value={answers[q.id] ?? ""} onChange={(e) => setAnswer(q.id, e.target.value)} aria-label={t("ex.shortPh")} />
              )}
              {(q.type === "long" || q.type === "upload") && (
                <textarea className="input min-h-48" placeholder={t("ex.longPh")} value={answers[q.id] ?? ""} onChange={(e) => setAnswer(q.id, e.target.value)} aria-label={t("ex.longPh")} />
              )}
              {q.type === "upload" && (
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                  <label className="btn cursor-pointer">
                    {uploading === q.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {uploading === q.id ? t("ex.uploading") : t("ex.upload")}
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      capture="environment"
                      className="sr-only"
                      disabled={!!uploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void upload(q.id, f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {fileName && <span className="text-emerald-700">{t("ex.uploadedFile", { name: fileName })}</span>}
                  {uploadErr === q.id && <span className="text-rose-600">{t("ex.uploadErr")}</span>}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-between">
              <button className="btn" onClick={() => setI(i - 1)} disabled={i === 0}>{t("ex.prev")}</button>
              <button className="btn" onClick={() => setI(i + 1)} disabled={i >= qs.length - 1}>{t("ex.next")}</button>
            </div>
          </div>
        ) : null}
      </main>

      {confirming && !submitting && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="exam-modal-title">
          <div className="card w-full max-w-sm p-6">
            <h2 id="exam-modal-title" className="text-lg font-semibold">{t("ex.modal.title")}</h2>
            <p className={`mt-2 ${answered < qs.length ? "text-amber-700" : "text-slate-600"}`}>
              {answered < qs.length ? t("ex.modal.unanswered", { n: qs.length - answered }) : t("ex.modal.allDone")}
            </p>
            <p className="mt-1 text-sm text-slate-500">{t("ex.modal.note")}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn" onClick={() => setConfirming(false)}>{t("ex.modal.back")}</button>
              <button className="btn btn-primary" onClick={() => void submit(false)} data-testid="exam-confirm">{t("ex.modal.confirm")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
