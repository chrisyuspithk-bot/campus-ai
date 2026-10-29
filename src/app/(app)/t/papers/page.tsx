import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { Lock, Shuffle } from "lucide-react";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { relativeTime } from "@/lib/format";
import { EmptyState, Page, PageHeader } from "@/components/ui";
import { createPaper } from "./actions";

export const metadata: Metadata = { title: "試卷／組卷" };

export default async function PapersPage() {
  const user = await requireUser(["teacher"]);
  const { t, lang } = await getT();
  const papers = db.select().from(schema.papers).where(eq(schema.papers.ownerId, user.id)).orderBy(desc(schema.papers.updatedAt)).all();
  const ids = [...new Set(papers.flatMap((p) => p.sections.flatMap((s) => s.questionIds)))];
  const marks = new Map(ids.length ? db.select({ id: schema.questions.id, marks: schema.questions.marks }).from(schema.questions).where(inArray(schema.questions.id, ids)).all().map((r) => [r.id, r.marks]) : []);
  const newBtn = <form action={createPaper}><button className="btn btn-primary" data-testid="paper-new">{t("pp.new")}</button></form>;

  return (
    <Page>
      <PageHeader title={t("pp.title")} subtitle={t("pp.subtitle")} actions={<><Link href="/t/bank" className="btn">{t("nav.bank")}</Link>{newBtn}</>} />
      {papers.length === 0 ? (
        <EmptyState action={newBtn}>{t("pp.empty")}</EmptyState>
      ) : (
        <ul className="card divide-y divide-slate-100" data-testid="paper-list">
          {papers.map((p) => {
            const qids = p.sections.flatMap((s) => s.questionIds);
            const total = qids.reduce((s, q) => s + (marks.get(q) ?? 0), 0);
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{p.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{t("p3.questions", { n: qids.length })} · {t("p3.marks", { n: total })} · {t("p3.minutes", { n: p.durationMin })}</span>
                    {p.shuffle && <Shuffle className="h-3 w-3" aria-label={t("pp.shuffle")} />}
                    {p.lockAi && <Lock className="h-3 w-3 text-rose-500" aria-label={t("pp.lockAi")} />}
                    <span>· {relativeTime(p.updatedAt, lang)}</span>
                  </div>
                </div>
                <Link href={`/t/papers/${p.id}/edit`} className="btn btn-sm">{t("pp.edit")}</Link>
                <Link href={`/t/papers/${p.id}`} className="btn btn-sm">{t("pp.preview")}</Link>
                <Link href={`/t/assignments/new?paper=${p.id}`} className="btn btn-sm btn-primary">{t("pp.assign")}</Link>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
