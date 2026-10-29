import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { featuresFor } from "@/lib/features";
import { getT } from "@/lib/i18n/server";
import { relativeTime } from "@/lib/format";
import { EmptyState, Page, PageHeader } from "@/components/ui";
import type { DictKey } from "@/lib/i18n/dict";
import { createProject } from "./actions";

export const metadata: Metadata = { title: "創作室" };

const KINDS = [
  ["poster", "🎨"],
  ["webpage", "🌐"],
  ["slides", "📊"],
  ["code", "💻"],
] as const;

export default async function CreateLabList() {
  const user = await requireUser(["student"]);
  const { t, lang } = await getT();
  if (!featuresFor(user.role).create) {
    return (
      <Page>
        <PageHeader title={t("cr.title")} />
        <EmptyState>{t("p2.err.feature_off")}</EmptyState>
      </Page>
    );
  }
  const rows = db.select().from(schema.createProjects).where(eq(schema.createProjects.ownerId, user.id)).orderBy(desc(schema.createProjects.updatedAt)).all();
  const icon = Object.fromEntries(KINDS);

  return (
    <Page>
      <PageHeader title={t("cr.title")} subtitle={t("cr.subtitle")} />
      <p className="mb-4 rounded-lg bg-violet-50 px-4 py-2 text-sm text-violet-900" data-testid="create-flow">✨ {t("p7.vibe.createFlow")}</p>
      <section className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {KINDS.map(([k, i]) => (
          <form key={k} action={createProject.bind(null, k)}>
            <button className="card flex w-full items-center gap-3 p-4 text-left transition hover:border-brand-300 hover:shadow" data-testid={`create-new-${k}`}>
              <span className="text-2xl" aria-hidden>{i}</span>
              <span>
                <span className="block font-semibold">{t("cr.new")}</span>
                <span className="text-sm text-slate-500">{t(`cr.kind.${k}`)}</span>
              </span>
            </button>
          </form>
        ))}
      </section>
      {rows.length === 0 ? (
        <EmptyState>{t("cr.empty")}</EmptyState>
      ) : (
        <ul className="card divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span aria-hidden>{icon[r.kind]}</span>
              <Link href={`/s/create/${r.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{r.title}</Link>
              <span className="badge">{t(`cr.kind.${r.kind}` as DictKey)}</span>
              <span className="text-slate-500">{relativeTime(r.updatedAt, lang)}</span>
              <Link href={`/s/create/${r.id}`} className="btn btn-sm">{t("common.open")}</Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
