import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { Globe } from "lucide-react";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dict";
import { featuresFor } from "@/lib/features";
import { relativeTime } from "@/lib/format";
import { activeLockedAttempt } from "@/lib/p3/exam";
import { listResearch, RESEARCH_PREFIX } from "@/lib/p7/research";
import { ExamLocked } from "@/components/ExamLocked";
import { Markdown } from "@/components/Markdown";
import { SubmitButton } from "@/components/SubmitButton";
import { EmptyState, Page, PageHeader } from "@/components/ui";
import { researchAction } from "./actions";

export const metadata: Metadata = { title: "網上資料搜尋" };

export default async function ResearchPage({ searchParams }: PageProps<"/research">) {
  const user = await requireUser();
  const lock = user.role === "student" ? activeLockedAttempt(user.id) : null;
  if (lock) return <ExamLocked assignmentId={lock.assignment.id} />;
  const { t, lang } = await getT();
  const sp = await searchParams;
  const enabled = featuresFor(user.role).web_search;
  const recent = listResearch(user.id);
  const cid = typeof sp.c === "string" ? sp.c : recent[0]?.id;
  const conv = cid ? db.select().from(schema.conversations).where(and(eq(schema.conversations.id, cid), eq(schema.conversations.userId, user.id))).get() : undefined;
  const msgs = conv ? db.select().from(schema.messages).where(eq(schema.messages.conversationId, conv.id)).orderBy(asc(schema.messages.createdAt)).all() : [];
  const answer = msgs.find((m) => m.role === "assistant");

  return (
    <Page wide>
      <PageHeader title={<span className="inline-flex items-center gap-2"><Globe className="h-6 w-6 text-brand-600" />{t("p7.rs.title")}</span>} subtitle={t("p7.rs.subtitle")} />
      {!enabled ? (
        <EmptyState>{t("p7.rs.off")}</EmptyState>
      ) : (
        <>
          <form action={researchAction} className="card mb-4 flex flex-wrap gap-2 p-4" data-testid="research-form">
            <input name="q" required maxLength={500} className="input min-w-64 flex-1" placeholder={t("p7.rs.placeholder")} aria-label={t("p7.rs.title")} />
            <SubmitButton className="btn btn-primary">{t("p7.rs.go")}</SubmitButton>
          </form>
          {typeof sp.err === "string" && <p className="mb-4 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-800" role="alert">{t(`p7.rs.err.${sp.err}` as DictKey)}</p>}
          <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
            <section className="card min-w-0 p-5" data-testid="research-answer">
              {conv && answer ? (
                <>
                  <h2 className="mb-3 font-semibold">{conv.title.replace(RESEARCH_PREFIX, "")}</h2>
                  <Markdown>{answer.content}</Markdown>
                  <Link href={`/ai/c/${conv.id}`} className="btn mt-4">{t("p7.rs.continue")} →</Link>
                </>
              ) : (
                <p className="text-sm text-slate-500">{t("p7.rs.empty")}</p>
              )}
            </section>
            <aside className="card h-fit p-3 text-sm">
              <h2 className="mb-2 px-1 font-semibold">{t("p7.rs.recent")}</h2>
              <ul className="space-y-1">
                {recent.map((r) => (
                  <li key={r.id}>
                    <Link href={`/research?c=${r.id}`} className={`block rounded px-2 py-1 hover:bg-slate-50 ${r.id === conv?.id ? "bg-brand-50" : ""}`}>
                      <span className="line-clamp-1">{r.title.replace(RESEARCH_PREFIX, "")}</span>
                      <span className="text-xs text-slate-400">{relativeTime(r.updatedAt, lang)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-slate-100 px-1 pt-2 text-xs text-slate-500">{t("p7.rs.youtube")}</p>
            </aside>
          </div>
        </>
      )}
    </Page>
  );
}
