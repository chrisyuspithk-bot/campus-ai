import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { featuresFor } from "@/lib/features";
import { getT } from "@/lib/i18n/server";
import { BANK_SUBJECTS } from "@/lib/p3/bank";
import { orgCan } from "@/lib/p6/org";
import { Page } from "@/components/ui";
import { MediaEditor } from "./MediaEditor";

export const metadata: Metadata = { title: "多媒體工作室" };

export default async function MediaEditPage({ params }: PageProps<"/t/media/[id]">) {
  const user = await requireUser(["teacher", "admin"]);
  const { t } = await getT();
  const { id } = await params;
  if (!featuresFor(user.role).media || !orgCan(user.role, "media.create")) notFound();
  const v = db.select().from(schema.videos).where(and(eq(schema.videos.id, id), eq(schema.videos.ownerId, user.id))).get();
  if (!v) notFound();
  return (
    <Page wide>
      <Link href="/t/media" className="text-sm text-brand-700 hover:underline">← {t("nav.media")}</Link>
      <MediaEditor
        id={v.id}
        subjects={BANK_SUBJECTS}
        initial={{ title: v.title, subject: v.subject, topic: v.topic, level: v.level, script: v.script, scenes: v.scenes, keyPoints: v.keyPoints, status: v.status, renderInfo: v.renderInfo, rendered: !!v.renderedAt }}
      />
    </Page>
  );
}
