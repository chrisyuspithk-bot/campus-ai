"use client";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { api } from "@/lib/p2-client";
import { relativeTime } from "@/lib/format";
import type { Quiz } from "@/lib/studio/types";
import { Markdown } from "@/components/Markdown";

const LETTERS = "ABCDE";

export function QuizView({ id, initial, wrongbook = false }: { id: string; initial: Quiz; wrongbook?: boolean }) {
  const { t, lang } = useT();
  const qs = initial.questions;
  const [i, setI] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);
  const [attempts, setAttempts] = useState(initial.attempts ?? []);
  const [wrong, setWrong] = useState<Record<number, number>>({});
  const [saved, setSaved] = useState<number | null>(null);
  const done = i >= qs.length;

  function check() {
    if (choice === null) return;
    setChecked(true);
    if (choice === qs[i].answer) setScore((s) => s + 1);
    else setWrong((w) => ({ ...w, [i]: choice }));
  }

  function next() {
    const last = i + 1 >= qs.length;
    if (last) {
      void api(`/api/studio/${id}`, { attempt: { score, total: qs.length } }, "PATCH");
      setAttempts((a) => [...a, { score, total: qs.length, at: Date.now() }]);
    }
    setI(i + 1);
    setChoice(null);
    setChecked(false);
  }

  function retry() {
    setI(0);
    setScore(0);
    setWrong({});
    setSaved(null);
    setChoice(null);
    setChecked(false);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">{t("st.qz.note")}</p>
      {done ? (
        <div className="card space-y-4 p-8 text-center" data-testid="quiz-result">
          <p className="text-3xl font-bold">{t("st.qz.result", { score, total: qs.length })}</p>
          <div className="flex justify-center gap-2">
            <button className="btn btn-primary" onClick={retry}>{t("st.qz.retry")}</button>
            {wrongbook && Object.keys(wrong).length > 0 && (
              <button
                className="btn"
                disabled={saved !== null}
                data-testid="quiz-wrongbook"
                onClick={async () => {
                  const r = await api<{ added: number }>("/api/wrongbook", { libraryId: id, wrong: Object.keys(wrong).map(Number), picks: wrong });
                  setSaved(r.ok ? r.data.added : 0);
                }}
              >
                {saved !== null ? `✓ ${saved}` : t("st.qz.wrongbook")}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="card space-y-4 p-6">
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>{t("st.qz.q", { n: i + 1 })} / {qs.length}</span>
            <span>✓ {score}</span>
          </div>
          <div className="text-lg font-medium"><Markdown>{qs[i].q}</Markdown></div>
          <div className="space-y-2" role="radiogroup">
            {qs[i].options.map((o, k) => {
              const right = checked && k === qs[i].answer;
              const wrong = checked && k === choice && k !== qs[i].answer;
              return (
                <button
                  key={k}
                  role="radio"
                  aria-checked={choice === k}
                  disabled={checked}
                  onClick={() => setChoice(k)}
                  className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left text-sm transition ${
                    right ? "border-teal-500 bg-teal-50" : wrong ? "border-rose-400 bg-rose-50" : choice === k ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:bg-slate-50"
                  }`}
                  data-testid={`quiz-opt-${k}`}
                >
                  <span className="font-semibold">{LETTERS[k]}.</span>
                  <span className="min-w-0 flex-1"><Markdown>{o}</Markdown></span>
                </button>
              );
            })}
          </div>
          {checked && (
            <div className={`rounded-lg p-3 text-sm ${choice === qs[i].answer ? "bg-teal-50 text-teal-800" : "bg-amber-50 text-amber-900"}`} role="status">
              <p className="font-semibold">{choice === qs[i].answer ? t("st.qz.correct") : t("st.qz.wrong", { a: LETTERS[qs[i].answer] })}</p>
              {qs[i].explain && <p className="mt-1">{qs[i].explain}</p>}
            </div>
          )}
          <div className="flex justify-end">
            {checked ? (
              <button className="btn btn-primary" onClick={next} data-testid="quiz-next">{i + 1 >= qs.length ? t("st.qz.finish") : t("st.qz.next")}</button>
            ) : (
              <button className="btn btn-primary" onClick={check} disabled={choice === null} data-testid="quiz-check">{t("st.qz.check")}</button>
            )}
          </div>
        </div>
      )}
      {attempts.length > 0 && (
        <div className="text-sm text-slate-500">
          {t("st.qz.history")}: {attempts.slice(-5).reverse().map((a) => `${a.score}/${a.total} (${relativeTime(a.at, lang)})`).join(" · ")}
        </div>
      )}
    </div>
  );
}
