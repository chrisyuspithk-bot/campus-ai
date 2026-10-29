import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { relativeTime } from "@/lib/format";
import { LIBRARY_ACCEPT } from "@/lib/extract";
import { LIBRARY_KINDS, listFolders, listLibrary, openHref, pruneOrphanLibraryRefs } from "@/lib/library";
import { withBase } from "@/lib/base-path";
import { EmptyState, Page, PageHeader } from "@/components/ui";
import type { DictKey } from "@/lib/i18n/dict";
import { LibraryRowMenu, UploadButton } from "./LibraryClient";

export const metadata: Metadata = { title: "我的檔案" };

const ICON: Record<string, string> = { mindmap: "🧠", flashcards: "🗂️", quiz: "✅", worksheet: "📄", youtube: "▶️", essay: "📝", create: "🎨", upload: "📎" };

export default async function LibraryPage({ searchParams }: PageProps<"/s/library">) {
  const user = await requireUser(["student"]);
  const { t, lang } = await getT();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const kind = str("kind");
  const folder = str("folder");
  const q = str("q").trim();
  pruneOrphanLibraryRefs(user.id);
  const rows = listLibrary(user.id, { kind, folder, q });
  const folders = listFolders(user.id);

  return (
    <Page>
      <PageHeader title={t("lib.title")} subtitle={t("lib.subtitle")} actions={<UploadButton folder={folder} accept={LIBRARY_ACCEPT.join(",")} />} />
      <form className="mb-4 flex flex-wrap items-center gap-2" role="search">
        <select name="kind" defaultValue={kind} className="input w-auto" aria-label={t("drafts.type")}>
          <option value="">{t("common.all")}</option>
          {LIBRARY_KINDS.map((k) => <option key={k} value={k}>{t(`lib.kind.${k}` as DictKey)}</option>)}
        </select>
        <select name="folder" defaultValue={folder} className="input w-auto" aria-label={t("p2.folder")}>
          <option value="">{t("lib.allFolders")}</option>
          {folders.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input name="q" defaultValue={q} type="search" placeholder={t("common.search")} className="input pl-8" />
        </div>
        <button className="btn">{t("common.search")}</button>
      </form>

      {rows.length === 0 ? (
        <EmptyState>{t("lib.empty")}</EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base" data-testid="library-table">
            <thead>
              <tr>
                <th>{t("p2.title")}</th>
                <th>{t("sf.source")}</th>
                <th>{t("p2.folder")}</th>
                <th>{t("p2.updated")}</th>
                <th className="text-right">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const href = openHref(r, user.role);
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="max-w-sm truncate font-medium">
                      <span className="mr-1.5" aria-hidden>{ICON[r.kind]}</span>
                      {href ? <Link href={href} className="hover:underline">{r.title}</Link> : r.title}
                      <span className="badge ml-2">{t(`lib.kind.${r.kind}` as DictKey)}</span>
                    </td>
                    <td className="whitespace-nowrap">{t(`lib.source.${r.source}` as DictKey)}</td>
                    <td className="text-slate-500">{r.folder || "—"}</td>
                    <td className="whitespace-nowrap text-slate-500">{relativeTime(r.updatedAt, lang)}</td>
                    <td className="text-right whitespace-nowrap">
                      {href ? (
                        <Link href={href} className="btn btn-sm">{t("common.open")}</Link>
                      ) : (
                        <>
                          {r.hasText && <Link href={`/s/studio?item=${r.id}`} className="btn btn-sm">{t("lib.toStudio")}</Link>}{" "}
                          <a href={withBase(`/api/library/${r.id}/file`)} className="btn btn-sm">{t("lib.download")}</a>
                        </>
                      )}{" "}
                      <LibraryRowMenu id={r.id} title={r.title} folder={r.folder} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-xs text-slate-500">{t("lib.policyNote")}</p>
    </Page>
  );
}
