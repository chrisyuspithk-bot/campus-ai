import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { PenLine, Trash2 } from "lucide-react";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { withBase } from "@/lib/base-path";
import { batchAssignment, batchPages, batchRoster, canManageBatch, getBatch, linkableAssignments, summarize } from "@/lib/p5/scan";
import { Page } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { deleteBatchAction, enqueueOcrAction, finishUploadAction, linkAssignmentAction, orderFillAction } from "../actions";
import { StatusChip } from "../StatusChip";
import { Uploader } from "./Uploader";
import { OcrProgress } from "./OcrProgress";
import { MatchBoard } from "./MatchBoard";

export const metadata: Metadata = { title: "掃描批次" };

export default async function ScanBatchPage({ params, searchParams }: PageProps<"/t/scan/[batchId]">) {
  const user = await requireUser(["teacher", "admin"]);
  const { t } = await getT();
  const { batchId } = await params;
  const sp = await searchParams;
  const b = getBatch(batchId);
  if (!canManageBatch(user, b)) notFound();
  const pages = batchPages(b.id);
  const s = summarize(b, pages);
  const a = batchAssignment(b);
  const roster = batchRoster(b);
  const linkable = linkableAssignments(user);
  const matchedPages = pages.filter((p) => p.studentId);
  const ocrDone = matchedPages.filter((p) => p.ocrDone).length;
  const locked = b.status === "ocr";

  // Ready: the attempts created from this batch, for the 手寫批改 links.
  const studentIds = [...new Set(matchedPages.map((p) => p.studentId!))];
  const attempts = a && studentIds.length && b.status === "ready"
    ? db.select({ id: schema.attempts.id, studentId: schema.attempts.studentId }).from(schema.attempts).where(and(eq(schema.attempts.assignmentId, a.id), inArray(schema.attempts.studentId, studentIds), eq(schema.attempts.status, "submitted"))).all()
    : [];
  const grades = attempts.length ? new Map(db.select().from(schema.grades).where(inArray(schema.grades.attemptId, attempts.map((x) => x.id))).all().map((g) => [g.attemptId, g.status])) : new Map();

  return (
    <Page wide>
      <Link href="/t/scan" className="mb-2 inline-block text-sm text-slate-500 hover:underline">{t("sc.back")}</Link>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="page-title text-xl" data-testid="scan-batch-title">{b.title}</h1>
        <StatusChip status={b.status} matched={s.matched} pages={s.pages} t={t} />
        <span className="text-sm text-slate-500">{t("sc.pages", { n: s.pages })} · {t("sc.students", { n: s.students })}</span>
        <form action={deleteBatchAction} className="ml-auto">
          <input type="hidden" name="batchId" value={b.id} />
          <ConfirmSubmit className="btn btn-ghost btn-sm text-rose-700" message={`${t("common.delete")}「${b.title}」?`}><Trash2 className="h-4 w-4" />{t("common.delete")}</ConfirmSubmit>
        </form>
      </div>
      {sp.saved && <p className="mb-3 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{t("sc.saved")}</p>}
      {typeof sp.order === "string" && <p className="mb-3 rounded-lg bg-sky-50 px-4 py-2 text-sm text-sky-800">{t("sc.byOrderDone", { n: sp.order })}</p>}

      <form action={linkAssignmentAction} className="card mb-4 flex flex-wrap items-end gap-3 p-3 text-sm">
        <input type="hidden" name="batchId" value={b.id} />
        <label className="min-w-64 flex-1">
          <span className="mb-1 block text-xs font-medium text-slate-500">{t("sc.assignment")}</span>
          <select name="assignmentId" defaultValue={b.assignmentId ?? ""} className="input py-1" disabled={locked}>
            <option value="">{t("sc.noAssignment")}</option>
            {linkable.map((x) => <option key={x.id} value={x.id}>{x.title} · {x.className} {x.subject}</option>)}
          </select>
        </label>
        <label className="w-28">
          <span className="mb-1 block text-xs font-medium text-slate-500">{t("sc.pps")}</span>
          <input name="pagesPerStudent" type="number" min={1} max={8} defaultValue={b.pagesPerStudent} className="input py-1" disabled={locked} />
        </label>
        {!locked && <SubmitButton className="btn btn-sm">{t("sc.save")}</SubmitButton>}
      </form>

      {!locked && <div className="mb-4"><Uploader batchId={b.id} /></div>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {b.status === "uploading" && pages.length > 0 && (
          <form action={finishUploadAction}><input type="hidden" name="batchId" value={b.id} /><SubmitButton className="btn btn-primary btn-sm">{t("sc.finishUpload")}</SubmitButton></form>
        )}
        {!locked && s.failed > 0 && (
          <form action={orderFillAction}><input type="hidden" name="batchId" value={b.id} /><SubmitButton className="btn btn-sm">{t("sc.byOrder")}</SubmitButton></form>
        )}
        {(b.status === "matching" || b.status === "ready") && matchedPages.length > 0 && a && (
          <form action={enqueueOcrAction} className="flex items-center gap-2">
            <input type="hidden" name="batchId" value={b.id} />
            <SubmitButton className={`btn btn-sm ${b.status === "matching" ? "btn-primary" : ""}`}>{b.status === "ready" ? t("sc.rerun") : t("sc.enqueue")}</SubmitButton>
            {s.failed > 0 && <span className="text-xs text-slate-500">{t("sc.enqueueHint")}</span>}
          </form>
        )}
        <span className="ml-auto text-sm text-slate-600" data-testid="scan-matched">{t("sc.matched", { m: s.matched, n: s.pages })}</span>
      </div>

      {locked && <div className="mb-4"><OcrProgress batchId={b.id} done={ocrDone} total={matchedPages.length} /></div>}

      {b.status === "ready" && attempts.length > 0 && (
        <section className="card mb-4 p-4" data-testid="scan-ready">
          <p className="mb-3 text-sm text-emerald-800">{t("sc.ocrDone", { n: attempts.length })}</p>
          <ul className="flex flex-wrap gap-2">
            {attempts.map((x) => {
              const st = roster.find((r) => r.id === x.studentId);
              const g = grades.get(x.id) ?? "pending";
              return (
                <li key={x.id}>
                  <Link href={`/t/grading/${x.id}`} className="btn btn-sm" data-testid="scan-grade-link">
                    <PenLine className="h-3.5 w-3.5" /> {st?.displayName ?? "?"}
                    <span className={`badge ${g === "done" ? "bg-emerald-50 text-emerald-700" : g === "in_progress" ? "bg-amber-50 text-amber-800" : ""}`}>{t(`gq.state.${g as "pending"}`)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <h2 className="section-title mb-3">{t("sc.matchTitle")}</h2>
      <MatchBoard
        batchId={b.id}
        locked={locked}
        pps={b.pagesPerStudent}
        roster={roster.map((r) => ({ id: r.id, username: r.username, displayName: r.displayName, avatar: r.avatar }))}
        pages={pages.map((p) => ({ id: p.id, url: withBase(`/api/scan/page/${p.id}`), seq: p.seq, studentId: p.studentId, pageNo: p.pageNo, match: p.match, filename: p.filename, ocrText: p.ocrText, ocrDone: p.ocrDone }))}
      />
    </Page>
  );
}
