import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { BANK_SUBJECTS } from "@/lib/p3/bank";
import { getOwnApp } from "@/lib/p6/apps";
import { orgCan } from "@/lib/p6/org";
import { Page } from "@/components/ui";
import { AppBuilder } from "./AppBuilder";
import { normalizeFiles, splitHtml } from "@/lib/p8/files";

export const metadata: Metadata = { title: "應用打包" };

export default async function BuildPage({ params }: PageProps<"/t/apps/build/[id]">) {
  const user = await requireUser(["teacher"]);
  const { t } = await getT();
  const { id } = await params;
  const app = orgCan(user.role, "apps.publish") ? getOwnApp(id, user.id) : undefined;
  if (!app) notFound();
  return (
    <Page wide>
      <Link href="/t/apps" className="text-sm text-brand-700 hover:underline">← {t("ap.title")}</Link>
      <AppBuilder
        id={app.id}
        subjects={BANK_SUBJECTS}
        initial={{ title: app.title, emoji: app.emoji, description: app.description, subject: app.subject, audience: app.audience }}
        files={app.files ? normalizeFiles(app.files) : splitHtml(app.html)}
        status={app.status}
        version={app.version}
        reviewNote={app.reviewNote}
      />
    </Page>
  );
}
