import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { NotebookPen } from "lucide-react";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { relativeTime } from "@/lib/format";
import { withBase } from "@/lib/base-path";
import { featuresFor } from "@/lib/features";
import { gradingQueue } from "@/lib/p4/grading";
import { scannedKeys } from "@/lib/p5/scan";
import { EmptyState, Page, PageHeader } from "@/components/ui";
import type { GradeStatus } from "@/lib/db/schema";

export const metadata: Metadata = { title: "批改隊列" };

const STATES: GradeStatus[] = ["pending", "in_progress", "done"];

export default async function GradingQueue({ searchParams }: PageProps<"/t/grading">) {
  const user = await requireUser(["teacher", "admin"]);
  const { t, lang } = await getT();
  const sp = await searchParams;
  const state: GradeStatus = STATES.includes(sp.state as GradeStatus) ? (sp.state as GradeStatus) : "pending";
  const assignment = typeof sp.assignment === "string" ? sp.assignment : undefined;
  const all = gradingQueue(user, assignment);
  const rows = all.filter((r) => r.state === state);
  const scanned = scannedKeys([...new Set(rows.map((r) => r.assignmentId))]);
  const counts = Object.fromEntries(STATES.map((s) => [s, all.filter((r) => r.state === s).length])) as Record<GradeStatus, number>;
  const assignments = [...new Map(gradingQueue(user).map((r) => [r.assignmentId, `${r.className} · ${r.assignmentTitle}`]))];
  const essays = featuresFor("teacher").essay ? db.select({ id: schema.essays.id }).from(schema.essays).where(eq(schema.essays.status, "submitted")).all().length : null;
  const qs = (s: GradeStatus) => `/t/grading?state=${s}${assignment ? `&assignment=${assignment}` : ""}`;
  const firstPending = all.find((r) => r.state === "pending") ?? all.find((r) => r.state === "in_progress");

  return (
    <Page wide>
      <PageHeader
        title={t("gq.title")}
        subtitle={t("gq.subtitle")}
        actions={
          <>
            {firstPending && <Link href={`/t/grading/${firstPending.attemptId}`} className="btn btn-primary" data-testid="grading-start">{t("gq.start")}</Link>}
            {essays !== null && (
              <Link href="/t/grading/essay" className="btn" data-testid="grading-essay-link"><NotebookPen className="h-4 w-4" /> {t("gq.essays", { n: essays })}</Link>
            )}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1" data-testid="grading-tabs">
          {STATES.map((s) => (
            <Link key={s} href={qs(s)} className={`rounded-md px-3 py-1.5 text-sm font-medium ${state === s ? "bg-white shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
              {t(`gq.state.${s}`)} <span className="tabular-nums text-slate-500">{counts[s]}</span>
            </Link>
          ))}
        </div>
        <form className="ml-auto flex items-center gap-2" action={withBase("/t/grading")}>
          <input type="hidden" name="state" value={state} />
          <select name="assignment" defaultValue={assignment ?? ""} className="input w-auto py-1.5 text-sm" aria-label={t("gq.filter")}>
            <option value="">{t("gq.allAssignments")}</option>
            {assignments.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <button className="btn btn-sm">{t("gq.apply")}</button>
        </form>
      </div>
      {rows.length === 0 ? (
        <EmptyState>{t(`gq.empty.${state}`)}</EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base" data-testid="grading-queue-table">
            <thead>
              <tr><th>{t("cl.student")}</th><th>{t("gq.assignment")}</th><th>{t("gq.submitted")}</th><th>{t("gq.ai")}</th><th>{t("gq.final")}</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.attemptId} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap"><span className="mr-2" aria-hidden>{r.student.avatar}</span><span className="font-medium">{r.student.displayName}</span> <span className="text-xs text-slate-400">{r.student.username}</span></td>
                  <td><span className="text-slate-500">{r.className} · </span>{r.assignmentTitle}{scanned.has(`${r.assignmentId}|${r.student.id}`) && <span className="badge ml-2 bg-violet-50 text-violet-800" data-testid="hw-badge">{t("hw.badge")}</span>}</td>
                  <td className="whitespace-nowrap text-slate-500">{r.submittedAt ? relativeTime(r.submittedAt, lang) : "—"}</td>
                  <td className="tabular-nums">{r.aiPct != null ? `${r.aiPct}%` : "—"}</td>
                  <td className="tabular-nums">{r.scorePct != null ? `${r.scorePct}%` : "—"}{r.auto && <span className="badge ml-2">{t("gq.auto")}</span>}</td>
                  <td className="text-right"><Link href={`/t/grading/${r.attemptId}`} className="btn btn-sm" data-testid="grading-open">{t("gq.open")}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}
