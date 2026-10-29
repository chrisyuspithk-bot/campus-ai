"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Lightbulb } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import type { DictKey } from "@/lib/i18n/dict";
import type { QuestionView } from "@/lib/p6/adaptive";
import { Markdown } from "@/components/Markdown";
import { LevelStars } from "@/components/p6/LevelStars";
import { answerAdaptive, askConcept, endAdaptive, type AnswerResult } from "../../actions";

type Props = { id: string; subject: string; topic: string; target: number; answered: number; level: number; question: QuestionView; history: { level: number; correct: boolean }[] };

export function AdaptiveRunner(p: Props) {
  const { t } = useT();
  const router = useRouter();
  const [q, setQ] = useState(p.question);
  const [level, setLevel] = useState(p.level);
  const [answered, setAnswered] = useState(p.answered);
  const [history, setHistory] = useState(p.history);
  const [choice, setChoice] = useState<number | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [ask, setAsk] = useState("");
  const [hinted, setHinted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [asking, startAsk] = useTransition();

  function submit() {
    if (choice === null || pending) return;
    setError(null);
    start(async () => {
      const r = await answerAdaptive(p.id, q.id, choice, hinted);
      if (r.error) return setError(r.error);
      setResult(r);
      setHistory((h) => [...h, { level, correct: !!r.correct }]);
      setAnswered(r.answered ?? answered + 1);
    });
  }

  function next() {
    if (!result) return;
    if (result.done || !result.next) return router.refresh();
    setQ(result.next);
    setLevel(result.level ?? level);
    setChoice(null);
    setResult(null);
    setHint(null);
    setHinted(false);
    setAsk("");
  }

  function askAi(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startAsk(async () => {
      const r = await askConcept(p.id, q.id, ask);
      if (r.error) return setError(r.error);
      setHint(r.hint ?? "");
      setHinted(true);
    });
  }

  const errKey = (e: string): DictKey => (["exam_locked", "quota", "blocked", "no_model"].includes(e) ? (`p6.err.${e}` as DictKey) : "p6.err.generic");

  return (
    <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_18rem]">
      <section className="card p-5" data-testid="adaptive-runner">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">{p.subject} · {p.topic}</span>
          <span className="badge" data-testid="adaptive-level">{t("p6.pr.level")} <LevelStars level={level} /></span>
          <span className="ml-auto text-slate-500">{t("p6.pr.progress", { n: answered + (result ? 0 : 1), m: p.target })}</span>
        </div>
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-brand-500 transition-all" style={{ width: `${(answered / p.target) * 100}%` }} /></div>
        <div className="mb-4 text-base"><Markdown>{q.stem}</Markdown></div>
        <div className="space-y-2" role="radiogroup">
          {q.options.map((o, i) => {
            const state = result ? (i === result.answer ? "right" : i === choice ? "wrong" : "") : "";
            return (
              <button
                key={i}
                role="radio"
                aria-checked={choice === i}
                disabled={!!result}
                onClick={() => setChoice(i)}
                data-testid={`adaptive-opt-${i}`}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${
                  state === "right" ? "border-emerald-400 bg-emerald-50" : state === "wrong" ? "border-rose-400 bg-rose-50" : choice === i ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-brand-300"
                }`}
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold">{"ABCD"[i]}</span>
                <span className="flex-1"><Markdown>{o}</Markdown></span>
              </button>
            );
          })}
        </div>
        {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{t(errKey(error))}</p>}
        {result ? (
          <div className={`mt-4 rounded-lg p-3 text-sm ${result.correct ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`} data-testid="adaptive-feedback">
            <div className="flex flex-wrap items-center gap-2 font-semibold">
              {result.correct ? `✓ ${t("p6.pr.correct")}` : `✗ ${t("p6.pr.wrong", { a: "ABCD"[result.answer ?? 0] })}`}
              {result.change === "up" && <span className="badge bg-amber-100 text-amber-800"><ArrowUp className="h-3 w-3" /> {t("p6.pr.up")}</span>}
              {result.change === "down" && <span className="badge bg-slate-100 text-slate-700"><ArrowDown className="h-3 w-3" /> {t("p6.pr.down")}</span>}
            </div>
            {!result.correct && <ul className="mt-2 list-disc pl-5">{result.explain?.map((e, i) => <li key={i}>{e}</li>)}</ul>}
            {!result.correct && <p className="mt-1 text-xs opacity-80">{t("p6.pr.toWrongbook")}</p>}
            <button className="btn btn-primary mt-3" onClick={next} data-testid="adaptive-next">{result.done ? t("p6.pr.finish") : t("p6.pr.nextQ")}</button>
          </div>
        ) : (
          <div className="mt-4 flex gap-2">
            <button className="btn btn-primary" disabled={choice === null || pending} onClick={submit} data-testid="adaptive-submit">{pending ? t("p2.working") : t("p6.pr.check")}</button>
            <button className="btn btn-ghost ml-auto text-slate-500" onClick={() => start(() => endAdaptive(p.id))}>{t("p6.pr.end")}</button>
          </div>
        )}
      </section>
      <aside className="space-y-4">
        <div className="card p-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Lightbulb className="h-4 w-4 text-amber-500" /> {t("p6.pr.askAi")}</h2>
          <p className="mb-2 text-xs text-slate-500">{t("p6.pr.askAiHint")}</p>
          <form onSubmit={askAi} className="space-y-2">
            <input className="input text-sm" value={ask} onChange={(e) => setAsk(e.target.value)} placeholder={t("p6.pr.askPh")} data-testid="adaptive-ask" />
            <button className="btn btn-sm w-full" disabled={asking || !!result}>{asking ? t("p2.working") : t("p6.pr.askGo")}</button>
          </form>
          {hint && <div className="mt-3 max-h-72 overflow-y-auto rounded-lg bg-amber-50 p-3 text-sm" data-testid="adaptive-hint"><Markdown>{hint}</Markdown></div>}
        </div>
        <div className="card p-4 text-sm">
          <h2 className="mb-2 font-semibold">{t("p6.pr.levelPath")}</h2>
          <div className="flex flex-wrap gap-1">
            {history.map((h, i) => <span key={i} className={`rounded px-1.5 py-0.5 text-xs font-semibold ${h.correct ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>L{h.level}</span>)}
            {!history.length && <span className="text-xs text-slate-400">—</span>}
          </div>
          <Link href={`/s/practice/animate?subject=${encodeURIComponent(p.subject)}&topic=${encodeURIComponent(p.topic)}`} className="btn btn-sm mt-3 w-full">🎬 {t("p6.pr.animate")}</Link>
        </div>
      </aside>
    </div>
  );
}
