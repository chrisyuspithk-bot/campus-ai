import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { featuresFor } from "@/lib/features";
import { listTutorsWithFileCounts, splitLines } from "@/lib/tutors";
import { getSetting } from "@/lib/settings";
import { EmptyState, Page, PageHeader } from "@/components/ui";
import { TutorGrid } from "./TutorGrid";

export const metadata: Metadata = { title: "科目導師" };

export default async function StudentTutors() {
  await requireUser(["student"]);
  const { t, lang } = await getT();
  const features = featuresFor("student");
  const tutors = features.tutors ? listTutorsWithFileCounts() : [];
  const published = tutors.filter((x) => x.status === "published");

  return (
    <Page>
      <PageHeader title={t("tutors.title")} subtitle={t("tutors.subtitle")} />
      {published.length === 0 ? (
        <EmptyState action={features.ai_chat ? <Link href="/ai" className="btn btn-primary">{t("tutors.goFree")}</Link> : null}>
          {t("tutors.empty")}
        </EmptyState>
      ) : (
        <TutorGrid
          schoolName={getSetting("schoolName")}
          tutors={tutors.map((x) => ({
            slug: x.slug,
            name: lang === "en" && x.nameEn ? x.nameEn : x.name,
            subject: x.subject,
            emoji: x.emoji,
            levels: x.levels,
            strategy: x.strategy,
            tagline: x.tagline,
            blurb: x.blurb,
            will: splitLines(x.will),
            wont: splitLines(x.wont),
            topics: x.topics,
            fileCount: x.fileCount,
            open: x.status === "published",
          }))}
        />
      )}
    </Page>
  );
}
