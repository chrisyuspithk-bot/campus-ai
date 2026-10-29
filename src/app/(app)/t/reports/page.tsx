import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { relativeTime, formatNumber } from "@/lib/format";
import { withBase } from "@/lib/base-path";
import { listClassesFor } from "@/lib/p3/classes";
import { classAssignments, classReport } from "@/lib/p4/stats";
import { EmptyState, Page, PageHeader } from "@/components/ui";
import { PrintPdf } from "./PrintPdf";

export const metadata: Metadata = { title: "報告匯出" };

export default async function ReportsPage({ searchParams }: PageProps<"/t/reports">) {
  const user = await requireUser(["teacher", "admin"]);
  const { t, lang } = await getT();
  const sp = await searchParams;
  const classes = listClassesFor(user.role === "admin" ? null : user.id);
  const sel = classes.find((c) => c.id === sp.class) ?? classes[0];
  const rows = sel ? classReport(sel.id) : [];
  const assignments = sel ? classAssignments(sel.id) : [];
  const avgs = rows.map((r) => r.avg).filter((x): x is number => x != null);
  const classAvg = avgs.length ? Math.round(avgs.reduce((s, x) => s + x, 0) / avgs.length) : null;
  const submittedRate = rows.length && assignments.length ? Math.round((rows.reduce((s, r) => s + r.submitted, 0) / (rows.length * assignments.length)) * 100) : null;

  return (
    <Page wide>
      <PageHeader
        title={t("rp.title")}
        subtitle={t("rp.subtitle")}
        actions={
          sel ? (
            <span className="flex gap-2 print:hidden">
              <a href={withBase(`/api/reports/class/${sel.id}`)} className="btn btn-primary" data-testid="report-csv"><Download className="h-4 w-4" /> {t("rp.csv")}</a>
              <PrintPdf label={t("rp.pdf")} />
            </span>
          ) : null
        }
      />
      {classes.length === 0 ? (
        <EmptyState>{t("cl.empty")}</EmptyState>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2 print:hidden" data-testid="report-classes">
            {classes.map((c) => (
              <Link key={c.id} href={`/t/reports?class=${c.id}`} className={`btn btn-sm ${c.id === sel?.id ? "btn-primary" : ""}`}>{c.emoji} {c.name} {c.subject}</Link>
            ))}
          </div>
          {sel && (
            <>
              <h2 className="mb-3 text-lg font-semibold">{sel.emoji} {sel.name} {sel.subject} · {t("rp.classReport")}</h2>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  [t("rp.members"), String(rows.length)],
                  [t("rp.assignments"), String(assignments.length)],
                  [t("rp.classAvg"), classAvg != null ? `${classAvg}%` : "—"],
                  [t("rp.submitRate"), submittedRate != null ? `${submittedRate}%` : "—"],
                ].map(([k, v]) => (
                  <div key={k} className="card p-4"><div className="text-xs text-slate-500">{k}</div><div className="mt-1 text-2xl font-bold tabular-nums">{v}</div></div>
                ))}
              </div>
              <div className="card overflow-x-auto">
                <table className="table-base" data-testid="report-table">
                  <thead>
                    <tr>
                      <th>{t("cl.student")}</th>
                      {assignments.map((a) => <th key={a.id} className="whitespace-nowrap">{a.title}</th>)}
                      <th>{t("rp.avg")}</th><th>{t("rp.streak")}</th><th>{t("rp.chats")}</th><th>{t("cl.usage7d")}</th><th>{t("rp.wrong")}</th><th>{t("cl.lastLogin")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap"><Link href={`/t/students/${r.id}`} className="font-medium hover:underline">{r.displayName}</Link> <span className="text-xs text-slate-400">{r.username}</span></td>
                        {assignments.map((a) => {
                          const v = r.scores[a.id];
                          return <td key={a.id} className={`tabular-nums ${v === "missed" ? "text-rose-600" : v === "pending" ? "text-amber-700" : ""}`}>{v === "missed" ? t("rp.missed") : v === "pending" ? t("rp.pending") : v || "—"}</td>;
                        })}
                        <td className="tabular-nums font-medium">{r.avg != null ? `${r.avg}%` : "—"}</td>
                        <td className="tabular-nums">{r.streak}</td>
                        <td className="tabular-nums">{r.chats7d}</td>
                        <td className="tabular-nums">{formatNumber(r.tokens7d)}</td>
                        <td className="tabular-nums">{r.wrongOpen}</td>
                        <td className="whitespace-nowrap text-slate-500">{r.lastLoginAt ? relativeTime(r.lastLoginAt, lang) : t("cl.never")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </Page>
  );
}
