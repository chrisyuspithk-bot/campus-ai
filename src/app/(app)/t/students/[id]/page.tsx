import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { formatNumber, relativeTime } from "@/lib/format";
import { listStudentClasses } from "@/lib/p3/classes";
import { pct } from "@/lib/p3/format";
import { getGrade } from "@/lib/p4/grading";
import { activeDays, aiLiteracy, avgScore, LITERACY_DIMS, streakOf, tokens7d, topicStats, weeklyChats } from "@/lib/p4/stats";
import { listWrong } from "@/lib/p4/wrongbook";
import { HBars } from "@/components/charts/HBars";
import { Radar } from "@/components/charts/Radar";
import { EmptyState, Page, PageHeader, SectionHeader } from "@/components/ui";

export const metadata: Metadata = { title: "學生概覽" };

export default async function StudentOverview({ params }: PageProps<"/t/students/[id]">) {
  const user = await requireUser(["teacher", "admin"]);
  const { t, lang } = await getT();
  const { id } = await params;
  const s = db.select().from(schema.users).where(eq(schema.users.id, id)).get();
  if (!s || s.role !== "student") notFound();
  const classes = listStudentClasses(s.id);
  const mine = user.role === "admin" ? classes : classes.filter((c) => c.teacherId === user.id);
  if (!mine.length) notFound();

  const topics = topicStats(s.id);
  const lit = aiLiteracy(s.id);
  const wrong = listWrong(s.id).filter((w) => !w.mastered);
  const kpis: [string, string][] = [
    [t("pg.streak"), t("pg.days", { n: streakOf(activeDays(s.id)) })],
    [t("pg.avg"), avgScore(s.id) != null ? `${avgScore(s.id)}%` : "—"],
    [t("pg.weekChats"), String(weeklyChats(s.id))],
    [t("cl.usage7d"), formatNumber(tokens7d([s.id]).get(s.id) ?? 0)],
    [t("pg.wrongOpen"), String(wrong.length)],
  ];
  const classIds = mine.map((c) => c.id);
  const history = db
    .select({ a: schema.assignments, att: schema.attempts })
    .from(schema.attempts)
    .innerJoin(schema.assignments, eq(schema.assignments.id, schema.attempts.assignmentId))
    .where(inArray(schema.assignments.classId, classIds))
    .orderBy(desc(schema.attempts.startedAt))
    .all()
    .filter((r) => r.att.studentId === s.id);
  const wrongTopics = [...wrong.reduce((m, w) => m.set(w.topic || "—", (m.get(w.topic || "—") ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);

  return (
    <Page>
      <PageHeader
        title={<><span className="mr-2" aria-hidden>{s.avatar}</span>{s.displayName} <span className="text-base font-normal text-slate-400">{s.username}</span></>}
        subtitle={`${mine.map((c) => `${c.name} ${c.subject}`).join("、")} · ${t("cl.lastLogin")} ${s.lastLoginAt ? relativeTime(s.lastLoginAt, lang) : t("cl.never")}`}
        actions={<Link href={`/t/classes/${mine[0].id}`} className="btn">{t("sp.toClass")}</Link>}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5" data-testid="student-kpis">
        {kpis.map(([k, v]) => (
          <div key={k} className="card p-4"><div className="text-xs text-slate-500">{k}</div><div className="mt-1 text-xl font-bold tabular-nums">{v}</div></div>
        ))}
      </div>
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <SectionHeader title={t("pg.topics")} />
          {topics.length ? <HBars data={topics.map((x) => ({ label: x.topic, value: x.pct }))} suffix="%" /> : <p className="text-sm text-slate-500">{t("pg.noScores")}</p>}
          {wrongTopics.length > 0 && <p className="mt-3 text-xs text-slate-500">{t("sp.wrongTopics")}: {wrongTopics.map(([k, n]) => `${k} ×${n}`).join("、")}</p>}
        </section>
        <section className="card p-5">
          <SectionHeader title={t("pg.literacy")} />
          <Radar data={LITERACY_DIMS.map((d) => ({ label: t(`lit.${d}`), value: lit[d] }))} label={t("pg.literacy")} tableLabel={t("pg.table")} />
        </section>
      </div>
      <SectionHeader title={t("sp.history")} />
      {history.length === 0 ? (
        <EmptyState>{t("sp.noHistory")}</EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base" data-testid="student-history">
            <thead><tr><th>{t("gq.assignment")}</th><th>{t("gq.submitted")}</th><th>{t("gq.final")}</th><th /></tr></thead>
            <tbody>
              {history.map(({ a, att }) => {
                const g = getGrade(att.id);
                const state = att.status !== "submitted" ? "in_attempt" : g?.status ?? (att.needsMarking ? "pending" : "done");
                return (
                  <tr key={att.id}>
                    <td>{a.title}</td>
                    <td className="text-slate-500">{att.submittedAt ? relativeTime(att.submittedAt, lang) : t("sp.inAttempt")}</td>
                    <td className="tabular-nums">{state === "done" ? `${att.score ?? 0}/${att.maxScore ?? 0} (${pct(att.score, att.maxScore) ?? "—"}%)` : state === "in_attempt" ? "—" : t(`gq.state.${state as "pending" | "in_progress"}`)}</td>
                    <td className="text-right">{att.status === "submitted" && <Link href={`/t/grading/${att.id}`} className="btn btn-sm">{t("gq.open")}</Link>}</td>
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
