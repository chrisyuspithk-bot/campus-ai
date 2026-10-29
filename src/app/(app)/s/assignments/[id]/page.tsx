import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown, Lock, Shuffle } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dict";
import { findAttempt, getAssignment, paperQuestions, settleAttempt, studentCanAccess } from "@/lib/p3/exam";
import { getClass } from "@/lib/p3/classes";
import { formatDue } from "@/lib/p3/format";
import { withBase } from "@/lib/base-path";
import { Markdown } from "@/components/Markdown";
import { Page, PageHeader } from "@/components/ui";
import { startAttemptAction } from "../actions";

export const metadata: Metadata = { title: "功課" };

export default async function AssignmentDetail({ params }: PageProps<"/s/assignments/[id]">) {
  const user = await requireUser(["student"]);
  const { t, lang } = await getT();
  const { id } = await params;
  const a = getAssignment(id);
  if (!studentCanAccess(a, user.id)) notFound();
  const c = getClass(a.classId);
  let att = findAttempt(a.id, user.id);
  if (att) att = settleAttempt(att, a);
  const open = a.status === "active" && a.dueAt.getTime() > Date.now();
  const count = a.paperId ? paperQuestions(a.paperId).length : 1;

  return (
    <Page>
      <Link href="/s/assignments" className="mb-3 inline-block text-sm text-slate-500 hover:underline">{t("p3.back")}</Link>
      <PageHeader title={a.title} subtitle={`${c?.name ?? ""} ${c?.subject ?? ""} · ${t(`asg.kind.${a.kind}` as DictKey)}`} />
      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="card p-5">
          {a.instructions ? <Markdown>{a.instructions}</Markdown> : <p className="text-slate-500">—</p>}
          {a.fileId && (
            <a href={withBase(`/api/assignments/${a.id}/file`)} className="btn mt-4" target="_blank" rel="noreferrer">
              <FileDown className="h-4 w-4" /> {t("sa.detail.file")}: {a.fileName}
            </a>
          )}
          {a.lockAi && (
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" /> {t("sa.detail.lock")}
            </p>
          )}
          {a.shuffle && <p className="mt-2 flex items-center gap-2 text-sm text-slate-500"><Shuffle className="h-4 w-4" /> {t("sa.detail.shuffle")}</p>}
        </div>
        <aside className="card space-y-3 p-5 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
            <dt className="text-slate-500">{t("sa.detail.questions")}</dt><dd>{count}</dd>
            <dt className="text-slate-500">{t("sa.detail.time")}</dt><dd>{a.durationMin ? t("p3.minutes", { n: a.durationMin }) : t("p3.untimed")}</dd>
            <dt className="text-slate-500">{t("sa.detail.due")}</dt><dd>{formatDue(a.dueAt, lang)}</dd>
          </dl>
          {!att && open && (
            <form action={startAttemptAction}>
              <input type="hidden" name="id" value={a.id} />
              {a.durationMin ? <p className="mb-2 text-xs text-slate-500">{t("sa.detail.startConfirm")}</p> : null}
              <button className="btn btn-primary w-full" data-testid="start-attempt">{t("sa.start")}</button>
            </form>
          )}
          {att?.status === "in_progress" && <Link href={`/s/assignments/${a.id}/attempt`} className="btn btn-primary w-full">{t("sa.continue")}</Link>}
          {att?.status === "submitted" && (
            <div className="space-y-2">
              <p className="rounded-lg bg-emerald-50 p-3 text-emerald-800">
                {att.maxScore && !att.needsMarking ? t("sa.score", { score: att.score ?? 0, max: att.maxScore }) : t("rs.submitted")}
              </p>
              {a.allowReview && <Link href={`/s/assignments/${a.id}/result`} className="btn w-full">{t("sa.openResult")}</Link>}
            </div>
          )}
          {!att && !open && <p className="rounded-lg bg-slate-100 p-3 text-slate-600">{t("sa.detail.closed")}</p>}
        </aside>
      </div>
    </Page>
  );
}
