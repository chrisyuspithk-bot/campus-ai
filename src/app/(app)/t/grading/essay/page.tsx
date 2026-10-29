import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { relativeTime } from "@/lib/format";
import { RUBRIC, wordCount } from "@/lib/essay";
import { EmptyState, Page, PageHeader } from "@/components/ui";
import { FeedbackCard } from "@/components/essay/FeedbackCard";
import type { DictKey } from "@/lib/i18n/dict";
import { returnEssay } from "./actions";

export const metadata: Metadata = { title: "作文覆核" };

export default async function EssayReview({ searchParams }: PageProps<"/t/grading/essay">) {
  await requireUser(["teacher"]);
  const { t, lang } = await getT();
  const sp = await searchParams;
  const status = sp.status === "returned" ? "returned" : "submitted";
  const e = schema.essays;
  const queue = db
    .select({ id: e.id, title: e.title, status: e.status, submittedAt: e.submittedAt, student: schema.users.displayName, group: schema.users.group })
    .from(e)
    .innerJoin(schema.users, eq(schema.users.id, e.studentId))
    .where(eq(e.status, status))
    .orderBy(desc(e.submittedAt))
    .all();
  const selId = typeof sp.id === "string" ? sp.id : queue[0]?.id;
  const sel = selId ? db.select().from(e).where(eq(e.id, selId)).get() : undefined;
  const student = sel ? db.select().from(schema.users).where(eq(schema.users.id, sel.studentId)).get() : undefined;
  const ai = sel
    ? db.select().from(schema.essayVersions).where(eq(schema.essayVersions.essayId, sel.id)).orderBy(desc(schema.essayVersions.version)).limit(1).get()?.feedback
    : null;
  const defaults = sel?.teacherScores ?? ai?.scores;

  return (
    <Page wide>
      <PageHeader title={t("gr.title")} />
      <div className="grid gap-4 lg:grid-cols-[16rem_1fr_20rem]">
        <aside className="card self-start">
          <div className="flex gap-1 border-b border-slate-200 p-2">
            {(["submitted", "returned"] as const).map((s) => (
              <Link key={s} href={`/t/grading/essay?status=${s}`} className={`btn btn-sm flex-1 ${status === s ? "btn-primary" : ""}`}>{t(`gr.filter.${s}`)}</Link>
            ))}
          </div>
          {queue.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">{t("gr.empty")}</p>
          ) : (
            <ul className="divide-y divide-slate-100" data-testid="grading-queue">
              {queue.map((q) => (
                <li key={q.id}>
                  <Link href={`/t/grading/essay?status=${status}&id=${q.id}`} className={`block px-3 py-2 text-sm hover:bg-slate-50 ${q.id === selId ? "bg-brand-50" : ""}`}>
                    <span className="block truncate font-medium">{q.title}</span>
                    <span className="text-xs text-slate-500">{q.student}{q.group ? ` · ${q.group}` : ""} · {q.submittedAt ? relativeTime(q.submittedAt, lang) : ""}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {sel ? (
          <>
            <article className="card space-y-3 p-6">
              <div>
                <h2 className="text-xl font-semibold">{sel.title}</h2>
                <p className="text-sm text-slate-500">
                  {student?.displayName} · {t(`es.subject.${sel.subject}` as DictKey)}{t(`es.genre.${sel.genre}` as DictKey)} · {t("es.words", { n: wordCount(sel.content) })} / {sel.wordTarget}
                </p>
                {sel.prompt && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-sm">{sel.prompt}</p>}
              </div>
              <div className="leading-relaxed whitespace-pre-wrap" data-testid="grading-content">{sel.content}</div>
            </article>
            <aside className="space-y-4">
              {ai && (
                <div className="card p-4">
                  <h3 className="mb-2 font-semibold">{t("gr.ai")}</h3>
                  <FeedbackCard feedback={ai} />
                </div>
              )}
              <form action={returnEssay} className="card space-y-3 p-4">
                <input type="hidden" name="id" value={sel.id} />
                <h3 className="font-semibold">{t("gr.teacherScore")}</h3>
                <div className="grid grid-cols-2 gap-2">
                  {RUBRIC.map((k) => (
                    <label key={k} className="text-sm">
                      {t(`es.r.${k}` as DictKey)}
                      <select name={k} defaultValue={defaults?.[k] ?? 3} className="input mt-1">
                        {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
                <label className="block text-sm">
                  {t("gr.comment")}
                  <textarea name="comment" defaultValue={sel.teacherComment} className="input mt-1 min-h-28" placeholder={t("gr.commentPh")} />
                </label>
                <button className="btn btn-primary w-full" data-testid="grading-return">{sel.status === "returned" ? `${t("gr.returned")} · ${sel.teacherGrade} — ${t("common.save")}` : t("gr.return")}</button>
              </form>
            </aside>
          </>
        ) : (
          <div className="lg:col-span-2"><EmptyState>{t("gr.pick")}</EmptyState></div>
        )}
      </div>
    </Page>
  );
}
