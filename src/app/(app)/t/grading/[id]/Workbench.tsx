"use client";
import { useMemo, useRef, useState } from "react";
import { Check, CheckCircle2, Highlighter, X, XCircle } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { Markdown } from "@/components/Markdown";
import type { Annotation, GradeStatus, InkItem, QuestionGrade, QuestionType, StepMark } from "@/lib/db/schema";
import { saveGradeAction } from "../actions";
import { HandwritingPane, type HwPage } from "./HandwritingPane";

export type WbQuestion = {
  id: string;
  section: string;
  type: QuestionType;
  stem: string;
  options: string[];
  answer: string;
  marks: number;
  given: string;
  fileUrl: string | null;
  fileName: string | null;
  grade: QuestionGrade;
};

const LETTERS = "ABCDEF";

/** Split text into plain / highlighted runs (first occurrence of each quote, non-overlapping). */
function segments(text: string, anns: Annotation[]) {
  const hits = anns
    .map((a, i) => ({ i, a, at: a.quote ? text.indexOf(a.quote) : -1 }))
    .filter((h) => h.at >= 0)
    .sort((x, y) => x.at - y.at);
  const out: { text: string; ann?: { i: number; a: Annotation } }[] = [];
  let pos = 0;
  for (const h of hits) {
    if (h.at < pos) continue;
    if (h.at > pos) out.push({ text: text.slice(pos, h.at) });
    out.push({ text: h.a.quote, ann: { i: h.i, a: h.a } });
    pos = h.at + h.a.quote.length;
  }
  if (pos < text.length) out.push({ text: text.slice(pos) });
  return out;
}

