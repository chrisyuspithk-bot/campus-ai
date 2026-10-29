import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { featuresFor } from "@/lib/features";
import { getT } from "@/lib/i18n/server";
import { Page } from "@/components/ui";
import { CreateLab } from "./CreateLab";
import { CodeLab } from "./CodeLab";
import { emptyFiles, normalizeFiles } from "@/lib/p8/files";

export const metadata: Metadata = { title: "創作室" };

export default async function CreateProjectPage({ params }: PageProps<"/s/create/[id]">) {
  const user = await requireUser(["student"]);
  const { t } = await getT();
  const { id } = await params;
  const p = db.select().from(schema.createProjects).where(and(eq(schema.createProjects.id, id), eq(schema.createProjects.ownerId, user.id))).get();
  if (!featuresFor(user.role).create) notFound();
  if (!p) {
    // Orphan library link or deleted project — back to files instead of bare 404.
    redirect("/s/library");
  }
  const l = schema.libraryItems;
  const shared = !!db.select({ id: l.id }).from(l).where(and(eq(l.ownerId, user.id), eq(l.kind, "create"), eq(l.refId, id))).get();

  return (
    <Page wide>
      <Link href="/s/create" className="text-sm text-brand-700 hover:underline">← {t("cr.title")}</Link>
      {p.kind === "code" ? <CodeLab id={p.id} title={p.title} files={p.files ? normalizeFiles(p.files, p.html) : emptyFiles(p.html)} shared={shared} /> : <CreateLab id={p.id} kind={p.kind} title={p.title} messages={p.messages} html={p.html} shared={shared} />}
    </Page>
  );
}
