import type { Metadata } from "next";
import { withBase } from "@/lib/base-path";
import { Notices } from "@/components/p7/Notices";
import Link from "next/link";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { EmptyState, Page, PageHeader } from "@/components/ui";
import type { DictKey } from "@/lib/i18n/dict";
import type { RiskLevel } from "@/lib/db/schema";
import { handleCase } from "./actions";

export const metadata: Metadata = { title: "風險收件箱" };

const STATUSES = ["open", "resolved", "escalated"] as const;
const LEVELS: RiskLevel[] = ["high", "medium", "low"];
const LEVEL_BADGE: Record<RiskLevel, string> = { high: "bg-rose-100 text-rose-800", medium: "bg-amber-100 text-amber-800", low: "bg-slate-100 text-slate-700" };

/** "s123" → "s***": the list never shows full usernames or user text. */
const mask = (u: string | null) => (u ? `${u.slice(0, 1)}***` : "—");

export default async function SafetyInbox({ searchParams }: PageProps<"/a/safety">) {
  const me = await requireUser(["admin"]);
  const { t, lang } = await getT();
  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(sp.status as string) ? (sp.status as (typeof STATUSES)[number]) : "open";
  const level = LEVELS.includes(sp.level as RiskLevel) ? (sp.level as RiskLevel) : "";
  const c = schema.safetyCases;
  const conds: SQL[] = [eq(c.status, status)];
  if (level) conds.push(eq(c.level, level));
  const rows = db
    .select({ c, username: schema.users.username, name: schema.users.displayName })
    .from(c)
    .leftJoin(schema.users, eq(schema.users.id, c.userId))
    .where(and(...conds))
    .orderBy(desc(c.createdAt))
    .limit(200)
    .all();
  const sel = typeof sp.id === "string" ? db.select({ c, username: schema.users.username, name: schema.users.displayName }).from(c).leftJoin(schema.users, eq(schema.users.id, c.userId)).where(eq(c.id, sp.id)).get() : undefined;
  const fmt = (d: Date) => d.toLocaleString(lang === "en" ? "en-HK" : "zh-HK", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Hong_Kong" });
  const qs = (extra: Record<string, string>) => new URLSearchParams({ status, ...(level ? { level } : {}), ...extra }).toString();

  return (
    <Page wide>
      <PageHeader title={t("sf.title")} subtitle={t("sf.subtitle")} actions={<a href={withBase("/api/admin/safety")} className="btn btn-sm" data-testid="safety-export">{t("p7.sf.export")}</a>} />
      <Notices userId={me.id} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => (
          <Link key={s} href={`/a/safety?${new URLSearchParams({ status: s, ...(level ? { level } : {}) })}`} className={`btn btn-sm ${status === s ? "btn-primary" : ""}`}>{t(`sf.filter.${s}`)}</Link>
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <Link href={`/a/safety?status=${status}`} className={`btn btn-sm ${!level ? "btn-primary" : ""}`}>{t("sf.allLevels")}</Link>
        {LEVELS.map((l) => (
          <Link key={l} href={`/a/safety?status=${status}&level=${l}`} className={`btn btn-sm ${level === l ? "btn-primary" : ""}`}>{t(`sf.level.${l}`)}</Link>
        ))}
      </div>
      <div className={`grid gap-4 ${sel ? "lg:grid-cols-[1fr_24rem]" : ""}`}>
        {rows.length === 0 ? (
          <EmptyState>{t("sf.empty")}</EmptyState>
        ) : (
          <div className="card self-start overflow-x-auto">
            <table className="table-base" data-testid="safety-table">
              <thead>
                <tr>
                  <th>{t("sf.time")}</th>
                  <th>{t("sf.user")}</th>
                  <th>{t("sf.level")}</th>
                  <th>{t("sf.summary")}</th>
                  <th className="text-right">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ c: r, username }) => (
                  <tr key={r.id} className={r.id === sel?.c.id ? "bg-brand-50" : "hover:bg-slate-50"}>
                    <td className="whitespace-nowrap text-slate-500">{fmt(r.createdAt)}</td>
                    <td className="font-mono">{mask(username)}</td>
                    <td><span className={`badge ${LEVEL_BADGE[r.level]}`}>{t(`sf.level.${r.level}`)}</span></td>
                    <td>
                      {t(`sf.cat.${r.category}` as DictKey)} · {r.source} · {r.blocked ? t("sf.blocked") : t("sf.flagged")}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <Link href={`/a/safety?${qs({ id: r.id })}`} className="btn btn-sm">{t("common.open")}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {sel && (
          <aside className="card space-y-3 self-start p-4" data-testid="safety-detail">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{t("sf.detail")}</h2>
              <span className={`badge ${LEVEL_BADGE[sel.c.level]}`}>{t(`sf.level.${sel.c.level}`)}</span>
            </div>
            <dl className="grid grid-cols-[6rem_1fr] gap-x-2 gap-y-1 text-sm">
              <dt className="text-slate-500">{t("sf.user")}</dt><dd>{sel.name} ({sel.username})</dd>
              <dt className="text-slate-500">{t("sf.time")}</dt><dd>{fmt(sel.c.createdAt)}</dd>
              <dt className="text-slate-500">{t("sf.source")}</dt><dd>{sel.c.source}</dd>
              <dt className="text-slate-500">{t("sf.model")}</dt><dd>{sel.c.modelId ?? "—"}</dd>
              <dt className="text-slate-500">{t("sf.matched")}</dt><dd className="font-mono text-xs break-all">{sel.c.matched}</dd>
              <dt className="text-slate-500">{t("common.status")}</dt><dd>{sel.c.blocked ? t("sf.blocked") : t("sf.flagged")}</dd>
            </dl>
            <div>
              <h3 className="text-sm text-slate-500">{t("sf.excerpt")}</h3>
              <p className="mt-1 max-h-48 overflow-y-auto rounded-lg bg-slate-50 p-2 text-sm whitespace-pre-wrap">{sel.c.excerpt}</p>
            </div>
            {sel.c.handledBy && sel.c.handledAt && <p className="text-xs text-slate-500">{t("sf.handledBy", { name: sel.c.handledBy, time: fmt(sel.c.handledAt) })}</p>}
            <form action={handleCase} className="space-y-2">
              <input type="hidden" name="id" value={sel.c.id} />
              <textarea name="note" defaultValue={sel.c.note} className="input min-h-16 text-sm" placeholder={t("sf.note")} aria-label={t("sf.note")} />
              <div className="flex flex-wrap gap-2">
                {sel.c.status !== "resolved" && <button name="op" value="resolve" className="btn btn-primary btn-sm" data-testid="safety-resolve">{t("sf.resolve")}</button>}
                {sel.c.status !== "escalated" && <button name="op" value="escalate" className="btn btn-danger btn-sm">{t("sf.escalate")}</button>}
                {sel.c.status !== "open" && <button name="op" value="reopen" className="btn btn-sm">{t("sf.reopen")}</button>}
              </div>
            </form>
          </aside>
        )}
      </div>
    </Page>
  );
}
