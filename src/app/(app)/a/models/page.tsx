import type { Metadata } from "next";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { Trash2 } from "lucide-react";
import { db, schema } from "@/lib/db";
import type { Role } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { getSetting } from "@/lib/settings";
import { lastNDays } from "@/lib/time";
import { Page, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { addOverride, deleteModel, removeOverride, saveImageModel, saveModel, saveQuotas } from "../actions";
import { UsageBars } from "./UsageBars";
import { imageModelLive } from "@/lib/p7/models";

export const metadata: Metadata = { title: "模型與配額" };
const ROLES: Role[] = ["student", "teacher", "admin"];

export default async function ModelsPage() {
  await requireUser(["admin"]);
  const { t } = await getT();
  const models = db.select().from(schema.models).orderBy(asc(schema.models.sortOrder)).all();
  const quotas = new Map(db.select().from(schema.quotas).all().map((q) => [q.role, q]));
  const overrides = db
    .select({ o: schema.quotaOverrides, u: schema.users })
    .from(schema.quotaOverrides)
    .innerJoin(schema.users, eq(schema.users.id, schema.quotaOverrides.userId))
    .all();
  const days = lastNDays(7);
  const usageRows = db
    .select({ day: schema.usage.day, tokens: sql<number>`sum(${schema.usage.tokens})` })
    .from(schema.usage)
    .where(inArray(schema.usage.day, days))
    .groupBy(schema.usage.day)
    .all();
  const byDay = new Map(usageRows.map((r) => [r.day, r.tokens]));
  const usage = days.map((day) => ({ day, tokens: byDay.get(day) ?? 0 }));

  const roleChecks = (prefix: string, roles: Role[]) =>
    ROLES.map((r) => (
      <label key={r} className="mr-2 inline-flex items-center gap-1 text-xs">
        <input type="checkbox" name={`role:${r}`} defaultChecked={roles.includes(r)} className="h-3.5 w-3.5" aria-label={`${prefix} ${t(`role.${r}`)}`} />
        {t(`role.${r}`)}
      </label>
    ));

  return (
    <Page wide>
      <PageHeader title={t("m.title")} />

      <section className="card mb-6 overflow-x-auto">
        <h2 className="section-title px-4 pt-4">{t("m.catalog")}</h2>
        <p className="px-4 text-xs text-slate-500" data-testid="models-note">{t("p7.m.note")}</p>
        <table className="table-base mt-2" data-testid="models-table">
          <thead>
            <tr>
              <th>{t("m.displayName")}</th>
              <th>{t("m.backendId")}</th>
              <th>{t("m.description")}</th>
              <th>{t("m.roles")}</th>
              <th>{t("common.status")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id}>
                <td colSpan={6} className="p-0">
                  <form action={saveModel} className="grid min-w-[60rem] grid-cols-[10rem_16rem_1fr_auto_4rem_auto] items-center gap-2 px-3 py-2">
                    <input type="hidden" name="id" value={m.id} />
                    <input name="displayName" defaultValue={m.displayName} className="input" aria-label={t("m.displayName")} />
                    <input name="openrouterId" defaultValue={m.openrouterId} className="input font-mono text-xs" aria-label={t("m.backendId")} />
                    <input name="description" defaultValue={m.description} className="input" aria-label={t("m.description")} />
                    <div className="whitespace-nowrap">{roleChecks(m.displayName, m.roles)}</div>
                    <label className="inline-flex items-center gap-1 text-xs">
                      <input type="checkbox" name="enabled" defaultChecked={m.enabled} className="h-3.5 w-3.5" /> {m.enabled ? "●" : "○"}
                    </label>
                    <div className="flex gap-1">
                      <SubmitButton className="btn btn-sm">{t("common.save")}</SubmitButton>
                      <button formAction={deleteModel} className="btn btn-sm btn-danger" aria-label={t("common.delete")}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </form>
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={6} className="bg-slate-50 p-0">
                <form action={saveModel} className="grid min-w-[60rem] grid-cols-[10rem_16rem_1fr_auto_4rem_auto] items-center gap-2 px-3 py-2">
                  <input name="displayName" placeholder={t("m.displayName")} className="input" required aria-label={t("m.displayName")} />
                  <input name="openrouterId" placeholder="vendor/model-id" className="input font-mono text-xs" required pattern="[\w.\-]+/[\w.:\-]+" aria-label={t("m.backendId")} />
                  <input name="description" placeholder={t("m.description")} className="input" aria-label={t("m.description")} />
                  <div className="whitespace-nowrap">{roleChecks("new", ["teacher", "admin"])}</div>
                  <input type="hidden" name="enabled" value="on" />
                  <span />
                  <SubmitButton className="btn btn-sm btn-primary">{t("m.add")}</SubmitButton>
                </form>
              </td>
            </tr>
          </tbody>
        </table>
        <form action={saveImageModel} className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3 text-sm">
          <label htmlFor="imageModel" className="text-slate-600">{t("m.imageModel")}</label>
          <input id="imageModel" name="imageModel" defaultValue={getSetting("imageModel")} placeholder="mock" className="input w-72 font-mono text-xs" />
          <SubmitButton className="btn btn-sm">{t("common.save")}</SubmitButton>
          <span className={`badge ${imageModelLive(getSetting("imageModel")) ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`} data-testid="image-model-status">
            {imageModelLive(getSetting("imageModel")) ? t("p7.img.live") : t("p7.img.demo")}
          </span>
          <p className="w-full text-xs text-slate-500">{t("p7.img.adminNote")}</p>
        </form>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <section className="card p-4">
          <h2 className="section-title">{t("m.quotas")}</h2>
          <p className="mb-3 text-sm text-slate-500">{t("m.quotaHint")}</p>
          <form action={saveQuotas}>
            <table className="table-base" data-testid="quota-table">
              <thead>
                <tr>
                  <th>{t("m.roleGroup")}</th>
                  <th>{t("m.daily")}</th>
                  <th>{t("m.monthly")}</th>
                  <th>{t("m.images")}</th>
                </tr>
              </thead>
              <tbody>
                {ROLES.map((r) => {
                  const q = quotas.get(r);
                  return (
                    <tr key={r}>
                      <td className="font-medium">{t(`role.${r}`)}</td>
                      <td><input type="number" min={0} name={`${r}:daily`} defaultValue={q?.dailyTokens ?? 0} className="input w-32 tabular-nums" aria-label={`${t(`role.${r}`)} ${t("m.daily")}`} /></td>
                      <td><input type="number" min={0} name={`${r}:monthly`} defaultValue={q?.monthlyTokens ?? 0} className="input w-36 tabular-nums" aria-label={`${t(`role.${r}`)} ${t("m.monthly")}`} /></td>
                      <td><input type="number" min={0} name={`${r}:images`} defaultValue={q?.imagesPerDay ?? 0} className="input w-20 tabular-nums" aria-label={`${t(`role.${r}`)} ${t("m.images")}`} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-3 flex justify-end"><SubmitButton>{t("common.save")}</SubmitButton></div>
          </form>

          <h3 className="mt-6 mb-2 font-semibold text-slate-800">{t("m.overrides")}</h3>
          <table className="table-base">
            <thead>
              <tr><th>{t("m.user")}</th><th>{t("m.daily")}</th><th>{t("m.monthly")}</th><th>{t("m.images")}</th><th>{t("m.noteCol")}</th><th /></tr>
            </thead>
            <tbody>
              {overrides.map(({ o, u }) => (
                <tr key={o.userId}>
                  <td>{u.displayName} <span className="text-xs text-slate-400">({u.username})</span></td>
                  <td className="tabular-nums">{o.dailyTokens.toLocaleString()}</td>
                  <td className="tabular-nums">{o.monthlyTokens.toLocaleString()}</td>
                  <td className="tabular-nums">{o.imagesPerDay}</td>
                  <td className="text-slate-500">{o.note}</td>
                  <td>
                    <form action={removeOverride}>
                      <input type="hidden" name="userId" value={o.userId} />
                      <button className="btn btn-sm btn-danger" aria-label={t("common.delete")}><Trash2 className="h-3.5 w-3.5" /></button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form action={addOverride} className="mt-3 flex flex-wrap items-end gap-2">
            <input name="username" placeholder={t("u.login")} required className="input w-28" aria-label={t("u.login")} />
            <input name="daily" type="number" min={0} placeholder={t("m.daily")} required className="input w-32" aria-label={t("m.daily")} />
            <input name="monthly" type="number" min={0} placeholder={t("m.monthly")} required className="input w-32" aria-label={t("m.monthly")} />
            <input name="images" type="number" min={0} placeholder={t("m.images")} required className="input w-24" aria-label={t("m.images")} />
            <input name="note" placeholder={t("m.noteCol")} className="input w-32" aria-label={t("m.noteCol")} />
            <SubmitButton className="btn">{t("m.addOverride")}</SubmitButton>
          </form>
        </section>

        <section className="card p-4">
          <h2 className="section-title mb-6">{t("m.usageChart")}</h2>
          <UsageBars data={usage} label={t("m.usageChart")} />
        </section>
      </div>
    </Page>
  );
}
