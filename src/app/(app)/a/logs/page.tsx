import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { AUDIT_ACTIONS, queryAudit } from "@/lib/audit";
import { withBase } from "@/lib/base-path";
import { EmptyState, Page, PageHeader } from "@/components/ui";
import type { DictKey } from "@/lib/i18n/dict";

export const metadata: Metadata = { title: "活動日誌" };

const LIMIT = 500;

export default async function Logs({ searchParams }: PageProps<"/a/logs">) {
  await requireUser(["admin"]);
  const { t, lang } = await getT();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const filter = { action: str("action"), from: str("from"), to: str("to") };
  const rows = queryAudit(filter, LIMIT);
  const fmt = (d: Date) => d.toLocaleString(lang === "en" ? "en-HK" : "zh-HK", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Hong_Kong" });
  const csv = withBase(`/api/admin/logs?${new URLSearchParams(Object.entries(filter).filter(([, v]) => v))}`);

  return (
    <Page wide>
      <PageHeader title={t("log.title")} subtitle={t("log.subtitle")} actions={<a href={csv} className="btn" data-testid="logs-export">{t("log.export")}</a>} />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <select name="action" defaultValue={filter.action} className="input w-auto" aria-label={t("log.what")}>
          <option value="">{t("log.allActions")}</option>
          {AUDIT_ACTIONS.map((a) => <option key={a} value={a}>{t(`log.a.${a}` as DictKey)}</option>)}
        </select>
        <label className="text-sm">{t("log.from")} <input type="date" name="from" defaultValue={filter.from} className="input w-auto" /></label>
        <label className="text-sm">{t("log.to")} <input type="date" name="to" defaultValue={filter.to} className="input w-auto" /></label>
        <button className="btn">{t("common.search")}</button>
      </form>
      {rows.length === 0 ? (
        <EmptyState>{t("log.empty")}</EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base" data-testid="logs-table">
            <thead>
              <tr>
                <th>{t("log.when")}</th>
                <th>{t("log.who")}</th>
                <th>{t("log.what")}</th>
                <th>{t("log.target")}</th>
                <th>{t("log.detail")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-slate-500">{fmt(r.createdAt)}</td>
                  <td className="whitespace-nowrap">{r.actorName} <span className="text-xs text-slate-400">{r.actorRole}</span></td>
                  <td className="whitespace-nowrap">{(AUDIT_ACTIONS as readonly string[]).includes(r.action) ? t(`log.a.${r.action}` as DictKey) : r.action}</td>
                  <td className="max-w-48 truncate">{r.target}</td>
                  <td className="max-w-md truncate text-slate-500" title={r.detail}>{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length >= LIMIT && <p className="mt-3 text-sm text-slate-500">{t("log.more", { n: LIMIT })}</p>}
    </Page>
  );
}
