import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { BookMarked, Flame, MessageSquare, Target, Trophy } from "lucide-react";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { activeDays, aiLiteracy, avgScore, dailyActivity, LITERACY_DIMS, streakOf, topicStats, weeklyChats, weeklyPractice } from "@/lib/p4/stats";
import { listWrong } from "@/lib/p4/wrongbook";
import { Radar } from "@/components/charts/Radar";
import { HBars } from "@/components/charts/HBars";
import { UsageBars } from "@/app/(app)/a/models/UsageBars";
import { Page, PageHeader, SectionHeader } from "@/components/ui";

export const metadata: Metadata = { title: "我的進度" };

export default async function ProgressPage() {
  const user = await requireUser(["student"]);
  const { t } = await getT();
  const streak = streakOf(activeDays(user.id));
  const chats = weeklyChats(user.id);
  const practice = weeklyPractice(user.id);
  const avg = avgScore(user.id);
  const wrongOpen = listWrong(user.id).filter((w) => !w.mastered);
  const topics = topicStats(user.id);
  const lit = aiLiteracy(user.id);
  const activity = dailyActivity(user.id, 7);

  const weakest = [...topics].filter((x) => x.pct < 80).sort((a, b) => a.pct - b.pct)[0];
  const strongest = [...topics].sort((a, b) => b.pct - a.pct)[0];
  const tutor = weakest
    ? db.select().from(schema.tutors).where(and(eq(schema.tutors.subject, weakest.subject), eq(schema.tutors.status, "published"))).get()
    : undefined;
  const lowDim = LITERACY_DIMS.reduce((lo, d) => (lit[d] < lit[lo] ? d : lo), LITERACY_DIMS[0]);
  const recs: { href: string; label: string; desc: string; testid: string }[] = [];
  if (weakest) recs.push({ href: "/s/practice", label: t("pg.rec.practice", { topic: weakest.topic }), desc: t("pg.rec.practiceDesc", { pct: weakest.pct }), testid: "rec-practice" });
  if (wrongOpen.length) recs.push({ href: weakest && wrongOpen.some((w) => w.topic === weakest.topic) ? `/s/wrongbook/redo?topic=${encodeURIComponent(weakest.topic)}` : "/s/wrongbook/redo", label: t("pg.rec.redo", { n: wrongOpen.length }), desc: t("pg.rec.redoDesc"), testid: "rec-redo" });
  if (tutor) recs.push({ href: `/ai?tutor=${tutor.slug}`, label: t("pg.rec.tutor", { name: tutor.name }), desc: t("pg.rec.tutorDesc", { topic: weakest!.topic }), testid: "rec-tutor" });
  recs.push({ href: "/s/tutors", label: t(`pg.litTip.${lowDim}`), desc: t("pg.rec.litDesc", { dim: t(`lit.${lowDim}`) }), testid: "rec-lit" });

  const kpis = [
    { icon: Flame, label: t("pg.streak"), value: t("pg.days", { n: streak }), testid: "kpi-streak" },
    { icon: MessageSquare, label: t("pg.weekChats"), value: String(chats), testid: "kpi-chats" },
    { icon: Target, label: t("pg.weekPractice"), value: String(practice), testid: "kpi-practice" },
    { icon: Trophy, label: t("pg.avg"), value: avg != null ? `${avg}%` : "—", testid: "kpi-avg" },
    { icon: BookMarked, label: t("pg.wrongOpen"), value: String(wrongOpen.length), testid: "kpi-wrong" },
  ];

  return (
    <Page>
      <PageHeader title={t("pg.title")} subtitle={t("pg.subtitle")} actions={<Link href="/s/progress/gaps" className="btn btn-sm" data-testid="progress-gaps-link">{t("gp.open")}</Link>} />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5" data-testid="progress-kpis">
        {kpis.map((k) => (
          <div key={k.label} className="card p-4" data-testid={k.testid}>
            <div className="flex items-center gap-1.5 text-xs text-slate-500"><k.icon className="h-3.5 w-3.5" aria-hidden />{k.label}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{k.value}</div>
          </div>
        ))}
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <SectionHeader title={t("pg.topics")} />
          {topics.length >= 3 ? (
            <Radar data={topics.map((x) => ({ label: x.topic, value: x.pct }))} label={t("pg.topics")} tableLabel={t("pg.table")} />
          ) : topics.length ? (
            <HBars data={topics.map((x) => ({ label: x.topic, value: x.pct }))} suffix="%" />
          ) : (
            <p className="text-sm text-slate-500">{t("pg.noScores")}</p>
          )}
          {strongest && weakest && (
            <p className="mt-2 text-sm text-slate-600">{t("pg.strongWeak", { s: strongest.topic, w: weakest.topic })}</p>
          )}
        </section>
        <section className="card p-5">
          <SectionHeader title={t("pg.literacy")} />
          <Radar data={LITERACY_DIMS.map((d) => ({ label: t(`lit.${d}`), value: lit[d] }))} label={t("pg.literacy")} tableLabel={t("pg.table")} />
          <p className="mt-2 text-xs text-slate-400">{t("pg.literacyNote")}</p>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section className="card p-5">
          <SectionHeader title={t("pg.activity")} />
          <UsageBars data={activity} label={t("pg.activity")} />
        </section>
        <section>
          <SectionHeader title={t("pg.recs")} />
          <ul className="space-y-2" data-testid="progress-recs">
            {recs.map((r) => (
              <li key={r.testid}>
                <Link href={r.href} className="card block p-3 hover:bg-slate-50" data-testid={r.testid}>
                  <div className="text-sm font-medium text-brand-700">{r.label} →</div>
                  <p className="mt-0.5 text-xs text-slate-500">{r.desc}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Page>
  );
}
