import { BookmarkPlus, CheckCircle2, Clock, XCircle } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { withBase } from "@/lib/base-path";
import type { DictKey } from "@/lib/i18n/dict";
import { fileKey, parseFileAnswer, type Assignment, type Attempt } from "@/lib/p3/exam";
import type { GradeQuestion, studentMarks } from "@/lib/p4/grading";
import { addWrongFromResult } from "@/app/(app)/s/wrongbook/actions";

const LETTERS = "ABCDEF";
type T = (key: DictKey, vars?: Record<string, string | number>) => string;

/** Highlights teacher annotations (first occurrence of each quote) in a long answer. */
function Annotated({ text, anns }: { text: string; anns: ReturnType<typeof studentMarks>["marks"][string]["annotations"] }) {
  const hits = anns.map((a, i) => ({ a, i, at: text.indexOf(a.quote) })).filter((h) => h.a.quote && h.at >= 0).sort((x, y) => x.at - y.at);
  const out: React.ReactNode[] = [];
  let pos = 0;
  for (const h of hits) {
    if (h.at < pos) continue;
    out.push(text.slice(pos, h.at));
    out.push(<mark key={h.i} className={`rounded px-0.5 ${h.a.kind === "good" ? "bg-emerald-100" : "bg-rose-100"}`} title={h.a.note}>{h.a.quote}<sup className="ml-0.5 text-[10px] text-slate-500">{h.i + 1}</sup></mark>);
    pos = h.at + h.a.quote.length;
  }
  out.push(text.slice(pos));
  return <div className="whitespace-pre-wrap">{out}</div>;
}

/** The student's script: answers, marks, teacher notes and annotations. Used by /result and /script. */
export function ScriptList({ a, att, qs, marks, t, inBook, canAdd }: {
  a: Assignment;
  att: Attempt;
  qs: GradeQuestion[];
  marks: ReturnType<typeof studentMarks>["marks"];
  t: T;
  inBook: Set<string>;
  canAdd: boolean;
}) {
  const show = (q: GradeQuestion, v: string | undefined) => (!v?.trim() ? t("rs.blank") : q.type === "mc" ? `${LETTERS[Number(v)] ?? "?"}. ${q.options[Number(v)] ?? ""}` : v);
  return (
    <ol className="space-y-4" data-testid="script-list">
      {qs.map((q, n) => {
        const m = marks[q.id];
        const f = parseFileAnswer(att.answers[fileKey(q.id)]);
        const state = m?.score == null ? "manual" : m.score >= q.marks ? "right" : "wrong";
        const given = att.answers[q.id];
        return (
          <li key={q.id} className="card p-5">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">{q.id === "_upload" ? t("gw.homework") : t("ex.q", { n: n + 1 })}</span>
              {q.topic && <span className="badge">{q.topic}</span>}
              <span className="text-slate-500">{m?.score != null ? `${m.score}/${q.marks}` : t("p3.marks", { n: q.marks })}</span>
              <span className="ml-auto flex items-center gap-2">
                {state === "right" && <span className="badge bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-3 w-3" />{t("rs.right")}</span>}
                {state === "wrong" && <span className="badge bg-rose-50 text-rose-700"><XCircle className="h-3 w-3" />{t("rs.wrong")}</span>}
                {state === "manual" && <span className="badge bg-amber-50 text-amber-800"><Clock className="h-3 w-3" />{t("rs.manual")}</span>}
                {state === "wrong" && q.id !== "_upload" && (inBook.has(q.id) ? (
                  <span className="badge bg-brand-50 text-brand-700">{t("rs2.inBook")}</span>
                ) : canAdd ? (
                  <form action={addWrongFromResult}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="qid" value={q.id} />
                    <button className="btn btn-sm"><BookmarkPlus className="h-3.5 w-3.5" />{t("rs2.addOne")}</button>
                  </form>
                ) : null)}
              </span>
            </div>
            <Markdown>{q.stem}</Markdown>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="mb-1 text-xs text-slate-500">{t("rs.your")}</div>
                {(q.type === "long" || q.type === "upload") && given?.trim() ? <Annotated text={given} anns={m?.annotations ?? []} /> : <Markdown>{show(q, given)}</Markdown>}
                {f && <a className="btn btn-sm mt-2" href={withBase(`/api/assignments/${a.id}/file?item=${f.id}`)} target="_blank" rel="noreferrer">{f.name}</a>}
              </div>
              {(q.type === "mc" || q.type === "short") ? (
                <div className="rounded-lg bg-emerald-50 p-3">
                  <div className="mb-1 text-xs text-emerald-700">{t("rs.correct")}</div>
                  <Markdown>{q.type === "mc" ? show(q, q.answer) : q.answer.split("|")[0]}</Markdown>
                </div>
              ) : m?.score != null && q.answer ? (
                <div className="rounded-lg bg-emerald-50 p-3">
                  <div className="mb-1 text-xs text-emerald-700">{t("rs2.reference")}</div>
                  <Markdown>{q.answer}</Markdown>
                </div>
              ) : null}
            </div>
            {m?.steps?.length ? (
              <div className="mt-3 rounded-lg border border-slate-200 p-3 text-sm" data-testid="result-steps">
                <div className="mb-1 text-xs font-medium text-slate-600">{t("p7.steps.title")}</div>
                <ol className="space-y-1">
                  {m.steps.map((st, i) => (
                    <li key={i} className={`flex items-start gap-2 rounded px-2 py-1 text-xs ${st.marksAwarded >= st.marksMax ? "bg-emerald-50" : st.marksAwarded === 0 ? "bg-rose-50" : "bg-amber-50"}`}>
                      {st.marksAwarded >= st.marksMax ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />}
                      <span className="flex-1">{st.label}{st.note && <span className="text-slate-500"> — {st.note}</span>}</span>
                      <span className="tabular-nums font-medium">{st.marksAwarded}/{st.marksMax}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            {(m?.note || m?.tags.length || m?.annotations.length) ? (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm" data-testid="teacher-note">
                <div className="mb-1 text-xs font-medium text-amber-800">{t("rs2.teacherNote")}</div>
                {m.tags.length > 0 && <div className="mb-1 flex flex-wrap gap-1">{m.tags.map((x) => <span key={x} className="badge bg-rose-50 text-rose-700">{x}</span>)}</div>}
                {m.note && <p className="whitespace-pre-wrap">{m.note}</p>}
                {m.annotations.length > 0 && (
                  <ol className="mt-1 space-y-0.5 text-xs text-slate-700">
                    {m.annotations.map((x, i) => <li key={i}>{i + 1}. 「{x.quote}」{x.note && ` — ${x.note}`}</li>)}
                  </ol>
                )}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
