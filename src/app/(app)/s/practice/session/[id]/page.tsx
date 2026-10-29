import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { activeLockedAttempt } from "@/lib/p3/exam";
import { sessionStats, view } from "@/lib/p6/adaptive";
import { ExamLocked } from "@/components/ExamLocked";
import { Page } from "@/components/ui";
import { LevelStars } from "@/components/p6/LevelStars";
import { AdaptiveRunner } from "./AdaptiveRunner";
import { startAdaptive } from "../../actions";

export const metadata: Metadata = { title: "自適應練習" };

export default async function SessionPage({ params }: PageProps<"/s/practice/session/[id]">) {
  const user = await requireUser(["student"]);
  const lock = activeLockedAttempt(user.id);
  if (lock) return <ExamLocked assignmentId={lock.assignment.id} />;
  const { t } = await getT();
  const { id } = await params;
  const s = db.select().from(schema.practiceSessions).where(and(eq(schema.practiceSessions.id, id), eq(schema.practiceSessions.studentId, user.id))).get();
  if (!s) notFound();
  const topicQ = `subject=${encodeURIComponent(s.subject)}&topic=${encodeURIComponent(s.topic)}`;
  const back = <Link href="/s/practice" className="text-sm text-brand-700 hover:underline">← {t("pr.title")}</Link>;

  if (s.status === "active" && s.currentQid) {
    const q = db.select().from(schema.questions).where(eq(schema.questions.id, s.currentQid)).get();
    if (q) {
      return (
        <Page>
          {back}
          <AdaptiveRunner id={s.id} subject={s.subject} topic={s.topic} target={s.target} answered={s.steps.length} level={s.level} question={view(q)} history={s.steps.map((x) => ({ level: x.level, correct: x.correct }))} />
        </Page>
      );
    }
  }

  const st = sessionStats(s);
  const qs = s.steps.length ? db.select().from(schema.questions).where(inArray(schema.questions.id, s.steps.map((x) => x.qid))).all() : [];
  const qMap = new Map(qs.map((q) => [q.id, q]));
  const videos = db.select({ id: schema.videos.id, title: schema.videos.title }).from(schema.videos).where(and(eq(schema.videos.status, "published"), eq(schema.videos.topic, s.topic))).limit(3).all();

  return (
    <Page>
      {back}
      <div className="card mt-3 p-6" data-testid="practice-summary">
        <h1 className="page-title">{t("p6.pr.summary")} · {s.subject} · {s.topic}</h1>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <Stat label={t("p6.pr.answered")} value={`${st.correct}/${st.answered}`} />
          <Stat label={t("p6.pr.accuracy")} value={`${st.accuracy}%`} />
          <Stat label={t("p6.pr.masteryLabel")} value={`${st.mastery}`} />
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">{t("p6.pr.levelPath")}</div><div className="mt-1 flex items-center gap-1 text-sm"><LevelStars level={s.startLevel} /> → <LevelStars level={s.level} /></div></div>
        </div>
        <ol className="mt-5 flex flex-wrap gap-1.5" aria-label={t("p6.pr.levelPath")}>
          {s.steps.map((x, i) => (
            <li key={i} className={`grid h-8 w-8 place-items-center rounded-md text-xs font-semibold ${x.correct ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`} title={qMap.get(x.qid)?.stem}>
              L{x.level}{x.correct ? "✓" : "✗"}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-slate-600">{st.mastery >= 70 ? t("p6.pr.tipHigh") : st.mastery >= 40 ? t("p6.pr.tipMid") : t("p6.pr.tipLow")}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <form action={startAdaptive}>
            <input type="hidden" name="subject" value={s.subject} />
            <input type="hidden" name="topic" value={s.topic} />
            <input type="hidden" name="fresh" value="1" />
            <button className="btn btn-primary">{t("p6.pr.again")}</button>
          </form>
          <Link href={`/s/practice/animate?${topicQ}`} className="btn">🎬 {t("p6.pr.animate")}</Link>
          {st.correct < st.answered && <Link href={`/s/wrongbook/redo?topic=${encodeURIComponent(s.topic)}`} className="btn">{t("p6.pr.redo")}</Link>}
          {videos.map((v) => <Link key={v.id} href={`/s/videos/${v.id}`} className="btn btn-ghost">▶ {v.title}</Link>)}
        </div>
      </div>
    </Page>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
