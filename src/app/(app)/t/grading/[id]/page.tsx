import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ScanLine, Sparkles } from "lucide-react";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { canManageClass, getClass } from "@/lib/p3/classes";
import { fileKey, getAssignment, parseFileAnswer } from "@/lib/p3/exam";
import { COMMENT_TEMPLATES, DEFECT_TAGS, draftMarks, ensureGrade, gradeQuestions, gradingQueue, maxOf } from "@/lib/p4/grading";
import { withBase } from "@/lib/base-path";
import { Page } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { recogniseAction, runAiDraftAction } from "../actions";
import { attemptPages } from "@/lib/p5/scan";
import { Workbench, type WbQuestion } from "./Workbench";
import type { DictKey } from "@/lib/i18n/dict";

export const metadata: Metadata = { title: "批改工作台" };

export default async function GradingWorkbench({ params, searchParams }: PageProps<"/t/grading/[id]">) {
  const user = await requireUser(["teacher", "admin"]);
  const { t } = await getT();
  const { id } = await params;
  const sp = await searchParams;
  const att = db.select().from(schema.attempts).where(eq(schema.attempts.id, id)).get();
  const a = att ? getAssignment(att.assignmentId) : undefined;
  const cls = a ? getClass(a.classId) : undefined;
  if (!att || !a || att.status !== "submitted" || !canManageClass(user, cls)) notFound();
  const student = db.select().from(schema.users).where(eq(schema.users.id, att.studentId)).get()!;
  const g = ensureGrade(a, att);
  const peers = gradingQueue(user, a.id).sort((x, y) => x.student.username.localeCompare(y.student.username));
  const max = maxOf(a);
  const scanPages = attemptPages(a.id, att.studentId);
  const hwPages = scanPages.map((p) => ({ id: p.id, url: withBase(`/api/scan/page/${p.id}`), width: p.width, height: p.height, pageNo: p.pageNo }));

  // P7: grades drafted before step credit existed get the rule-based steps on the fly.
  const rule = draftMarks(a, att);
  const questions: WbQuestion[] = gradeQuestions(a).map((q) => {
    const f = parseFileAnswer(att.answers[fileKey(q.id)]);
    return {
      id: q.id,
      section: q.section,
      type: q.type,
      stem: q.stem,
      options: q.options,
      answer: q.answer,
      marks: q.marks,
      given: att.answers[q.id] ?? "",
      fileUrl: f ? withBase(`/api/assignments/${a.id}/file?item=${f.id}`) : null,
      fileName: f?.name ?? null,
      grade: { ...(g.marks[q.id] ?? {}), aiSteps: g.marks[q.id]?.aiSteps ?? rule[q.id]?.aiSteps },
    };
  });

  return (
    <Page wide>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href={`/t/grading?assignment=${a.id}`} className="text-sm text-slate-500 hover:underline">{t("gw.back")}</Link>
        <h1 className="page-title text-xl">{a.title} <span className="text-base font-normal text-slate-500">· {cls?.name} {cls?.subject}</span></h1>
        <span className={`badge ml-auto ${g.status === "done" ? "bg-emerald-50 text-emerald-700" : g.status === "in_progress" ? "bg-amber-50 text-amber-800" : ""}`} data-testid="grade-status">{t(`gq.state.${g.status}`)}</span>
      </div>
      {sp.saved && <p className="mb-3 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800" data-testid="grade-saved">{t("gw.saved")}</p>}
      {sp.hw && <p className="mb-3 rounded-lg bg-violet-50 px-4 py-2 text-sm text-violet-800" data-testid="hw-done">{t("hw.recognised")}</p>}
      {sp.ai && <p className="mb-3 rounded-lg bg-brand-50 px-4 py-2 text-sm text-brand-800">{t("gw.aiDone")}</p>}
      {typeof sp.err === "string" && <p className="mb-3 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-800">{t(`p2.err.${sp.err}` as DictKey)}</p>}
      <div className="grid gap-4 lg:grid-cols-[14rem_1fr]">
        <aside className="card self-start" aria-label={t("gw.students")}>
          <h2 className="border-b border-slate-200 px-3 py-2 text-sm font-semibold">{t("gw.students")} <span className="text-slate-400">{peers.length}</span></h2>
          <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto" data-testid="wb-students">
            {peers.map((p) => (
              <li key={p.attemptId}>
                <Link href={`/t/grading/${p.attemptId}`} className={`flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 ${p.attemptId === att.id ? "bg-brand-50" : ""}`}>
                  <span aria-hidden>{p.student.avatar}</span>
                  <span className="min-w-0 flex-1 truncate">{p.student.displayName}</span>
                  <span className={`text-xs tabular-nums ${p.state === "done" ? "text-emerald-700" : p.state === "in_progress" ? "text-amber-700" : "text-slate-400"}`}>
                    {p.state === "done" ? `${p.scorePct ?? "—"}%` : `AI ${p.aiPct}%`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="text-lg" aria-hidden>{student.avatar}</span>
            <Link href={`/t/students/${student.id}`} className="font-semibold hover:underline">{student.displayName}</Link>
            <span className="text-slate-400">{student.username}</span>
            {att.blurCount > 0 && <span className="badge bg-amber-50 text-amber-800">{t("gw.blur", { n: att.blurCount })}</span>}
            <span className="ml-auto text-slate-600">{t("gw.aiTotal")} <b className="tabular-nums">{g.aiTotal ?? 0}/{max}</b>{g.aiMock && <span className="ml-1 text-xs text-slate-400">({t("gw.ruleBased")})</span>}</span>
            {hwPages.length > 0 && (
              <>
                <span className="badge bg-violet-50 text-violet-800" data-testid="hw-mode">{t("hw.mode")}</span>
                <form action={recogniseAction}>
                  <input type="hidden" name="attemptId" value={att.id} />
                  <SubmitButton className="btn btn-sm btn-primary"><ScanLine className="h-4 w-4" /> {t("hw.recognise")}</SubmitButton>
                </form>
              </>
            )}
            <form action={runAiDraftAction}>
              <input type="hidden" name="attemptId" value={att.id} />
              <SubmitButton className="btn btn-sm"><Sparkles className="h-4 w-4" /> {t("gw.runAi")}</SubmitButton>
            </form>
          </div>
          {g.aiSummary && <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{g.aiSummary}</p>}
          <Workbench
            attemptId={att.id}
            questions={questions}
            initialComment={g.comment}
            status={g.status}
            defects={DEFECT_TAGS}
            templates={COMMENT_TEMPLATES}
            pages={hwPages}
            initialInk={g.ink}
          />
        </div>
      </div>
    </Page>
  );
}
