"use client";
import { useT } from "@/lib/i18n/client";
import { RUBRIC, totalScore } from "@/lib/essay";
import type { DictKey } from "@/lib/i18n/dict";
import type { EssayFeedback } from "@/lib/db/schema";

/** Fixed-structure rubric result: grade, four 1–5 scores, summary, highlights, guided improvements. */
export function FeedbackCard({ feedback }: { feedback: EssayFeedback }) {
  const { t } = useT();
  return (
    <div className="space-y-3" data-testid="essay-feedback">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-slate-500">{t("es.overall")}</span>
        <span className="text-3xl font-bold text-brand-700">{feedback.grade}</span>
      </div>
      <dl className="grid grid-cols-4 gap-2 text-center">
        {RUBRIC.map((k) => (
          <div key={k} className="rounded-lg bg-slate-50 p-2">
            <dt className="text-xs text-slate-500">{t(`es.r.${k}` as DictKey)}</dt>
            <dd className="text-lg font-semibold">{feedback.scores[k]}</dd>
          </div>
        ))}
      </dl>
      <p className="text-right text-xs text-slate-500">{totalScore(feedback.scores)}/20</p>
      {feedback.summary && <p className="text-sm text-slate-700">{feedback.summary}</p>}
      {feedback.highlights.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-teal-700">✓ {t("es.highlights")}</h4>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{feedback.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>
        </div>
      )}
      {feedback.improvements.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-amber-700">→ {t("es.improvements")}</h4>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{feedback.improvements.map((h, i) => <li key={i}>{h}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
