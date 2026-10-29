import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { listStudentClasses } from "@/lib/p3/classes";
import { formatDue } from "@/lib/p3/format";
import { EmptyState, Page, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "我的班級" };

export default async function StudentClasses() {
  const user = await requireUser(["student"]);
  const { t, lang } = await getT();
  const classes = listStudentClasses(user.id);
  return (
    <Page>
      <PageHeader title={t("cl.title")} subtitle={t("cl.studentSubtitle")} actions={<Link href="/s/assignments" className="btn">{t("nav.assignments")} →</Link>} />
      {classes.length === 0 ? (
        <EmptyState>{t("cl.studentEmpty")}</EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2" data-testid="student-classes">
          {classes.map((c) => (
            <div key={c.id} className="card p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-2xl" aria-hidden>{c.emoji}</span>
                <div>
                  <div className="text-lg font-semibold">{c.name} {c.subject}</div>
                  <div className="text-sm text-slate-500">{t("cl.teacher")}：{c.teacher ? `${c.teacher.avatar} ${c.teacher.displayName}` : "—"} · {t("cl.members", { n: c.memberCount })}</div>
                </div>
              </div>
              <h3 className="mt-4 mb-1 text-xs font-semibold tracking-wide text-slate-400">{t("cl.recent")}</h3>
              {c.recent.length === 0 ? (
                <p className="text-sm text-slate-500">{t("cl.noRecent")}</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {c.recent.map((a) => (
                    <li key={a.id} className="flex gap-2">
                      <Link href={`/s/assignments/${a.id}`} className="flex-1 truncate hover:underline">{a.title}</Link>
                      <span className="shrink-0 text-xs text-slate-500">{formatDue(a.dueAt, lang)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}
