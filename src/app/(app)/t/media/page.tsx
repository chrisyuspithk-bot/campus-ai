import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { featuresFor } from "@/lib/features";
import { getT } from "@/lib/i18n/server";
import { relativeTime } from "@/lib/format";
import { BANK_SUBJECTS } from "@/lib/p3/bank";
import { orgCan } from "@/lib/p6/org";
import { SubmitButton } from "@/components/SubmitButton";
import { EmptyState, Page, PageHeader } from "@/components/ui";
import type { DictKey } from "@/lib/i18n/dict";
import { createVideo } from "./actions";

export const metadata: Metadata = { title: "多媒體工作室" };

const STEPS = ["script", "storyboard", "draft", "published"] as const;

export default async function MediaPage() {
  const user = await requireUser(["teacher", "admin"]);
  const { t, lang } = await getT();
  if (!featuresFor(user.role).media || !orgCan(user.role, "media.create")) {
    return (
      <Page>
        <PageHeader title={t("nav.media")} />
        <EmptyState>{t("p2.err.feature_off")}</EmptyState>
      </Page>
    );
  }
  const rows = db.select().from(schema.videos).where(eq(schema.videos.ownerId, user.id)).orderBy(desc(schema.videos.updatedAt)).all();

  return (
    <Page wide>
      <PageHeader title={t("nav.media")} subtitle={t("p6.md.subtitle")} />
      <ol className="mb-6 flex flex-wrap items-center gap-2 text-sm text-slate-600">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">{i + 1}</span>{t(`p6.md.st.${s}` as DictKey)}{i < STEPS.length - 1 && <span className="text-slate-300">→</span>}</li>
        ))}
      </ol>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section>
          {rows.length === 0 ? (
            <EmptyState>{t("p6.md.empty")}</EmptyState>
          ) : (
            <ul className="card divide-y divide-slate-100" data-testid="media-list">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="text-2xl" aria-hidden>{r.scenes[0]?.emoji ?? "📝"}</span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/t/media/${r.id}`} className="block truncate font-medium hover:underline">{r.title}</Link>
                    <span className="text-xs text-slate-500">{r.subject}{r.topic && ` · ${r.topic}`} · {t("p6.md.scenes", { n: r.scenes.length })}</span>
                  </div>
                  <span className={`badge ${r.status === "published" ? "bg-emerald-50 text-emerald-700" : r.status === "draft" ? "bg-brand-50 text-brand-700" : ""}`} data-testid="media-status">{t(`p6.md.st.${r.status}` as DictKey)}</span>
                  <span className="hidden text-xs text-slate-400 sm:inline">{relativeTime(r.updatedAt, lang)}</span>
                  <Link href={`/t/media/${r.id}`} className="btn btn-sm">{t("common.open")}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <form action={createVideo} className="card h-fit space-y-3 p-4" data-testid="media-new">
          <h2 className="section-title">{t("p6.md.new")}</h2>
          <input name="title" className="input" placeholder={t("p6.md.titlePh")} required />
          <div className="grid grid-cols-2 gap-2">
            <select name="subject" className="input" aria-label={t("bk.subject")} defaultValue={user.group === "英文" ? "英文" : "數學"}>{BANK_SUBJECTS.map((s) => <option key={s}>{s}</option>)}</select>
            <select name="level" className="input" aria-label={t("org.level")} defaultValue="S3">{["S1", "S2", "S3", "S4", "S5", "S6"].map((s) => <option key={s}>{s}</option>)}</select>
          </div>
          <input name="topic" className="input" placeholder={t("p6.md.topicPh")} />
          <textarea name="script" className="input min-h-24" placeholder={t("p6.md.scriptOptional")} />
          <SubmitButton>{t("p6.md.create")}</SubmitButton>
        </form>
      </div>
    </Page>
  );
}
