import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { FilePlus2, GraduationCap, MessageSquare, NotebookPen, Sparkles, Wand2 } from "lucide-react";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { featuresFor } from "@/lib/features";
import { listConversations } from "@/lib/conversations";
import { relativeTime } from "@/lib/format";
import { EmptyState, Page, SectionHeader } from "@/components/ui";
import type { DictKey } from "@/lib/i18n/dict";
import { createDraft } from "./drafts/actions";
import { listClassesFor } from "@/lib/p3/classes";
import { computeAlerts } from "@/lib/p3/alerts";
import { gradingQueue } from "@/lib/p4/grading";
import { classAverage } from "@/lib/p4/stats";

export const metadata: Metadata = { title: "主頁" };

export default async function TeacherHome() {
  const user = await requireUser(["teacher"]);
  const { t, lang } = await getT();
  const features = featuresFor("teacher");
  const drafts = db
    .select()
    .from(schema.drafts)
    .where(eq(schema.drafts.ownerId, user.id))
    .orderBy(desc(schema.drafts.updatedAt))
    .limit(5)
    .all()
    .filter((d) => d.status !== "archived");
  const chats = listConversations(user.id).filter((c) => !c.archived).slice(0, 5);
  const classes = listClassesFor(user.id);
  const alertCount = computeAlerts(user.id).length;
  const queue = gradingQueue(user);
  const toGrade = queue.filter((r) => r.state !== "done").length;
  const avgs = classes.map((c) => classAverage(c.id)).filter((x): x is number => x != null);
  const kpis: { label: string; value: string; href: string; testid: string }[] = [
    { label: t("th.toGrade"), value: String(toGrade), href: "/t/grading", testid: "kpi-grade" },
    { label: t("th.activeAssign"), value: String(classes.reduce((s, c) => s + c.activeCount, 0)), href: "/t/assignments", testid: "kpi-assign" },
    { label: t("th.missing"), value: String(classes.reduce((s, c) => s + c.missing, 0)), href: "/t/classes", testid: "kpi-missing" },
    { label: t("th.alerts"), value: String(alertCount), href: "/t/alerts", testid: "kpi-alerts" },
    { label: t("th.avg"), value: avgs.length ? `${Math.round(avgs.reduce((s, x) => s + x, 0) / avgs.length)}%` : "—", href: "/t/reports", testid: "kpi-avg" },
  ];

  return (
    <Page>
      <h1 className="page-title mb-6">{t("t.hello", { name: user.displayName })}</h1>

      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5" data-testid="teacher-kpis">
        {kpis.map((k) => (
          <Link key={k.testid} href={k.href} className="card p-4 hover:bg-slate-50" data-testid={k.testid}>
            <div className="text-xs text-slate-500">{k.label}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{k.value}</div>
          </Link>
        ))}
      </section>

      <section className="mb-8">
        <SectionHeader title={t("t.quick")} />
        <div className="flex flex-wrap gap-2">
          <form action={createDraft}>
            <button className="btn btn-primary"><FilePlus2 className="h-4 w-4" /> {t("t.newDraft")}</button>
          </form>
          {features.ai_chat && <Link href="/ai" className="btn"><Sparkles className="h-4 w-4" /> {t("t.openAi")}</Link>}
          <Link href="/t/tutors" className="btn"><GraduationCap className="h-4 w-4" /> {t("nav.tTutors")}</Link>
          {features.studio && <Link href="/t/studio" className="btn"><Wand2 className="h-4 w-4" /> {t("nav.tStudio")}</Link>}
          {features.essay && <Link href="/t/grading/essay" className="btn"><NotebookPen className="h-4 w-4" /> {t("nav.gradingEssay")}</Link>}
        </div>
      </section>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <section>
          <SectionHeader title={t("t.myDrafts")} href="/t/drafts" linkLabel={t("t.allDrafts")} />
          {drafts.length === 0 ? (
            <EmptyState>{t("t.noDrafts")}</EmptyState>
          ) : (
            <ul className="card divide-y divide-slate-100" data-testid="teacher-drafts">
              {drafts.map((d) => (
                <li key={d.id}>
                  <Link href={`/t/drafts/${d.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                    <NotebookPen className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                    <span className="flex-1 truncate">{d.subject ? `${d.subject}：` : ""}{d.title}</span>
                    <span className="badge">{t(`drafts.type.${d.type}` as DictKey)}</span>
                    <span className="shrink-0 text-xs text-slate-400">{relativeTime(d.updatedAt, lang)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <SectionHeader title={t("t.recentChats")} href="/ai" linkLabel={t("common.allArrow")} />
          {chats.length === 0 ? (
            <EmptyState>{t("chat.noHistory")}</EmptyState>
          ) : (
            <ul className="card divide-y divide-slate-100">
              {chats.map((c) => (
                <li key={c.id}>
                  <Link href={`/ai/c/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                    <span className="w-5 text-center" aria-hidden>{c.tutorEmoji ?? <MessageSquare className="inline h-4 w-4 text-slate-400" />}</span>
                    <span className="flex-1 truncate">{c.title}</span>
                    <span className="shrink-0 text-xs text-slate-400">{relativeTime(c.updatedAt, lang)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section>
        <SectionHeader title={t("t.later")} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/t/classes" className="card flex items-start gap-3 p-3 hover:bg-slate-50" data-testid="tile-classes">
            <span className="text-xl" aria-hidden>🏫</span>
            <div><div className="text-sm font-medium">{t("home.p3Classes")}</div><p className="mt-0.5 text-xs text-slate-500">{t("home.p3ClassesDesc", { n: classes.length, m: classes.reduce((s, c) => s + c.missing, 0) })}</p></div>
          </Link>
          <Link href="/t/grading" className="card flex items-start gap-3 p-3 hover:bg-slate-50" data-testid="tile-grading">
            <span className="text-xl" aria-hidden>✅</span>
            <div><div className="text-sm font-medium">{t("t.laterGrading")}</div><p className="mt-0.5 text-xs text-slate-500">{t("th.gradingDesc", { n: toGrade })}</p></div>
          </Link>
          <Link href="/t/alerts" className="card flex items-start gap-3 p-3 hover:bg-slate-50" data-testid="tile-alerts">
            <span className="text-xl" aria-hidden>🚩</span>
            <div><div className="text-sm font-medium">{t("home.p3Alerts")}</div><p className="mt-0.5 text-xs text-slate-500">{t("home.p3AlertsDesc", { n: alertCount })}</p></div>
          </Link>
          <Link href="/t/reports" className="card flex items-start gap-3 p-3 hover:bg-slate-50" data-testid="tile-reports">
            <span className="text-xl" aria-hidden>📊</span>
            <div><div className="text-sm font-medium">{t("nav.reports")}</div><p className="mt-0.5 text-xs text-slate-500">{t("th.reportsDesc")}</p></div>
          </Link>
        </div>
      </section>
    </Page>
  );
}
