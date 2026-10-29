import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { featuresFor } from "@/lib/features";
import { listClassesFor } from "@/lib/p3/classes";
import { Page, PageHeader } from "@/components/ui";
import { AssignWizard } from "./AssignWizard";

export const metadata: Metadata = { title: "新派發" };

export default async function NewAssignment({ searchParams }: PageProps<"/t/assignments/new">) {
  const user = await requireUser(["teacher"]);
  const { t } = await getT();
  const sp = await searchParams;
  const papers = db.select().from(schema.papers).where(eq(schema.papers.ownerId, user.id)).orderBy(desc(schema.papers.updatedAt)).all();
  const classes = listClassesFor(user.id);
  return (
    <Page>
      <Link href="/t/assignments" className="mb-3 inline-block text-sm text-slate-500 hover:underline">{t("p3.back")}</Link>
      <PageHeader title={t("asg.wiz.title")} />
      <AssignWizard
        papers={papers.map((p) => ({ id: p.id, title: p.title, count: p.sections.reduce((s, x) => s + x.questionIds.length, 0), durationMin: p.durationMin, shuffle: p.shuffle, lockAi: p.lockAi }))}
        classes={classes.map((c) => ({ id: c.id, label: `${c.name} ${c.subject}`, members: c.memberCount }))}
        examLockAllowed={featuresFor("teacher").exam_lock}
        initialPaper={typeof sp.paper === "string" ? sp.paper : undefined}
        initialClass={typeof sp.class === "string" ? sp.class : undefined}
      />
    </Page>
  );
}
