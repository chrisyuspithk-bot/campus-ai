import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { Lock } from "lucide-react";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dict";
import { listClassesFor } from "@/lib/p3/classes";
import { assignmentStats } from "@/lib/p3/exam";
import { formatDue } from "@/lib/p3/format";
import { EmptyState, Page, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "派發與監察" };

export default async function TeacherAssignments({ searchParams }: PageProps<"/t/assignments">) {
  const user = await requireUser(["teacher"]);
  const { t, lang } = await getT();
  const sp = await searchParams;
  const tab = sp.tab === "past" ? "past" : "active";
  const classes = listClassesFor(user.id);
  const byId = new Map(classes.map((c) => [c.id, c]));
  const all = classes.length
    ? db.select().from(schema.assignments).where(inArray(schema.assignments.classId, classes.map((c) => c.id))).orderBy(desc(schema.assignments.dueAt)).all()
    : [];
  // Teachers also see work they assigned to classes they no longer own.
  const own = db.select().from(schema.assignments).where(eq(schema.assignments.teacherId, user.id)).all().filter((a) => !byId.has(a.classId));
  const rows = [...all, ...own].filter((a) => {
    const active = a.status === "active" && a.dueAt.getTime() > Date.now();
    return tab === "active" ? active : !active;
  });
  if (tab === "active") rows.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());

  return (
    <Page wide>
      <PageHeader title={t("asg.title")} subtitle={t("asg.subtitle")} actions={<Link href="/t/assignments/new" className="btn btn-primary" data-testid="asg-new">{t("asg.new")}</Link>} />
      <nav className="mb-4 flex gap-1 border-b border-slate-200">
        {(["active", "past"] as const).map((k) => (
          <Link key={k} href={`/t/assignments?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === k ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500"}`}>
            {t(`asg.tab.${k}`)}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState action={<Link href="/t/assignments/new" className="btn btn-primary">{t("asg.new")}</Link>}>{t("asg.empty")}</EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base" data-testid="asg-table">
            <thead>
              <tr>
                <th>{t("asg.col.title")}</th><th>{t("asg.col.class")}</th><th>{t("asg.col.kind")}</th><th>{t("asg.col.due")}</th>
                <th>{t("asg.col.submitted")}</th><th>{t("asg.col.inProgress")}</th><th>{t("asg.col.lock")}</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const s = assignmentStats(a);
                const c = byId.get(a.classId);
                return (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="max-w-xs truncate font-medium"><Link href={`/t/assignments/${a.id}`} className="hover:underline">{a.title}</Link></td>
                    <td className="whitespace-nowrap">{c ? `${c.name} ${c.subject}` : "—"}</td>
                    <td>{t(`asg.kind.${a.kind}` as DictKey)}</td>
                    <td className="whitespace-nowrap text-slate-600">{formatDue(a.dueAt, lang)}</td>
                    <td>{s.submitted}/{s.members}</td>
                    <td>{s.inProgress || "—"}</td>
                    <td>{a.lockAi ? <Lock className="h-4 w-4 text-rose-500" aria-label="AI locked" /> : <span className="text-slate-300">—</span>}</td>
                    <td className="text-right"><Link href={`/t/assignments/${a.id}`} className="btn btn-sm">{t("asg.monitor")}</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}
