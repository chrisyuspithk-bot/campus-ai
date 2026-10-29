"use client";
import { useEffect, useState } from "react";
import { Check, FileText, Loader2, Lock, Upload } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { withBase } from "@/lib/base-path";
import type { DictKey } from "@/lib/i18n/dict";
import { SubmitButton } from "@/components/SubmitButton";
import { createAssignment } from "../actions";

type PaperOpt = { id: string; title: string; count: number; durationMin: number; shuffle: boolean; lockAi: boolean };
type ClassOpt = { id: string; label: string; members: number };

const STEPS: DictKey[] = ["asg.wiz.step1", "asg.wiz.step2", "asg.wiz.step3", "asg.wiz.step4"];

/** Local "YYYY-MM-DDTHH:mm" for <input type="datetime-local">. */
function localInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function AssignWizard(props: { papers: PaperOpt[]; classes: ClassOpt[]; examLockAllowed: boolean; initialPaper?: string; initialClass?: string }) {
  const { t } = useT();
  const initPaper = props.papers.find((p) => p.id === props.initialPaper) ?? props.papers[0];
  const [step, setStep] = useState(0);
  const [source, setSource] = useState<"paper" | "upload">(props.papers.length ? "paper" : "upload");
  const [paperId, setPaperId] = useState(initPaper?.id ?? "");
  const [file, setFile] = useState<{ id: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState(props.initialPaper ? (initPaper?.title ?? "") : "");
  const [instructions, setInstructions] = useState("");
  const [kind, setKind] = useState<"quiz" | "homework" | "exam">("quiz");
  const [classId, setClassId] = useState(props.classes.find((c) => c.id === props.initialClass)?.id ?? props.classes[0]?.id ?? "");
  const [due, setDue] = useState("");
  const [duration, setDuration] = useState(initPaper?.durationMin ?? 45);
  const [lockAi, setLockAi] = useState(props.examLockAllowed && (initPaper?.lockAi ?? true));
  const [shuffle, setShuffle] = useState(initPaper?.shuffle ?? false);
  const [review, setReview] = useState(true);
  const [error, setError] = useState<DictKey | null>(null);

  // Default deadline: tonight 23:59 in the teacher's own timezone.
  useEffect(() => {
    const d = new Date();
    d.setHours(23, 59, 0, 0);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- depends on the browser's timezone
    setDue(localInput(d));
  }, []);

  const paper = props.papers.find((p) => p.id === paperId);
  const cls = props.classes.find((c) => c.id === classId);

  function pickPaper(id: string) {
    setPaperId(id);
    const p = props.papers.find((x) => x.id === id);
    if (p) {
      setDuration(p.durationMin);
      setShuffle(p.shuffle);
      setLockAi(props.examLockAllowed && p.lockAi);
    }
  }

  function pickSource(s: "paper" | "upload") {
    setSource(s);
    if (s === "upload") {
      setKind("homework");
      setDuration(0);
      setLockAi(false);
      setShuffle(false);
    } else if (paper) {
      pickPaper(paper.id);
      setKind("quiz");
    }
  }

  async function upload(f: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", f);
    fd.append("folder", "派發");
    try {
      const res = await fetch(withBase("/api/library"), { method: "POST", body: fd });
      const j = (await res.json()) as { files?: { id?: string; filename: string }[] };
      const r = j.files?.[0];
      if (r?.id) {
        setFile({ id: r.id, name: r.filename });
        if (!title) setTitle(r.filename.replace(/\.[^.]+$/, ""));
      } else setError("p2.err.generic");
    } catch {
      setError("p2.err.generic");
    } finally {
      setUploading(false);
    }
  }

  function next() {
    setError(null);
    if (step === 0 && (source === "paper" ? !paper : !file && !instructions.trim())) return setError("asg.wiz.needSource");
    if (step === 1 && !cls) return setError("asg.wiz.needClass");
    setStep(step + 1);
  }

  const effectiveTitle = title.trim() || (source === "paper" ? paper?.title : file?.name) || "";

  return (
    <form
      action={createAssignment}
      className="card p-5 sm:p-6"
      data-testid="assign-wizard"
      onKeyDown={(e) => {
        // Enter in a text field must not skip the remaining steps.
        if (e.key === "Enter" && step < 3 && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
      }}
    >
      <ol className="mb-6 flex flex-wrap gap-2 text-sm">
        {STEPS.map((s, n) => (
          <li key={s} className={`flex items-center gap-2 rounded-full px-3 py-1 ${n === step ? "bg-brand-600 text-white" : n < step ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-500"}`}>
            {n < step ? <Check className="h-3.5 w-3.5" /> : <span>{n + 1}</span>} {t(s)}
          </li>
        ))}
      </ol>

      {/* Every field is always in the form so the final submit carries all values. */}
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="paperId" value={source === "paper" ? paperId : ""} />
      <input type="hidden" name="fileId" value={source === "upload" ? (file?.id ?? "") : ""} />
      <input type="hidden" name="title" value={effectiveTitle} />
      <input type="hidden" name="instructions" value={instructions} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="dueAt" value={due ? new Date(due).toISOString() : ""} />
      <input type="hidden" name="durationMin" value={duration} />
      {lockAi && <input type="hidden" name="lockAi" value="on" />}
      {shuffle && source === "paper" && <input type="hidden" name="shuffle" value="on" />}
      {review && <input type="hidden" name="allowReview" value="on" />}

      {step === 0 && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {(["paper", "upload"] as const).map((s) => (
              <button type="button" key={s} onClick={() => pickSource(s)} aria-pressed={source === s} className={`flex items-center gap-3 rounded-xl border p-4 text-left ${source === s ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:bg-slate-50"}`}>
                {s === "paper" ? <FileText className="h-6 w-6 text-brand-600" /> : <Upload className="h-6 w-6 text-brand-600" />}
                <span className="font-medium">{t(s === "paper" ? "asg.wiz.fromPaper" : "asg.wiz.fromUpload")}</span>
              </button>
            ))}
          </div>
          {source === "paper" ? (
            props.papers.length === 0 ? (
              <p className="text-sm text-slate-500">{t("asg.wiz.noPapers")}</p>
            ) : (
              <fieldset className="space-y-2">
                <legend className="label">{t("asg.wiz.pickPaper")}</legend>
                {props.papers.map((p) => (
                  <label key={p.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${paperId === p.id ? "border-brand-500 bg-brand-50" : "border-slate-200"}`}>
                    <input type="radio" name="_paper" checked={paperId === p.id} onChange={() => pickPaper(p.id)} />
                    <span className="flex-1 font-medium">{p.title}</span>
                    <span className="text-xs text-slate-500">{t("p3.questions", { n: p.count })} · {t("p3.minutes", { n: p.durationMin })}</span>
                  </label>
                ))}
              </fieldset>
            )
          ) : (
            <div className="space-y-3">
              <label className="btn cursor-pointer">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {t("asg.wiz.uploadFile")}
                <input type="file" className="sr-only" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
              </label>
              {file && <p className="text-sm text-emerald-700">{t("asg.wiz.uploaded", { name: file.name })}</p>}
            </div>
          )}
          <div>
            <label className="label" htmlFor="wiz-instr">{t("asg.wiz.instructions")} <span className="font-normal text-slate-400">{t("p3.optional")}</span></label>
            <textarea id="wiz-instr" className="input min-h-20" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="wiz-title">{t("asg.wiz.assignTitle")}</label>
            <input id="wiz-title" className="input" value={title} placeholder={effectiveTitle} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="wiz-class">{t("asg.wiz.class")}</label>
            <select id="wiz-class" className="input" value={classId} onChange={(e) => setClassId(e.target.value)}>
              {props.classes.map((c) => <option key={c.id} value={c.id}>{c.label}（{t("cl.members", { n: c.members })}）</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="wiz-kind">{t("asg.wiz.kind")}</label>
            <select id="wiz-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              {(["quiz", "homework", "exam"] as const).map((k) => <option key={k} value={k}>{t(`asg.kind.${k}`)}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="wiz-due">{t("asg.wiz.due")}</label>
            <input id="wiz-due" type="datetime-local" className="input" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="wiz-dur">{t("asg.wiz.duration")}</label>
            <input id="wiz-dur" type="number" min={0} max={600} className="input" value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <label className={`flex items-center gap-3 rounded-lg border p-3 ${props.examLockAllowed ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
            <input type="checkbox" checked={lockAi} disabled={!props.examLockAllowed} onChange={(e) => setLockAi(e.target.checked)} data-testid="wiz-lock" />
            <Lock className="h-4 w-4 text-rose-500" /> {t("asg.wiz.lockAi")}
            {!props.examLockAllowed && <span className="text-xs text-slate-500">— {t("asg.wiz.lockAiOff")}</span>}
          </label>
          <label className={`flex items-center gap-3 rounded-lg border p-3 ${source === "paper" ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
            <input type="checkbox" checked={shuffle && source === "paper"} disabled={source !== "paper"} onChange={(e) => setShuffle(e.target.checked)} /> {t("asg.wiz.shuffle")}
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3">
            <input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} /> {t("asg.wiz.review")}
          </label>
        </div>
      )}

      {step === 3 && (
        <div>
          <h2 className="section-title mb-3">{t("asg.wiz.summary")}</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm" data-testid="wiz-summary">
            <dt className="text-slate-500">{t("asg.wiz.assignTitle")}</dt><dd className="font-medium">{effectiveTitle}</dd>
            <dt className="text-slate-500">{t("asg.wiz.step1")}</dt><dd>{source === "paper" ? `${paper?.title} · ${t("p3.questions", { n: paper?.count ?? 0 })}` : (file?.name ?? "—")}</dd>
            <dt className="text-slate-500">{t("asg.wiz.class")}</dt><dd>{cls?.label}</dd>
            <dt className="text-slate-500">{t("asg.wiz.kind")}</dt><dd>{t(`asg.kind.${kind}`)}</dd>
            <dt className="text-slate-500">{t("asg.wiz.due")}</dt><dd>{due.replace("T", " ")}</dd>
            <dt className="text-slate-500">{t("sa.detail.time")}</dt><dd>{duration ? t("p3.minutes", { n: duration }) : t("p3.untimed")}</dd>
            <dt className="text-slate-500">{t("asg.col.lock")}</dt><dd>{lockAi ? t("common.on") : t("common.off")}</dd>
            <dt className="text-slate-500">{t("pp.shuffle")}</dt><dd>{shuffle && source === "paper" ? t("common.on") : t("common.off")}</dd>
          </dl>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-rose-600" role="alert">{t(error)}</p>}
      <div className="mt-6 flex justify-between">
        <button type="button" className="btn" onClick={() => setStep(step - 1)} disabled={step === 0}>{t("asg.wiz.prev")}</button>
        {step < 3 ? (
          <button type="button" className="btn btn-primary" onClick={next} data-testid="wiz-next">{t("asg.wiz.next")}</button>
        ) : (
          <SubmitButton>{t("asg.wiz.confirm")}</SubmitButton>
        )}
      </div>
    </form>
  );
}