export function Workbench({ attemptId, questions, initialComment, status, defects, templates, pages = [], initialInk = {} }: {
  attemptId: string;
  questions: WbQuestion[];
  initialComment: string;
  status: GradeStatus;
  defects: string[];
  templates: string[];
  /** P5 handwriting mode: scanned pages of this script + saved ink layer */
  pages?: HwPage[];
  initialInk?: Record<string, InkItem[]>;
}) {
  const { t } = useT();
  const [marks, setMarks] = useState<Record<string, QuestionGrade>>(() => Object.fromEntries(questions.map((q) => [q.id, { score: q.grade.score, note: q.grade.note ?? "", tags: q.grade.tags ?? [], annotations: q.grade.annotations ?? [], ...(q.grade.steps ? { steps: q.grade.steps } : {}) }])));
  const [comment, setComment] = useState(initialComment);
  const [sel, setSel] = useState<{ qid: string; quote: string } | null>(null);
  const [annNote, setAnnNote] = useState("");
  const [active, setActive] = useState(questions.find((q) => q.type === "long" || q.type === "upload")?.id ?? questions[0]?.id);
  const formRef = useRef<HTMLFormElement>(null);
  const [ink, setInk] = useState<Record<string, InkItem[]>>(initialInk);
  const [inkSaved] = useState(() => JSON.stringify(initialInk));

  const set = (qid: string, patch: QuestionGrade) => setMarks((m) => ({ ...m, [qid]: { ...m[qid], ...patch } }));
  const scoreOf = (q: WbQuestion) => marks[q.id]?.score ?? q.grade.ai ?? 0;
  const total = questions.reduce((s, q) => s + scoreOf(q), 0);
  const aiTotal = questions.reduce((s, q) => s + (q.grade.ai ?? 0), 0);
  const max = questions.reduce((s, q) => s + q.marks, 0);
  const payload = useMemo(() => JSON.stringify({ marks, comment, ...(pages.length ? { ink } : {}) }), [marks, comment, ink, pages.length]);
  const activeQ = questions.find((q) => q.id === active);

  function captureSelection(qid: string) {
    const s = window.getSelection()?.toString().trim();
    if (s && s.length >= 1 && s.length <= 300) {
      setSel({ qid, quote: s });
      setActive(qid);
    }
  }

  function addAnnotation(kind: Annotation["kind"]) {
    if (!sel) return;
    const list = [...(marks[sel.qid]?.annotations ?? []), { quote: sel.quote, note: annNote.trim(), kind }];
    set(sel.qid, { annotations: list });
    setSel(null);
    setAnnNote("");
  }

  // P7 step partial credit: edits replace the AI steps and set the question score to their sum.
  const stepsOf = (q: WbQuestion): StepMark[] => marks[q.id]?.steps ?? q.grade.aiSteps ?? [];
  function setStep(q: WbQuestion, i: number, awarded: number) {
    const steps = stepsOf(q).map((s, k) => (k === i ? { ...s, marksAwarded: Math.max(0, Math.min(s.marksMax, awarded)), ok: awarded >= s.marksMax } : s));
    set(q.id, { steps, score: Math.min(q.marks, steps.reduce((n, s) => n + s.marksAwarded, 0)) });
  }

  const show = (q: WbQuestion, v: string) => (!v.trim() ? t("rs.blank") : q.type === "mc" ? `${LETTERS[Number(v)] ?? "?"}. ${q.options[Number(v)] ?? ""}` : v);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
      <div className="min-w-0 space-y-3">
      {pages.length > 0 && <HandwritingPane pages={pages} ink={ink} onChange={(pid, items) => setInk((m) => ({ ...m, [pid]: items }))} dirty={JSON.stringify(ink) !== inkSaved} />}
      <ol className="space-y-3" data-testid="wb-script">
        {questions.map((q, n) => {
          const auto = q.type === "mc" || q.type === "short";
          const ok = auto ? q.grade.ai === q.marks : null;
          const anns = marks[q.id]?.annotations ?? [];
          return (
            <li key={q.id} className={`card p-4 ${active === q.id ? "ring-2 ring-brand-200" : ""}`} onClick={() => setActive(q.id)}>
              <div className="mb-2 flex items-center gap-2 text-sm">
                <span className="font-semibold">{q.id === "_upload" ? t("gw.homework") : t("ex.q", { n: n + 1 })}</span>
                {q.section && <span className="text-xs text-slate-400">{q.section}</span>}
                <span className="ml-auto tabular-nums text-slate-600">{scoreOf(q)}/{q.marks}</span>
                {ok === true && <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label={t("rs.right")} />}
                {ok === false && <XCircle className="h-4 w-4 text-rose-600" aria-label={t("rs.wrong")} />}
              </div>
              <div className="text-sm"><Markdown>{q.stem}</Markdown></div>
              <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm">
                <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
                  {t("gw.answer")}
                  {!auto && <span className="inline-flex items-center gap-1 text-slate-400"><Highlighter className="h-3 w-3" />{t("gw.selectHint")}</span>}
                </div>
                {auto ? (
                  <Markdown>{show(q, q.given)}</Markdown>
                ) : (
                  <div className="whitespace-pre-wrap leading-relaxed" onMouseUp={() => captureSelection(q.id)} data-testid={`wb-answer-${n}`}>
                    {q.given.trim() ? segments(q.given, anns).map((s, i) =>
                      s.ann ? (
                        <mark key={i} className={`rounded px-0.5 ${s.ann.a.kind === "good" ? "bg-emerald-100" : "bg-rose-100"}`} title={s.ann.a.note}>{s.text}<sup className="ml-0.5 text-[10px] text-slate-500">{s.ann.i + 1}</sup></mark>
                      ) : <span key={i}>{s.text}</span>,
                    ) : <span className="text-slate-400">{t("rs.blank")}</span>}
                  </div>
                )}
                {q.grade.ocr !== undefined && pages.length > 0 && <p className="mt-1 text-[11px] text-violet-700" data-testid={`wb-ocr-${n}`}>{t("hw.ocr")}：{q.grade.ocr ? (q.type === "mc" ? (LETTERS[Number(q.grade.ocr)] ?? q.grade.ocr) : q.grade.ocr.slice(0, 80)) : "—"}</p>}
                {q.fileUrl && <a className="btn btn-sm mt-2" href={q.fileUrl} target="_blank" rel="noreferrer">{q.fileName}</a>}
              </div>
              {sel?.qid === q.id && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 p-2 text-sm" onClick={(e) => e.stopPropagation()}>
                  <span className="max-w-[12rem] truncate">「{sel.quote}」</span>
                  <input className="input w-48 flex-1 py-1" value={annNote} onChange={(e) => setAnnNote(e.target.value)} placeholder={t("gw.annNote")} />
                  <button type="button" className="btn btn-sm" onClick={() => addAnnotation("good")}><Check className="h-3 w-3 text-emerald-600" />{t("gw.good")}</button>
                  <button type="button" className="btn btn-sm" onClick={() => addAnnotation("bad")}><X className="h-3 w-3 text-rose-600" />{t("gw.bad")}</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSel(null)}>{t("common.cancel")}</button>
                </div>
              )}
              {anns.length > 0 && (
                <ol className="mt-2 space-y-1 text-xs">
                  {anns.map((a, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className={`badge ${a.kind === "good" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{i + 1}</span>
                      <span className="flex-1">「{a.quote}」{a.note && ` — ${a.note}`}</span>
                      <button type="button" className="text-slate-400 hover:text-rose-600" aria-label={t("common.delete")} onClick={() => set(q.id, { annotations: anns.filter((_, k) => k !== i) })}><X className="h-3 w-3" /></button>
                    </li>
                  ))}
                </ol>
              )}
              {!auto && stepsOf(q).length > 0 && (
                <div className="mt-2 rounded-lg border border-slate-200 p-2" onClick={(e) => e.stopPropagation()} data-testid={`wb-steps-${n}`}>
                  <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">{t("p7.steps.title")}</span>
                    <span>{marks[q.id]?.steps ? t("p7.steps.edited") : t("p7.steps.ai")}</span>
                    <span className="ml-auto tabular-nums">{t("p7.steps.sum", { n: Math.min(q.marks, stepsOf(q).reduce((s, x) => s + x.marksAwarded, 0)), m: q.marks })}</span>
                  </div>
                  <ol className="space-y-1">
                    {stepsOf(q).map((st, i) => {
                      const tone = st.marksAwarded >= st.marksMax ? "border-emerald-200 bg-emerald-50" : st.marksAwarded === 0 ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50";
                      return (
                        <li key={i} className={`flex flex-wrap items-center gap-2 rounded border px-2 py-1 text-xs ${tone}`} data-testid="wb-step">
                          {st.marksAwarded >= st.marksMax ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 text-rose-600" />}
                          <span className="min-w-0 flex-1"><b className="font-medium">{st.label}</b>{st.note && <span className="text-slate-500"> — {st.note}</span>}</span>
                          <button type="button" className="rounded px-1 text-emerald-700 hover:bg-white" onClick={() => setStep(q, i, st.marksMax)} aria-label={t("p7.steps.full")}><Check className="h-3 w-3" /></button>
                          <button type="button" className="rounded px-1 text-rose-700 hover:bg-white" onClick={() => setStep(q, i, 0)} aria-label={t("p7.steps.zero")}><X className="h-3 w-3" /></button>
                          <input
                            type="number" min={0} max={st.marksMax} step={1}
                            className="input w-14 px-1 py-0.5 text-center text-xs"
                            value={st.marksAwarded}
                            onChange={(e) => setStep(q, i, Number(e.target.value) || 0)}
                            aria-label={`${st.label} ${t("p7.steps.marks")}`}
                            data-testid={`wb-step-${n}-${i}`}
                          />
                          <span className="tabular-nums text-slate-500">/{st.marksMax}</span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}
              {!auto && q.answer && (
                <details className="mt-2 text-xs text-slate-500">
                  <summary className="cursor-pointer">{t("gw.reference")}</summary>
                  <div className="mt-1 rounded bg-emerald-50 p-2 text-slate-700"><Markdown>{q.answer}</Markdown></div>
                </details>
              )}
            </li>
          );
        })}
      </ol>
      </div>

      <aside className="space-y-3 xl:sticky xl:top-4 xl:self-start">
        <form ref={formRef} action={saveGradeAction} className="card space-y-3 p-4" data-testid="wb-rubric">
          <input type="hidden" name="attemptId" value={attemptId} />
          <input type="hidden" name="payload" value={payload} />
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">{t("gw.rubric")}</h2>
            <span className="text-2xl font-bold tabular-nums text-brand-700" data-testid="wb-total">{total}<span className="text-sm text-slate-400">/{max}</span></span>
          </div>
          <p className="text-xs text-slate-500">{t("gw.aiTotal")} {aiTotal}/{max}</p>
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-slate-500"><th className="text-left font-normal">#</th><th className="font-normal">AI</th><th className="font-normal">{t("gw.teacher")}</th></tr></thead>
            <tbody>
              {questions.map((q, n) => (
                <tr key={q.id} className={active === q.id ? "bg-brand-50" : ""}>
                  <td className="py-1"><button type="button" className="hover:underline" onClick={() => setActive(q.id)}>{q.id === "_upload" ? t("gw.homework") : `Q${n + 1}`}</button> <span className="text-xs text-slate-400">/{q.marks}</span></td>
                  <td className="text-center tabular-nums text-slate-500" title={q.grade.aiNote}>{q.grade.ai ?? "—"}</td>
                  <td className="py-1 text-center">
                    <input
                      type="number" min={0} max={q.marks} step={1}
                      className="input w-16 px-2 py-1 text-center"
                      value={marks[q.id]?.score ?? ""}
                      placeholder={String(q.grade.ai ?? 0)}
                      onChange={(e) => set(q.id, { score: e.target.value === "" ? undefined : Math.max(0, Math.min(q.marks, Number(e.target.value))) })}
                      aria-label={`Q${n + 1} ${t("gw.teacher")}`}
                      data-testid={`wb-score-${n}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {activeQ && (
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <h3 className="text-sm font-semibold">{t("gw.forQ", { q: activeQ.id === "_upload" ? t("gw.homework") : `Q${questions.indexOf(activeQ) + 1}` })}</h3>
              {activeQ.grade.aiNote && <p className="rounded bg-slate-50 p-2 text-xs text-slate-600"><b>AI：</b>{activeQ.grade.aiNote}</p>}
              <div className="flex flex-wrap gap-1" aria-label={t("gw.defects")}>
                {defects.map((d) => {
                  const on = marks[activeQ.id]?.tags?.includes(d);
                  return (
                    <button key={d} type="button" className={`badge cursor-pointer ${on ? "bg-rose-100 text-rose-800" : "hover:bg-slate-200"}`} aria-pressed={on}
                      onClick={() => set(activeQ.id, { tags: on ? marks[activeQ.id]!.tags!.filter((x) => x !== d) : [...(marks[activeQ.id]?.tags ?? []), d] })}>
                      {d}
                    </button>
                  );
                })}
              </div>
              <textarea className="input min-h-16 text-sm" value={marks[activeQ.id]?.note ?? ""} onChange={(e) => set(activeQ.id, { note: e.target.value })} placeholder={t("gw.qNote")} />
            </div>
          )}

          <div className="space-y-2 border-t border-slate-100 pt-3">
            <label className="block text-sm font-semibold" htmlFor="wb-comment">{t("gr.comment")}</label>
            <select className="input py-1 text-sm" value="" onChange={(e) => e.target.value && setComment((c) => (c ? `${c}\n` : "") + e.target.value)} aria-label={t("gw.templates")}>
              <option value="">{t("gw.templates")}</option>
              {templates.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <textarea id="wb-comment" className="input min-h-20 text-sm" value={comment} onChange={(e) => setComment(e.target.value)} data-testid="wb-comment" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button name="intent" value="accept" className="btn" data-testid="wb-accept">{t("gw.accept")}</button>
            <button name="intent" value="save" className="btn" data-testid="wb-save">{t("gw.saveDraft")}</button>
            <button name="intent" value="done" className="btn btn-primary col-span-2" data-testid="wb-done">{status === "done" ? t("gw.update") : t("gw.doneNext")}</button>
          </div>
        </form>
      </aside>
    </div>
  );
}
