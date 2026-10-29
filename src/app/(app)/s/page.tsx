import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Lock, MessageSquare } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { featuresFor } from "@/lib/features";
import { quotaStatus } from "@/lib/quota";
import { listTutorsWithFileCounts } from "@/lib/tutors";
import { listConversations } from "@/lib/conversations";
import { relativeTime } from "@/lib/format";
import { EmptyState, Page, SectionHeader } from "@/components/ui";
import { Onboarding } from "./Onboarding";
import { listStudentAssignments } from "@/lib/p3/exam";
import { formatDue } from "@/lib/p3/format";

export const metadata: Metadata = { title: "主頁" };

export default async function StudentHome() {
  const user = await requireUser(["student"]);
  const { t, lang } = await getT();
  const features = featuresFor("student");
  const quota = quotaStatus(user.id, user.role);
  const tutors = features.tutors ? listTutorsWithFileCounts().filter((x) => x.status === "published") : [];
  const recent = listConversations(user.id).filter((c) => !c.archived).slice(0, 5);
  const todo = listStudentAssignments(user.id)
    .filter((a) => a.state === "todo" || a.state === "in_progress")
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  const today = new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "zh-HK", { weekday: "long", month: "long", day: "numeric" }).format(new Date());

  return (
    <Page>
      <Onboarding show={recent.length === 0 && tutors.length > 0} />
      {quota.percent >= 80 && (
        <div role="status" className={`mb-4 rounded-xl px-4 py-3 text-sm ${quota.exhausted ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-900"}`}>
          {quota.exhausted ? t("chat.quotaExhausted") : t("chat.quotaLow", { pct: quota.percent })}
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="page-title">
            <Link href="/me" className="hover:underline">{t("s.hello", { name: user.displayName })}</Link>
          </h1>
          <p className="mt-1 text-slate-600">{t("s.subtitle")}</p>
        </div>
        <span className="text-sm text-slate-500">{t("common.today")} · {today}</span>
      </div>

      <section className="mb-8" aria-label={t("home.todo")}>
        <SectionHeader title={<span className="inline-flex items-center gap-2"><CalendarClock className="h-4 w-4 text-brand-600" aria-hidden />{t("home.todo")}</span>} href="/s/assignments" linkLabel={t("home.todoAll")} />
        {todo.length === 0 ? (
          <EmptyState>{t("home.todoEmpty")}</EmptyState>
        ) : (
          <ul className="card divide-y divide-slate-100" data-testid="home-todo">
            {todo.slice(0, 4).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/s/assignments/${a.id}`} className="font-medium hover:underline">{a.subject}：{a.title}</Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{formatDue(a.dueAt, lang)}</span>
                    {a.durationMin ? <span>{t("p3.minutes", { n: a.durationMin })}</span> : null}
                    {a.lockAi && <span className="badge bg-rose-50 text-rose-700"><Lock className="h-3 w-3" />{t("sa.examMode")}</span>}
                  </div>
                </div>
                <Link href={a.state === "in_progress" ? `/s/assignments/${a.id}/attempt` : `/s/assignments/${a.id}`} className="btn btn-primary btn-sm">
                  {a.state === "in_progress" ? t("sa.continue") : t("sa.start")}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-8">
        <SectionHeader title={t("s.tutors")} href={features.tutors ? "/s/tutors" : undefined} linkLabel={t("common.allArrow")} />
        {tutors.length === 0 ? (
          <EmptyState action={features.ai_chat ? <Link href="/ai" className="btn btn-primary">{t("nav.ai")}</Link> : null}>{t("s.noTutors")}</EmptyState>
        ) : (
          <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 max-sm:grid max-sm:grid-cols-2 max-sm:overflow-visible" data-testid="tutor-cards">
            {tutors.map((tu) => (
              <div key={tu.id} className="card flex w-40 shrink-0 snap-start flex-col p-4 max-sm:w-auto">
                <div className="text-3xl" aria-hidden>{tu.emoji}</div>
                <div className="mt-2 font-semibold">{lang === "en" && tu.nameEn ? tu.nameEn : tu.name}</div>
                <div className="mb-3 text-xs text-slate-500">{t("s.guided")} · {tu.tagline}</div>
                <Link href={`/ai?tutor=${tu.slug}`} className="btn btn-primary btn-sm mt-auto">{t("s.start")}</Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section>
          <SectionHeader title={t("s.recent")} href="/ai" linkLabel={t("common.allArrow")} />
          {recent.length === 0 ? (
            <EmptyState action={tutors[0] ? <Link href={`/ai?tutor=${tutors[0].slug}`} className="btn btn-primary">{t("s.onboardCta")}</Link> : null}>
              {t("s.recentEmpty")}
            </EmptyState>
          ) : (
            <ul className="card divide-y divide-slate-100">
              {recent.map((c) => (
                <li key={c.id}>
                  <Link href={`/ai/c/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                    <span className="w-6 text-center" aria-hidden>{c.tutorEmoji ?? <MessageSquare className="inline h-4 w-4 text-slate-400" />}</span>
                    <span className="flex-1 truncate">{c.title}</span>
                    <span className="shrink-0 text-xs text-slate-400">{relativeTime(c.updatedAt, lang)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <SectionHeader title={t("s.shortcuts")} />
          <div className="grid gap-2">
            {(
              [
                ["🧠", "nav.studio", "/s/studio"],
                ["✍️", "nav.essay", "/s/essay"],
                ["🎨", "nav.create", "/s/create"],
                ["📁", "nav.library", "/s/library"],
              ] as const
            ).map(([icon, key, href]) => (
              <Link key={key} href={href} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium transition hover:border-brand-300 hover:shadow">
                <span className="text-xl" aria-hidden>{icon}</span>
                {t(key)}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </Page>
  );
}
