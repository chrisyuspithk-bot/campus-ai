"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { Markdown } from "@/components/Markdown";
import { checkAnswer } from "@/lib/p4/answer";
import { redoAction } from "../actions";

type Item = { id: string; type: string; stem: string; options: string[]; answer: string; topic: string };
const LETTERS = "ABCDEF";

export function RedoClient({ items }: { items: Item[] }) {
  const { t } = useT();
  const [i, setI] = useState(0);
  const [given, setGiven] = useState("");
  const [result, setResult] = useState<boolean | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [right, setRight] = useState(0);
  const [, start] = useTransition();
  const done = i >= items.length;
  const q = items[i];

  function finish(ok: boolean) {
    setResult(ok);
    setRevealed(true);
    if (ok) setRight((n) => n + 1);
    start(() => redoAction(q.id, ok));
  }

  function check() {
    const ok = checkAnswer(q.type, q.answer, given);
    if (ok === null) setRevealed(true); // long answer: show reference, then self-assess
    else finish(ok);
  }

  function next() {
    setI(i + 1);
    setGiven("");
    setResult(null);
    setRevealed(false);
  }

  if (done) {
    return (
      <div className="card mx-auto max-w-xl space-y-4 p-8 text-center" data-testid="redo-done">
        <p className="text-3xl font-bold">{t("wb.redoResult", { k: right, n: items.length })}</p>
        <p className="text-slate-600">{t("wb.redoResultHint")}</p>
        <div className="flex justify-center gap-2">
          <Link href="/s/wrongbook" className="btn btn-primary">{t("wb.title")}</Link>
          <Link href="/s/progress" className="btn">{t("nav.progress")}</Link>
        </div>
      </div>
    );
  }

  const correctText = q.type === "mc" ? `${LETTERS[Number(q.answer)]}. ${q.options[Number(q.answer)] ?? ""}` : q.type === "short" ? q.answer.split("|")[0] : q.answer;

  return (
    <div className="card mx-auto max-w-2xl space-y-4 p-6" data-testid="redo-card">
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{i + 1} / {items.length}{q.topic && ` · ${q.topic}`}</span>
        <span>✓ {right}</span>
      </div>
      <div className="text-lg font-medium"><Markdown>{q.stem}</Markdown></div>
      {q.type === "mc" ? (
        <div className="space-y-2" role="radiogroup">
          {q.options.map((o, k) => {
            const isRight = revealed && String(k) === q.answer;
            const isWrong = revealed && String(k) === given && String(k) !== q.answer;
            return (
              <button key={k} role="radio" aria-checked={given === String(k)} disabled={revealed} onClick={() => setGiven(String(k))} data-testid={`redo-opt-${k}`}
                className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left text-sm ${isRight ? "border-teal-500 bg-teal-50" : isWrong ? "border-rose-400 bg-rose-50" : given === String(k) ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:bg-slate-50"}`}>
                <span className="font-semibold">{LETTERS[k]}.</span><span className="min-w-0 flex-1"><Markdown>{o}</Markdown></span>
              </button>
            );
          })}
        </div>
      ) : q.type === "short" ? (
        <input className="input" value={given} onChange={(e) => setGiven(e.target.value)} disabled={revealed} placeholder={t("wb.typeAnswer")} data-testid="redo-input" />
      ) : (
        <textarea className="input min-h-28" value={given} onChange={(e) => setGiven(e.target.value)} disabled={revealed} placeholder={t("wb.typeAnswer")} />
      )}

      {revealed && (
        <div className={`rounded-lg p-3 text-sm ${result === true ? "bg-emerald-50" : result === false ? "bg-rose-50" : "bg-slate-50"}`} data-testid="redo-feedback">
          {result === true && <p className="mb-1 flex items-center gap-1 font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" />{t("wb.correct")}</p>}
          {result === false && <p className="mb-1 flex items-center gap-1 font-medium text-rose-700"><XCircle className="h-4 w-4" />{t("wb.notYet")}</p>}
          <div className="text-xs text-slate-500">{t("rs.correct")}</div>
          <Markdown>{correctText}</Markdown>
        </div>
      )}

      <div className="flex justify-end gap-2">
        {!revealed ? (
          <button className="btn btn-primary" onClick={check} disabled={!given.trim() && q.type !== "long" && q.type !== "upload"} data-testid="redo-check">{t("wb.check")}</button>
        ) : result === null ? (
          <>
            <button className="btn" onClick={() => finish(false)}>{t("wb.selfNo")}</button>
            <button className="btn btn-primary" onClick={() => finish(true)}>{t("wb.selfYes")}</button>
          </>
        ) : (
          <button className="btn btn-primary" onClick={next} data-testid="redo-next">{i + 1 >= items.length ? t("wb.finish") : t("wb.next")}</button>
        )}
      </div>
    </div>
  );
}
