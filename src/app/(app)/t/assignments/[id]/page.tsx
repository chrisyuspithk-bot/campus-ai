import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown, Lock, RefreshCw } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dict";
import { canManageClass, getClass } from "@/lib/p3/classes";
import { assignmentStats, fileKey, getAssignment, getPaper, monitorRows, parseFileAnswer, UPLOAD_QID } from "@/lib/p3/exam";
import { formatDue } from "@/lib/p3/format";
import { relativeTime } from "@/lib/format";
import { withBase } from "@/lib/base-path";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { Page, PageHeader } from "@/components/ui";
import { deleteAssignment, setAssignmentStatus } from "../actions";

export const metadata: Metadata = { title: "監察" };

function mmss(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default async function MonitorPage({ params }: PageProps<"/t/assignments/[id]">) {
  const user = await requireUser(["teacher"]);
  const { t, lang } = await getT();
  const { id } = await params;
  const a = getAssignment(id);
  if (!a) notFound();
  const c = getClass(a.classId);
  if (!canManageClass(user, c)) notFound();
  const rows = monitorRows(a);
  const stats = assignmentStats(a);
  const paper = getPaper(a.paperId);
  const now = Date.now();

  return (
    <Page wide>
      <AutoRefresh seconds={10} />
      <Link href="/t/assignments" className="mb-3 inline-block text-sm text-slate-500 hover:underline">{t("p3.back")}</Link>
      <PageHeader
        title={t("asg.mon.title", { title: a.title })}
        subtitle={<>{c?.name} {c?.subject} · {t(`asg.kind.${a.kind}` as DictKey)} · {formatDue(a.dueAt, lang)} {paper && <>· <Link className="text-brand-600 hover:underline" href={`/t/papers/${paper.id}`}>{paper.title}</Link></>}</>}
        actions={
          <>
            <form action={setAssignmentStatus}>
              <input type="hidden" name="id" value={a.id} />
              <input type="hidden" name="status" value={a.status === "active" ? "closed" : "active"} />
              <button className="btn">{a.status === "active" ? t("asg.mon.close") : t("asg.mon.reopen")}</button>
            </form>
            <form action={deleteAssignment}>
              <input type="hidden" name="id" value={a.id} />
              <ConfirmSubmit message={t("asg.mon.confirmDelete")}>{t("asg.mon.delete")}</ConfirmSubmit>
            </form>
          </>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <div className="card p-4"><div className="text-sm text-slate-500">{t("asg.mon.submitted")}</div><div className="text-2xl font-bold" data-testid="mon-submitted">{stats.submitted}/{stats.members}</div></div>
        <div className="card p-4"><div className="text-sm text-slate-500">{t("asg.mon.inProgress")}</div><div className="text-2xl font-bold">{stats.inProgress}</div></div>
        <div className="card p-4"><div className="text-sm text-slate-500">{t("asg.mon.avg")}</div><div className="text-2xl font-bold">{stats.avg != null ? `${stats.avg}%` : "—"}</div></div>
        <div className="card flex flex-col justify-center gap-1 p-4 text-sm">
          <span className="flex items-center gap-1.5 text-slate-500"><RefreshCw className="h-3.5 w-3.5" /> {t("asg.mon.live")}</span>
          {a.lockAi && <span className="flex items-center gap-1.5 text-rose-600"><Lock className="h-3.5 w-3.5" /> {t("sa.examMode")}</span>}
          <span className="badge self-start">{t(`asg.status.${a.status}` as DictKey)}</span>
        </div>
      </div>
      {a.fileId && (
        <a className="btn mb-4" href={withBase(`/api/assignments/${a.id}/file`)} target="_blank" rel="noreferrer"><FileDown className="h-4 w-4" /> {t("asg.mon.file")}: {a.fileName}</a>
      )}
      <div className="card overflow-x-auto">
        <table className="table-base" data-testid="monitor-table">
          <thead>
            <tr>
              <th>{t("cl.student")}</th><th>{t("common.status")}</th><th>{t("asg.mon.answered")}</th><th>{t("asg.mon.remaining")}</th>
              <th title={t("asg.mon.blurNote")}>{t("asg.mon.blur")}</th><th>{t("asg.mon.score")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const att = r.attempt;
              const upload = att ? parseFileAnswer(att.answers[fileKey(UPLOAD_QID)]) : null;
              return (
                <tr key={r.id}>
                  <td><span className="mr-2" aria-hidden>{r.avatar}</span><span className="font-medium">{r.displayName}</span> <span className="text-xs text-slate-400">{r.username}</span></td>
                  <td>
                    {!att && <span className="badge">{t("asg.mon.notStarted")}</span>}
                    {att?.status === "in_progress" && <span className="badge bg-sky-50 text-sky-700">{t("asg.mon.inProgress")}</span>}
                    {att?.status === "submitted" && (
                      <span className="badge bg-emerald-50 text-emerald-700">
                        {t("asg.mon.submitted")} {att.submittedAt ? `· ${relativeTime(att.submittedAt, lang)}` : ""} {att.autoSubmitted ? `(${t("asg.mon.auto")})` : ""}
                      </span>
                    )}
                  </td>
                  <td>{att ? `${r.answered}/${r.total}` : "—"}</td>
                  <td className="font-mono tabular-nums">{att?.status === "in_progress" && r.deadline ? mmss(r.deadline - now) : "—"}</td>
                  <td className={att && att.blurCount > 2 ? "font-medium text-amber-700" : ""}>{att ? att.blurCount : "—"}</td>
                  <td>
                    {att?.status === "submitted" ? (
                      <span className="flex flex-wrap items-center gap-2">
                        {att.maxScore ? `${att.score ?? 0}/${att.maxScore}` : null}
                        {att.needsMarking && <span className="badge bg-amber-50 text-amber-800">{t("asg.mon.pending")}</span>}
                        {upload && <a className="btn btn-sm" href={withBase(`/api/assignments/${a.id}/file?item=${upload.id}`)} target="_blank" rel="noreferrer">{upload.name}</a>}
                      </span>
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">{t("asg.mon.blurNote")}</p>
    </Page>
  );
}
