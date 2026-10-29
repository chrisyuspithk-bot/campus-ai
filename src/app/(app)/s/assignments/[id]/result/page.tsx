import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { BookmarkPlus, FileSearch } from "lucide-react";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { appRedirect } from "@/lib/app-url";
import { getT } from "@/lib/i18n/server";
import { findAttempt, getAssignment, settleAttempt, studentCanAccess } from "@/lib/p3/exam";
import { gradeQuestions, studentMarks } from "@/lib/p4/grading";
import { wrongQuestions } from "@/lib/p4/wrongbook";
import { ScriptList } from "@/components/p4/ScriptList";
import { Page, PageHeader } from "@/components/ui";
import { addWrongFromResult } from "../../../wrongbook/actions";

export const metadata: Metadata = { title: "結果" };

export default async function ResultPage({ params, searchParams }: PageProps<"/s/assignments/[id]/result">) {
  const user = await requireUser(["student"]);
  const { t } = await getT();
  const { id } = await params;
  const sp = await searchParams;
  const a = getAssignment(id);
  if (!studentCanAccess(a, user.id)) notFound();
  const found = findAttempt(a.id, user.id);
  if (!found) return appRedirect(`/s/assignments/${a.id}`);
  const att = settleAttempt(found, a);
  if (att.status !== "submitted") return appRedirect(`/s/assignments/${a.id}/attempt`);

  const qs = gradeQuestions(a);
  const { marks, comment, released } = studentMarks(a, att);
  const wrong = released ? wrongQuestions(a, att) : [];
  const inBook = new Set(
    db.select({ q: schema.wrongItems.questionId }).from(schema.wrongItems).where(and(eq(schema.wrongItems.studentId, user.id), eq(schema.wrongItems.mastered, false))).all().map((r) => r.q ?? ""),
  );
  const toAdd = wrong.filter((w) => !inBook.has(w.questionId));
  const sections = [...new Set(qs.map((q) => q.section))].map((s) => {
    const list = qs.filter((q) => q.section === s);
    const got = list.reduce((n, q) => n + (marks[q.id]?.score ?? 0), 0);
    return { title: s, got, max: list.reduce((n, q) => n + q.marks, 0), pending: list.some((q) => marks[q.id]?.score == null) };
  });
  const showReview = a.allowReview;

  return (
    <Page>
      <Link href="/s/assignments?tab=graded" className="mb-3 inline-block text-sm text-slate-500 hover:underline">{t("p3.back")}</Link>
      <PageHeader
        title={t("rs.title", { title: a.title })}
        actions={
          released && showReview ? (
            <>
              <Link href={`/s/assignments/${a.id}/script`} className="btn" data-testid="view-script"><FileSearch className="h-4 w-4" /> {t("rs2.script")}</Link>
              {toAdd.length > 0 && (
                <form action={addWrongFromResult}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="btn btn-primary" data-testid="add-wrongbook"><BookmarkPlus className="h-4 w-4" /> {t("rs2.addAll", { n: toAdd.length })}</button>
                </form>
              )}
            </>
          ) : null
        }
      />
      {typeof sp.added === "string" && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800" data-testid="wrong-added">
          {t("rs2.added", { n: sp.added })} <Link href="/s/wrongbook" className="font-medium underline">{t("rs2.openBook")}</Link>
        </p>
      )}
      <div className="card mb-6 flex flex-wrap items-center gap-6 p-5" data-testid="result-summary">
        {released && att.maxScore ? (
          <div className="text-5xl font-bold text-brand-700 tabular-nums" data-testid="result-score">{att.score ?? 0}<span className="text-xl text-slate-400">/{att.maxScore}</span></div>
        ) : null}
        <div className="text-sm text-slate-600">
          <p>{!released ? t("rs.submitted") : t("sa.score", { score: att.score ?? 0, max: att.maxScore ?? 0 })}</p>
          {!released && <p className="mt-1 text-slate-500">{t("rs.auto")}</p>}
        </div>
        {released && sections.length > 1 && (
          <table className="ml-auto text-sm" data-testid="result-sections">
            <tbody>
              {sections.map((s) => (
                <tr key={s.title}><td className="pr-4 text-slate-500">{s.title}</td><td className="text-right tabular-nums font-medium">{s.got}/{s.max}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {released && comment && (
        <div className="card mb-6 border-amber-200 bg-amber-50 p-5" data-testid="teacher-comment">
          <h2 className="mb-1 text-sm font-semibold text-amber-900">{t("rs2.comment")}</h2>
          <p className="whitespace-pre-wrap text-sm">{comment}</p>
        </div>
      )}
      {!showReview ? (
        <p className="card p-5 text-slate-600">{t("rs.noReview")}</p>
      ) : (
        <ScriptList a={a} att={att} qs={qs} marks={marks} t={t} inBook={inBook} canAdd={released} />
      )}
    </Page>
  );
}
