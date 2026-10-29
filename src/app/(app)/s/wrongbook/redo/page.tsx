import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { ExamLocked } from "@/components/ExamLocked";
import { activeLockedAttempt } from "@/lib/p3/exam";
import { listWrong } from "@/lib/p4/wrongbook";
import { EmptyState, Page, PageHeader } from "@/components/ui";
import { RedoClient } from "./RedoClient";

export const metadata: Metadata = { title: "錯題重做" };

export default async function RedoPage({ searchParams }: PageProps<"/s/wrongbook/redo">) {
  const user = await requireUser(["student"]);
  const { t } = await getT();
  const sp = await searchParams;
  const lock = activeLockedAttempt(user.id);
  const all = listWrong(user.id);
  const items =
    typeof sp.id === "string"
      ? all.filter((w) => w.id === sp.id)
      : all.filter((w) => !w.mastered && (typeof sp.topic !== "string" || w.topic === sp.topic)).slice(0, 10);

  return (
    <Page>
      <Link href="/s/wrongbook" className="mb-3 inline-block text-sm text-slate-500 hover:underline">{t("p3.back")}</Link>
      <PageHeader title={t("wb.redoTitle")} subtitle={typeof sp.topic === "string" ? sp.topic : t("wb.redoSub")} />
      {lock ? (
        <ExamLocked assignmentId={lock.assignment.id} />
      ) : items.length === 0 ? (
        <EmptyState action={<Link href="/s/wrongbook" className="btn">{t("wb.title")}</Link>}>{t("wb.empty.active")}</EmptyState>
      ) : (
        <RedoClient items={items.map((w) => ({ id: w.id, type: w.type, stem: w.stem, options: w.options, answer: w.answer, topic: w.topic }))} />
      )}
    </Page>
  );
}
