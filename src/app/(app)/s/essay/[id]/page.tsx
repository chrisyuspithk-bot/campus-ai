import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { featuresFor } from "@/lib/features";
import { getT } from "@/lib/i18n/server";
import { STATUS_BADGE } from "@/lib/essay";
import { Page, PageHeader } from "@/components/ui";
import type { DictKey } from "@/lib/i18n/dict";
import { EssayEditor } from "./EssayEditor";

export const metadata: Metadata = { title: "作文" };

export default async function EssayPage({ params }: PageProps<"/s/essay/[id]">) {
  const user = await requireUser(["student"]);
  const { t } = await getT();
  const { id } = await params;
  const e = db.select().from(schema.essays).where(and(eq(schema.essays.id, id), eq(schema.essays.studentId, user.id))).get();
  if (!e || !featuresFor(user.role).essay) notFound();
  const versions = db
    .select({ version: schema.essayVersions.version, feedback: schema.essayVersions.feedback })
    .from(schema.essayVersions)
    .where(eq(schema.essayVersions.essayId, id))
    .orderBy(asc(schema.essayVersions.version))
    .all();

  return (
    <Page wide>
      <Link href="/s/essay" className="text-sm text-brand-700 hover:underline">← {t("es.title")}</Link>
      <PageHeader title={e.title} subtitle={<span className={`badge ${STATUS_BADGE[e.status]}`}>{t(`es.status.${e.status}` as DictKey)}</span>} />
      <EssayEditor
        id={e.id}
        initial={{ title: e.title, subject: e.subject, genre: e.genre, prompt: e.prompt, wordTarget: e.wordTarget, content: e.content }}
        status={e.status}
        versions={versions}
        teacher={e.status === "returned" ? { grade: e.teacherGrade, scores: e.teacherScores, comment: e.teacherComment } : undefined}
      />
    </Page>
  );
}
