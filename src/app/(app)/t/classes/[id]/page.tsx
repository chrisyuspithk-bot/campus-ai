import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { Lock } from "lucide-react";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dict";
import { canManageClass, getClass, listMembers } from "@/lib/p3/classes";
import { assignmentStats } from "@/lib/p3/exam";
import { computeAlerts } from "@/lib/p3/alerts";
import { formatDue, pct } from "@/lib/p3/format";
import { formatNumber, relativeTime } from "@/lib/format";
import { lastNDays } from "@/lib/time";
import { EmptyState, Page, PageHeader, SectionHeader } from "@/components/ui";

export const metadata: Metadata = { title: "班級" };

export default async function ClassDetail({ params }: PageProps<"/t/classes/[id]">) {
  const user = await requireUser(["teacher"]);
  const { t, lang } = await getT();
  const { id } = await params;
  const c = getClass(id);
  if (!canManageClass(user, c)) notFound();
  const members = listMembers(c.id);
  const ids = members.map((m) => m.id);
  const week = lastNDays(7);
  const usage = ids.length ? db.select().from(schema.usage).where(and(inArray(schema.usage.userId, ids), gte(schema.usage.day, week[0]))).all() : [];
  const tokensBy = new Map<string, number>();
  for (const u of usage) tokensBy.set(u.userId, (tokensBy.get(u.userId) ?? 0) + u.tokens);
  const assignments = db.select().from(schema.assignments).where(eq(schema.assignments.classId, c.id)).orderBy(desc(schema.assignments.dueAt)).all();
  const atts = assignments.length
    ? db.select().from(schema.attempts).where(and(inArray(schema.attempts.assignmentId, assignments.map((a) => a.id)), eq(schema.attempts.status, "submitted"))).all()
    : [];
  const avgBy = new Map<string, number | null>();
  for (const m of ids) {
    const mine = atts.filter((a) => a.studentId === m && a.maxScore);
    avgBy.set(m, mine.length ? Math.round(mine.reduce((s, a) => s + (pct(a.score, a.maxScore) ?? 0), 0) / mine.length) : null);
  }
  const scored = [...avgBy.values()].filter((v): v is number => v !== null);
  const weekAgo = Date.now() - 7 * 86_400_000;
  const activeWeek = members.filter((m) => m.lastLoginAt && m.lastLoginAt.getTime() > weekAgo).length;
  const watched = new Set(computeAlerts(user.id).map((a) => a.studentId));

  return (
    <Page wide>
      <Link href="/t/classes" className="mb-3 inline-block text-sm text-slate-500 hover:underline">{t("p3.back")}</Link>
      <PageHeader
        title={<>{c.emoji} {c.name} {c.subject}</>}
        subtitle={t("cl.members", { n: members.length })}
        actions={<Link href={`/t/assignments/new?class=${c.id}`} className="btn btn-primary">{t("cl.newAssignment")}</Link>}
      />
      <section className="mb-6">
        <SectionHeader title={t("cl.summary")} />
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="card p-4"><div className="text-sm text-slate-500">{t("cl.activeWeek")}</div><div className="text-2xl font-bold">{activeWeek}/{members.length}</div></div>
          <div className="card p-4"><div className="text-sm text-slate-500">{t("cl.aiTokens")}</div><div className="text-2xl font-bold">{formatNumber(usage.reduce((s, u) => s + u.tokens, 0))}</div></div>
          <div className="card p-4"><div className="text-sm text-slate-500">{t("cl.avgAll")}</div><div className="text-2xl font-bold">{scored.length ? `${Math.round(scored.reduce((a, b) => a + b, 0) / scored.length)}%` : "—"}</div></div>
        </div>
      </section>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section>
          <SectionHeader title={t("cl.membersTable")} />
          <div className="card overflow-x-auto">
            <table className="table-base" data-testid="class-members">
              <thead>
                <tr><th>{t("cl.student")}</th><th>{t("cl.lastLogin")}</th><th>{t("cl.usage7d")}</th><th>{t("cl.avgScore")}</th><th /></tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} id={`s-${m.id}`} className="hover:bg-slate-50">
                    <td>
                      <span className="mr-2" aria-hidden>{m.avatar}</span>
                      <span className="font-medium">{m.displayName}</span> <span className="text-xs text-slate-400">{m.username}</span>
                      {watched.has(m.id) && <Link href="/t/alerts" className="badge ml-2 bg-amber-50 text-amber-800">{t("cl.watch")}</Link>}
                    </td>
                    <td className="whitespace-nowrap text-slate-500">{m.lastLoginAt ? relativeTime(m.lastLoginAt, lang) : t("cl.never")}</td>
                    <td>{formatNumber(tokensBy.get(m.id) ?? 0)}</td>
                    <td>{avgBy.get(m.id) != null ? `${avgBy.get(m.id)}%` : "—"}</td>
                    <td className="text-right">
                      <Link href={`/t/students/${m.id}`} className="text-xs font-medium text-brand-600 hover:underline">{t("sp.profile")} →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section>
          <SectionHeader title={t("cl.recent")} href="/t/assignments" linkLabel={t("common.allArrow")} />
          {assignments.length === 0 ? (
            <EmptyState>{t("cl.noRecent")}</EmptyState>
          ) : (
            <ul className="card divide-y divide-slate-100">
              {assignments.slice(0, 8).map((a) => {
                const s = assignmentStats(a);
                return (
                  <li key={a.id}>
                    <Link href={`/t/assignments/${a.id}`} className="block px-4 py-3 hover:bg-slate-50">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 truncate font-medium">{a.title}</span>
                        {a.lockAi && <Lock className="h-3.5 w-3.5 text-rose-500" aria-label={t("asg.col.lock")} />}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {t(`asg.kind.${a.kind}` as DictKey)} · {formatDue(a.dueAt, lang)} · {t("asg.col.submitted")} {s.submitted}/{s.members}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </Page>
  );
}
