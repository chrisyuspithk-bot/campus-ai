import type { Metadata } from "next";
import Link from "next/link";
import { BookMarked, MessageSquare, Target } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { activeLockedAttempt } from "@/lib/p3/exam";
import { conceptGaps } from "@/lib/p5/gaps";
import { ExamLocked } from "@/components/ExamLocked";
import { EmptyState, Page, PageHeader } from "@/components/ui";
import { startPractice } from "../../practice/actions";

export const metadata: Metadata = { title: "概念缺口" };

const LEVEL = { high: "border-l-rose-500", medium: "border-l-amber-400", low: "border-l-slate-300" } as const;
const LEVEL_BADGE = { high: "bg-rose-50 text-rose-700", medium: "bg-amber-50 text-amber-800", low: "bg-slate-100 text-slate-600" } as const;

export default async function GapsPage() {
  const user = await requireUser(["student"]);
  const { t } = await getT();
  const lock = activeLockedAttempt(user.id);
  if (lock) return <ExamLocked assignmentId={lock.assignment.id} />;
  const gaps = conceptGaps(user.id);
  const kpis = [
    { label: t("gp.kpiTopics"), value: gaps.filter((g) => g.level !== "low").length },
    { label: t("gp.kpiTags"), value: gaps.reduce((s, g) => s + g.tags.reduce((x, y) => x + y.n, 0), 0) },
    { label: t("gp.kpiWrong"), value: gaps.reduce((s, g) => s + g.wrongOpen, 0) },
  ];

  return (
    <Page>
      <Link href="/s/progress" className="mb-2 inline-block text-sm text-slate-500 hover:underline">{t("gp.backProgress")}</Link>
      <PageHeader title={t("gp.title")} subtitle={t("gp.subtitle")} />
      <div className="mb-6 grid grid-cols-3 gap-3" data-testid="gaps-kpis">
        {kpis.map((k) => (
          <div key={k.label} className="card p-4">
            <div className="text-xs text-slate-500">{k.label}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{k.value}</div>
          </div>
        ))}
      </div>
      {gaps.length === 0 ? (
        <EmptyState>{t("gp.empty")}</EmptyState>
      ) : (
        <ul className="space-y-3" data-testid="gaps-list">
          {gaps.map((g) => (
            <li key={`${g.subject}|${g.topic}`} className={`card border-l-4 p-4 ${LEVEL[g.level]}`} data-testid="gap-item">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">{g.topic}</h2>
                <span className="text-sm text-slate-500">{g.subject}</span>
                <span className={`badge ${LEVEL_BADGE[g.level]}`}>{t(`gp.level.${g.level}`)}</span>
                <span className="ml-auto flex flex-wrap gap-3 text-xs text-slate-500">
                  {g.pct != null && <span>{t("gp.pct", { pct: g.pct })}</span>}
                  {g.lostMarks > 0 && <span>{t("gp.lost", { n: g.lostMarks })}</span>}
                  {g.wrongOpen > 0 && <span className="text-rose-700">{t("gp.wrong", { n: g.wrongOpen })}</span>}
                  {g.wrongMastered > 0 && <span className="text-emerald-700">{t("gp.mastered", { n: g.wrongMastered })}</span>}
                </span>
              </div>
              {g.pct != null && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                  <div className={`h-full ${g.pct < 50 ? "bg-rose-500" : g.pct < 75 ? "bg-amber-400" : "bg-emerald-500"}`} style={{ width: `${g.pct}%` }} />
                </div>
              )}
              {g.tags.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1 text-xs text-slate-500">{t("gp.tags")}</div>
                  <div className="flex flex-wrap gap-1">
                    {g.tags.map((x) => <span key={x.tag} className="badge bg-rose-50 text-rose-800">{x.tag}{x.n > 1 && ` ×${x.n}`}</span>)}
                  </div>
                </div>
              )}
              {g.evidence.length > 0 && (
                <details className="mt-2 text-xs text-slate-600">
                  <summary className="cursor-pointer text-slate-500">{t("gp.evidence")} ({g.evidence.length})</summary>
                  <ul className="mt-1 space-y-0.5">
                    {g.evidence.map((e, i) => (
                      <li key={i}><Link href={`/s/assignments/${e.assignmentId}/result`} className="hover:underline">{t("gp.evQ", { title: e.assignmentTitle, q: e.q, lost: e.lost, marks: e.marks })}</Link>{e.tags.length > 0 && <span className="text-slate-400"> · {e.tags.join("、")}</span>}</li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {g.practice > 0 ? (
                  <form action={startPractice}>
                    <input type="hidden" name="subject" value={g.subject} />
                    <input type="hidden" name="topic" value={g.topic} />
                    <input type="hidden" name="count" value="5" />
                    <button className="btn btn-sm btn-primary" data-testid="gap-practice"><Target className="h-4 w-4" />{t("gp.practice")}</button>
                  </form>
                ) : (
                  <Link href="/s/practice" className="btn btn-sm" data-testid="gap-practice"><Target className="h-4 w-4" />{t("gp.practice")}</Link>
                )}
                {g.wrongOpen > 0 && <Link href={`/s/wrongbook/redo?topic=${encodeURIComponent(g.topic)}`} className="btn btn-sm" data-testid="gap-redo"><BookMarked className="h-4 w-4" />{t("gp.redo")}</Link>}
                {g.tutorSlug && <Link href={`/ai?tutor=${g.tutorSlug}`} className="btn btn-sm" data-testid="gap-tutor"><MessageSquare className="h-4 w-4" />{t("gp.tutor")}</Link>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
