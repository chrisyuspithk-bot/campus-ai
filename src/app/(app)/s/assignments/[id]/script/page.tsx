import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { appRedirect } from "@/lib/app-url";
import { getT } from "@/lib/i18n/server";
import { findAttempt, getAssignment, settleAttempt, studentCanAccess } from "@/lib/p3/exam";
import { getGrade, gradeQuestions, studentMarks } from "@/lib/p4/grading";
import { attemptPages } from "@/lib/p5/scan";
import { withBase } from "@/lib/base-path";
import { InkPage } from "@/components/p5/InkLayer";
import { ScriptList } from "@/components/p4/ScriptList";
import { Page, PageHeader } from "@/components/ui";
import { PrintButton } from "@/app/(app)/t/papers/[id]/PrintButton";

export const metadata: Metadata = { title: "睇卷" };

/** Returned script with teacher annotations. Only when the teacher allows review and marks are released. */
export default async function ScriptPage({ params }: PageProps<"/s/assignments/[id]/script">) {
  const user = await requireUser(["student"]);
  const { t } = await getT();
  const { id } = await params;
  const a = getAssignment(id);
  if (!studentCanAccess(a, user.id)) notFound();
  const found = findAttempt(a.id, user.id);
  if (!found) return appRedirect(`/s/assignments/${a.id}`);
  const att = settleAttempt(found, a);
  const { marks, released } = studentMarks(a, att);
  if (att.status !== "submitted" || !released || !a.allowReview) return appRedirect(`/s/assignments/${a.id}/result`);
  const pages = attemptPages(a.id, user.id);
  const ink = pages.length ? (getGrade(att.id)?.ink ?? {}) : {};
  const inBook = new Set(db.select({ q: schema.wrongItems.questionId }).from(schema.wrongItems).where(and(eq(schema.wrongItems.studentId, user.id), eq(schema.wrongItems.mastered, false))).all().map((r) => r.q ?? ""));

  return (
    <Page>
      <Link href={`/s/assignments/${a.id}/result`} className="mb-3 inline-block text-sm text-slate-500 hover:underline print:hidden">{t("p3.back")}</Link>
      <PageHeader title={t("rs2.scriptTitle", { title: a.title })} subtitle={`${user.displayName} · ${att.score ?? 0}/${att.maxScore ?? 0}`} actions={<span className="print:hidden"><PrintButton /></span>} />
      {pages.length > 0 && (
        <section className="mb-6" data-testid="script-pages">
          <h2 className="section-title mb-3">{t("hw.yourScript")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {pages.map((p) => <InkPage key={p.id} url={withBase(`/api/scan/page/${p.id}`)} width={p.width} height={p.height} items={ink[p.id] ?? []} alt={t("sc.page", { n: p.pageNo })} />)}
          </div>
        </section>
      )}
      <ScriptList a={a} att={att} qs={gradeQuestions(a)} marks={marks} t={t} inBook={inBook} canAdd />
    </Page>
  );
}
