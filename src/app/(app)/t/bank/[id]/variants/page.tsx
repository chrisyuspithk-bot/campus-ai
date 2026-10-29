import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { canSeeQuestion, getQuestion } from "@/lib/p3/bank";
import { Markdown } from "@/components/Markdown";
import { Page, PageHeader, SectionHeader } from "@/components/ui";
import { VariantsClient } from "./VariantsClient";

export const metadata: Metadata = { title: "變體" };

const LETTERS = "ABCDEF";

export default async function VariantsPage({ params }: PageProps<"/t/bank/[id]/variants">) {
  const user = await requireUser(["teacher"]);
  const { t } = await getT();
  const { id } = await params;
  const q = getQuestion(id);
  if (!q || !canSeeQuestion(user.id, q)) notFound();
  const existing = db.select().from(schema.questions).where(eq(schema.questions.parentId, q.id)).orderBy(desc(schema.questions.createdAt)).all().filter((v) => canSeeQuestion(user.id, v));

  return (
    <Page wide>
      <Link href={`/t/bank?sel=${q.id}`} className="mb-3 inline-block text-sm text-slate-500 hover:underline">{t("p3.back")}</Link>
      <PageHeader title={t("bk.variant.title", { code: q.code })} subtitle={t("bk.variant.hint")} />
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <section>
          <SectionHeader title={t("bk.variant.original")} />
          <div className="card p-4">
            <div className="mb-2 flex gap-2 text-xs"><span className="badge">{t(`bk.type.${q.type}`)}</span><span className="badge">{q.subject} · {q.topic}</span></div>
            <Markdown>{q.stem}</Markdown>
            {q.options.length > 0 && <ol className="mt-2 space-y-1 text-sm">{q.options.map((o, k) => <li key={k} className="flex gap-2"><b>{LETTERS[k]}.</b><Markdown>{o}</Markdown></li>)}</ol>}
          </div>
          {existing.length > 0 && (
            <>
              <h3 className="mt-6 mb-2 text-sm font-semibold text-slate-600">{t("bk.variant.existing")}</h3>
              <ul className="card divide-y divide-slate-100 text-sm">
                {existing.map((v) => (
                  <li key={v.id}><Link href={`/t/bank?sel=${v.id}`} className="block px-3 py-2 hover:bg-slate-50"><span className="font-mono text-xs font-semibold">{v.code}</span> <span className="line-clamp-1 text-slate-600">{v.stem.replace(/\$/g, "")}</span></Link></li>
                ))}
              </ul>
            </>
          )}
        </section>
        <VariantsClient questionId={q.id} />
      </div>
    </Page>
  );
}
