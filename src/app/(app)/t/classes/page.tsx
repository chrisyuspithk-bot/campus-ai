import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { listClassesFor } from "@/lib/p3/classes";
import { EmptyState, Page, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "我的班級" };

export default async function TeacherClasses() {
  const user = await requireUser(["teacher"]);
  const { t } = await getT();
  const classes = listClassesFor(user.id);
  return (
    <Page>
      <PageHeader title={t("cl.title")} subtitle={t("cl.subtitle")} actions={<Link href="/t/assignments/new" className="btn btn-primary">{t("cl.newAssignment")}</Link>} />
      {classes.length === 0 ? (
        <EmptyState>{t("cl.empty")}</EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="class-cards">
          {classes.map((c) => (
            <div key={c.id} className="card flex flex-col p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-2xl" aria-hidden>{c.emoji}</span>
                <div>
                  <div className="text-lg font-semibold">{c.name} {c.subject}</div>
                  <div className="text-sm text-slate-500">{t("cl.members", { n: c.memberCount })}</div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="badge bg-brand-50 text-brand-700">{t("cl.activeQuiz", { n: c.activeCount })}</span>
                {c.inProgress > 0 && <span className="badge bg-sky-50 text-sky-700">{t("cl.inProgress", { n: c.inProgress })}</span>}
                <span className={`badge ${c.missing ? "bg-amber-50 text-amber-800" : ""}`}>{t("cl.missing", { n: c.missing })}</span>
              </div>
              <Link href={`/t/classes/${c.id}`} className="btn mt-4 self-start">{t("cl.enter")}</Link>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}
