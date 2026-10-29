import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { AppGallery } from "@/components/apps/AppGallery";
import { galleryApps } from "@/lib/p6/apps";
import { Page, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "應用庫" };

export default async function AppsPage() {
  await requireUser(["student"]);
  const { t } = await getT();
  return (
    <Page>
      <PageHeader title={t("ap.title")} subtitle={t("ap.subtitle")} />
      <AppGallery role="student" custom={galleryApps("student")} />
    </Page>
  );
}
