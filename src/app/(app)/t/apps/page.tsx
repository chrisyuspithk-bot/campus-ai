import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { relativeTime } from "@/lib/format";
import type { DictKey } from "@/lib/i18n/dict";
import { APP_TEMPLATES, galleryApps, MAX_APPS_PER_TEACHER, myApps, type TemplateKey } from "@/lib/p6/apps";
import { orgCan } from "@/lib/p6/org";
import { STATUS_CLS } from "@/lib/p6/app-templates";
import { AppGallery } from "@/components/apps/AppGallery";
import { Page, PageHeader, SectionHeader } from "@/components/ui";
import { newApp } from "./actions";

export const metadata: Metadata = { title: "應用庫" };

export default async function AppsPage({ searchParams }: PageProps<"/t/apps">) {
  const user = await requireUser(["teacher"]);
  const { t, lang } = await getT();
  const sp = await searchParams;
  const canBuild = orgCan(user.role, "apps.publish");
  const mine = myApps(user.id);

  return (
    <Page>
      <PageHeader title={t("ap.title")} subtitle={t("ap.subtitle")} />
      <AppGallery role="teacher" custom={galleryApps("teacher")} />
      {canBuild && (
        <section className="mt-8" data-testid="my-apps">
          <SectionHeader title={`🧩 ${t("p6.ap.mine")} (${mine.length}/${MAX_APPS_PER_TEACHER})`} />
          {sp.limit && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{t("p6.ap.limit", { n: MAX_APPS_PER_TEACHER })}</p>}
          {mine.length > 0 && (
            <ul className="card mb-4 divide-y divide-slate-100 text-sm">
              {mine.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-xl" aria-hidden>{a.emoji}</span>
                  <Link href={`/t/apps/build/${a.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{a.title}</Link>
                  {a.version > 0 && <span className="text-xs text-slate-500">v{a.version} {t("p6.ap.live")}</span>}
                  <span className={`badge ${STATUS_CLS[a.status]}`}>{t(`p6.ap.st.${a.status}` as DictKey)}</span>
                  <span className="hidden text-xs text-slate-400 sm:inline">{relativeTime(a.updatedAt, lang)}</span>
                  <Link href={`/t/apps/build/${a.id}`} className="btn btn-sm">{t("common.edit")}</Link>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(Object.keys(APP_TEMPLATES) as TemplateKey[]).map((k) => (
              <form key={k} action={newApp.bind(null, k)}>
                <button className="card flex w-full items-center gap-3 p-3 text-left transition hover:border-brand-300 hover:shadow" data-testid={`app-new-${k}`}>
                  <span className="text-2xl" aria-hidden>{APP_TEMPLATES[k].emoji}</span>
                  <span><span className="block text-sm font-semibold">＋ {t(`p6.ap.tpl.${k}` as DictKey)}</span><span className="text-xs text-slate-500">{t("p6.ap.fromTpl")}</span></span>
                </button>
              </form>
            ))}
          </div>
        </section>
      )}
    </Page>
  );
}
