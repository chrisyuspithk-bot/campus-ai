import type { Metadata } from "next";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { formatNumber } from "@/lib/format";
import { lastNDays } from "@/lib/time";
import { listClassesFor, memberIds } from "@/lib/p3/classes";
import { aiLiteracy, avgScore, classAverage, LITERACY_DIMS, WEEK } from "@/lib/p4/stats";
import { HBars } from "@/components/charts/HBars";
import { UsageBars } from "../models/UsageBars";
import { Page, PageHeader, SectionHeader } from "@/components/ui";

export const metadata: Metadata = { title: "全校分析" };

export default async function AnalyticsPage() {
  await requireUser(["admin"]);
  const { t } = await getT();
  const days = lastNDays(14);
  const week = WEEK();
  const students = db.select().from(schema.users).where(eq(schema.users.role, "student")).all();
  const ids = students.map((s) => s.id);
  const usage = db.select().from(schema.usage).where(inArray(schema.usage.day, days)).all();
  const byDay = days.map((day) => ({ day, tokens: usage.filter((u) => u.day === day).reduce((s, u) => s + u.tokens, 0) }));
  const last7 = new Set(days.slice(-7));
  const studentSet = new Set(ids);
  const active7 = new Set(usage.filter((u) => last7.has(u.day) && u.requests > 0 && studentSet.has(u.userId)).map((u) => u.userId)).size;
  const tokens7 = usage.filter((u) => last7.has(u.day)).reduce((s, u) => s + u.tokens, 0);
  const msgs7 = db.select({ id: schema.messages.id }).from(schema.messages).where(and(eq(schema.messages.role, "user"), gte(schema.messages.createdAt, week))).all().length;
  const avgs = ids.map(avgScore).filter((x): x is number => x != null);
  const schoolAvg = avgs.length ? Math.round(avgs.reduce((s, x) => s + x, 0) / avgs.length) : null;
  const graded = db.select({ id: schema.grades.attemptId }).from(schema.grades).where(eq(schema.grades.status, "done")).all().length;
  const pending = db.select({ id: schema.attempts.id }).from(schema.attempts).where(and(eq(schema.attempts.status, "submitted"), eq(schema.attempts.needsMarking, true))).all().length;
  const wrong = db.select().from(schema.wrongItems).all();
  const mastered = wrong.filter((w) => w.mastered).length;

  const litById = new Map(students.map((s) => [s.id, aiLiteracy(s.id)]));
  const lit = [...litById.values()];
  const litAvg = LITERACY_DIMS.map((d) => ({ label: t(`lit.${d}`), value: lit.length ? Math.round(lit.reduce((s, x) => s + x[d], 0) / lit.length) : null }));
  const classes = listClassesFor(null).map((c) => {
    const m = memberIds(c.id);
    const tok = usage.filter((u) => last7.has(u.day) && m.includes(u.userId)).reduce((s, u) => s + u.tokens, 0);
    const ls = m.map((id) => litById.get(id)).filter((x) => x !== undefined);
    const litDims = Object.fromEntries(LITERACY_DIMS.map((d) => [d, ls.length ? Math.round(ls.reduce((s, x) => s + x[d], 0) / ls.length) : null]));
    return { ...c, avg: classAverage(c.id), tokens: tok, litDims };
  });
  const byGroup = [...new Set(students.map((s) => s.group ?? "—"))].sort().map((g) => {
    const list = students.filter((s) => (s.group ?? "—") === g);
    const a = list.map((s) => avgScore(s.id)).filter((x): x is number => x != null);
    return { label: g, value: a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : null, hint: `${g}: ${list.length}` };
  });

  const kpis: [string, string, string][] = [
    [t("an.active7"), `${active7}/${students.length}`, "kpi-active"],
    [t("an.msgs7"), formatNumber(msgs7), "kpi-msgs"],
    [t("an.tokens7"), formatNumber(tokens7), "kpi-tokens"],
    [t("an.schoolAvg"), schoolAvg != null ? `${schoolAvg}%` : "—", "kpi-avg"],
    [t("an.graded"), `${graded} · ${t("an.pending", { n: pending })}`, "kpi-graded"],
    [t("an.wrong"), `${wrong.length} · ${t("an.mastered", { n: mastered })}`, "kpi-wrong"],
  ];

  return (
    <Page wide>
      <PageHeader title={t("an.title")} subtitle={t("an.subtitle")} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-testid="analytics-kpis">
        {kpis.map(([k, v, id]) => (
          <div key={k} className="card p-4" data-testid={id}><div className="text-xs text-slate-500">{k}</div><div className="mt-1 text-xl font-bold tabular-nums">{v}</div></div>
        ))}
      </div>
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <SectionHeader title={t("an.usage14")} />
          <UsageBars data={byDay} label={t("an.usage14")} />
        </section>
        <section className="card p-5">
          <SectionHeader title={t("an.literacy")} />
          <HBars data={litAvg} />
          <p className="mt-3 text-xs text-slate-400">{t("pg.literacyNote")}</p>
        </section>
      </div>
      <section className="mb-6">
        <SectionHeader title={t("p7.lit.classReport")} />
        <div className="card overflow-x-auto">
          <table className="table-base" data-testid="analytics-literacy-classes">
            <thead><tr><th>{t("an.class")}</th>{LITERACY_DIMS.map((d) => <th key={d}>{t(`lit.${d}`)}</th>)}</tr></thead>
            <tbody>
              {classes.filter((c) => c.memberCount > 0).map((c) => (
                <tr key={c.id}>
                  <td>{c.emoji} {c.name} {c.subject}</td>
                  {LITERACY_DIMS.map((d) => <td key={d} className="tabular-nums">{c.litDims[d] ?? "—"}</td>)}
                </tr>
              ))}
              <tr className="font-semibold">
                <td>{t("p7.lit.school")}</td>
                {litAvg.map((x, i) => <td key={i} className="tabular-nums">{x.value ?? "—"}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-400">{t("p7.lit.method")}</p>
      </section>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section>
          <SectionHeader title={t("an.classes")} />
          <div className="card overflow-x-auto">
            <table className="table-base" data-testid="analytics-classes">
              <thead><tr><th>{t("an.class")}</th><th>{t("rp.members")}</th><th>{t("rp.classAvg")}</th><th>{t("an.tokens7")}</th><th>{t("cl.missing", { n: "" })}</th></tr></thead>
              <tbody>
                {classes.map((c) => (
                  <tr key={c.id}>
                    <td>{c.emoji} {c.name} {c.subject}</td>
                    <td className="tabular-nums">{c.memberCount}</td>
                    <td className="tabular-nums">{c.avg != null ? `${c.avg}%` : "—"}</td>
                    <td className="tabular-nums">{formatNumber(c.tokens)}</td>
                    <td className="tabular-nums">{c.missing}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="card p-5">
          <SectionHeader title={t("an.byGroup")} />
          <HBars data={byGroup} suffix="%" />
        </section>
      </div>
    </Page>
  );
}
