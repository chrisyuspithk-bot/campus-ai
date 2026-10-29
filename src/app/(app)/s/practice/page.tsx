import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { relativeTime } from "@/lib/format";
import { activeLockedAttempt } from "@/lib/p3/exam";
import { isUnlocked } from "@/lib/phase";
import { masteryOf, topicProgress } from "@/lib/p6/adaptive";
import { ExamLocked } from "@/components/ExamLocked";
import { SubmitButton } from "@/components/SubmitButton";
import { EmptyState, Page, PageHeader, SectionHeader } from "@/components/ui";
import { LevelStars } from "@/components/p6/LevelStars";
import { startAdaptive, startPractice } from "./actions";

export const metadata: Metadata = { title: "自主練習" };

export default async function PracticePage({ searchParams }: PageProps<"/s/practice">) {
  const user = await requireUser(["student"]);
  const lock = activeLockedAttempt(user.id);
  if (lock) return <ExamLocked assignmentId={lock.assignment.id} />;
  const { t, lang } = await getT();
  const sp = await searchParams;
  const q = schema.questions;
  const rows = db.select({ subject: q.subject, topic: q.topic }).from(q).where(and(eq(q.scope, "school"), eq(q.type, "mc"))).all();
  const groups = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const m = groups.get(r.subject) ?? new Map<string, number>();
    m.set(r.topic, (m.get(r.topic) ?? 0) + 1);
    groups.set(r.subject, m);
  }
  const progress = topicProgress(user.id);
  const recent = db.select().from(schema.practiceSessions).where(eq(schema.practiceSessions.studentId, user.id)).orderBy(desc(schema.practiceSessions.updatedAt)).limit(6).all();

  return (
    <Page>
      <PageHeader
        title={t("pr.title")}
        subtitle={t("p6.pr.subtitle")}
        actions={isUnlocked(7) ? <Link href="/s/practice/photo" className="btn btn-primary" data-testid="photo-practice-link">📷 {t("p7.photo.title")}</Link> : null}
      />
      {sp.none && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900">{t("pr.none")}</p>}
      <p className="mb-4 rounded-lg bg-brand-50 px-4 py-2 text-sm text-brand-900">🧠 {t("p6.pr.how")}</p>
      {groups.size === 0 ? (
        <EmptyState>{t("pr.none")}</EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2" data-testid="practice-topics">
          {[...groups].map(([subject, topics]) => (
            <div key={subject} className="card p-4">
              <h2 className="section-title mb-3">{subject}</h2>
              <ul className="space-y-3">
                {[...topics].map(([topic, n]) => {
                  const pg = progress.get(`${subject}|${topic}`);
                  return (
                    <li key={topic} className="rounded-lg border border-slate-100 p-3" data-testid="practice-topic">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="font-medium">{topic || "—"}</span>
                        <span className="text-xs text-slate-400">{t("pr.available", { n })}</span>
                        {pg && (
                          <span className="ml-auto flex items-center gap-1.5 text-xs text-slate-500">
                            <LevelStars level={pg.level} /> {t("p6.pr.mastery", { n: pg.mastery })}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <form action={startAdaptive}>
                          <input type="hidden" name="subject" value={subject} />
                          <input type="hidden" name="topic" value={topic} />
                          <SubmitButton className="btn btn-primary btn-sm">{pg?.activeId ? t("p6.pr.resume") : t("p6.pr.adaptive")}</SubmitButton>
                        </form>
                        <Link href={`/s/practice/animate?subject=${encodeURIComponent(subject)}&topic=${encodeURIComponent(topic)}`} className="btn btn-sm" data-testid="practice-animate">🎬 {t("p6.pr.animate")}</Link>
                        <form action={startPractice} className="ml-auto flex items-center gap-1">
                          <input type="hidden" name="subject" value={subject} />
                          <input type="hidden" name="topic" value={topic} />
                          <select name="count" defaultValue="5" className="input w-auto py-1 text-xs" aria-label={t("pr.count")}>{[3, 5, 10].map((c) => <option key={c}>{c}</option>)}</select>
                          <SubmitButton className="btn btn-sm btn-ghost">{t("p6.pr.quick")}</SubmitButton>
                        </form>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
      {recent.length > 0 && (
        <section className="mt-8">
          <SectionHeader title={t("p6.pr.recent")} />
          <ul className="card divide-y divide-slate-100 text-sm" data-testid="practice-recent">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                <Link href={`/s/practice/session/${r.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{r.subject} · {r.topic}</Link>
                <span className="text-xs text-slate-500">{t("p6.pr.progress", { n: r.steps.length, m: r.target })}</span>
                <LevelStars level={r.level} />
                <span className="badge">{r.status === "active" ? t("p6.pr.active") : t("p6.pr.mastery", { n: masteryOf(r.steps) })}</span>
                <span className="text-xs text-slate-400">{relativeTime(r.updatedAt, lang)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Page>
  );
}
