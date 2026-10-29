import type { Metadata } from "next";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { checkSafety, ensurePolicyRules } from "@/lib/ai/safety";
import { Page, PageHeader } from "@/components/ui";
import type { DictKey } from "@/lib/i18n/dict";
import { addRule, updateRule } from "./actions";

export const metadata: Metadata = { title: "過濾及政策" };

const CATEGORIES = ["selfharm", "bullying", "sexual", "cheating", "violence", "other"] as const;
const LEVELS = ["high", "medium", "low"] as const;

export default async function Policies({ searchParams }: PageProps<"/a/policies">) {
  await requireUser(["admin"]);
  const { t } = await getT();
  const sp = await searchParams;
  ensurePolicyRules();
  const rules = db.select().from(schema.policyRules).orderBy(asc(schema.policyRules.category), asc(schema.policyRules.createdAt)).all();
  const test = typeof sp.test === "string" ? sp.test.slice(0, 1000) : "";
  const result = test ? checkSafety(test) : null;

  const ruleFields = (r?: (typeof rules)[number]) => (
    <>
      <select name="category" defaultValue={r?.category ?? "other"} className="input w-auto" aria-label={t("pol.category")}>
        {CATEGORIES.map((c) => <option key={c} value={c}>{t(`sf.cat.${c}`)}</option>)}
      </select>
      <input name="pattern" defaultValue={r?.pattern} required className="input min-w-48 flex-1 font-mono text-sm" placeholder={t("pol.pattern")} aria-label={t("pol.pattern")} />
      <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="isRegex" defaultChecked={r?.isRegex ?? false} /> {t("pol.regex")}</label>
      <select name="action" defaultValue={r?.action ?? "flag"} className="input w-auto" aria-label={t("pol.action")}>
        <option value="block">{t("pol.action.block")}</option>
        <option value="flag">{t("pol.action.flag")}</option>
      </select>
      <select name="level" defaultValue={r?.level ?? "medium"} className="input w-auto" aria-label={t("pol.level")}>
        {LEVELS.map((l) => <option key={l} value={l}>{t(`sf.level.${l}`)}</option>)}
      </select>
    </>
  );

  return (
    <Page wide>
      <PageHeader title={t("pol.title")} subtitle={t("pol.subtitle")} />
      {sp.error === "regex" && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{t("pol.badRegex")}</p>}

      <section className="card mb-6 space-y-3 p-4">
        <h2 className="section-title">{t("pol.test")}</h2>
        <form className="flex gap-2" data-testid="policy-test">
          <input name="test" defaultValue={test} className="input flex-1" placeholder={t("pol.testPh")} />
          <button className="btn btn-primary">{t("pol.testRun")}</button>
        </form>
        {result && (
          <p className={`rounded-lg px-3 py-2 text-sm ${result.hit ? (result.blocked ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-900") : "bg-teal-50 text-teal-800"}`} role="status" data-testid="policy-test-result">
            {result.hit
              ? t("pol.testHit", {
                  action: t(`pol.action.${result.hit.action}`),
                  category: t(`sf.cat.${result.hit.category}` as DictKey),
                  level: t(`sf.level.${result.hit.level}`),
                  pattern: result.hit.pattern.slice(0, 60),
                })
              : t("pol.testNone")}
          </p>
        )}
      </section>

      <section className="card mb-6">
        <div className="divide-y divide-slate-100" data-testid="policy-rules">
          {rules.map((r) => (
            <form key={r.id} action={updateRule} className={`flex flex-wrap items-center gap-2 p-3 ${r.enabled ? "" : "opacity-60"}`}>
              <input type="hidden" name="id" value={r.id} />
              {ruleFields(r)}
              <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="enabled" defaultChecked={r.enabled} /> {t("pol.enabled")}</label>
              <button className="btn btn-sm">{t("common.save")}</button>
              <button name="op" value="delete" className="btn btn-sm btn-ghost text-rose-700" formNoValidate>{t("common.delete")}</button>
            </form>
          ))}
        </div>
        <form action={addRule} className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50 p-3">
          {ruleFields()}
          <button className="btn btn-primary btn-sm">{t("pol.add")}</button>
        </form>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-4">
          <h2 className="section-title">{t("pol.tools")}</h2>
          <p className="mt-1 text-sm text-slate-600">{t("pol.toolsDesc")}</p>
          <Link href="/a/features" className="mt-2 inline-block text-sm font-medium text-brand-700 hover:underline">{t("pol.toolsLink")}</Link>
        </section>
        <section className="card p-4">
          <h2 className="section-title">{t("pol.exam")} <span className="phase-badge">P3</span></h2>
          <p className="mt-1 text-sm text-slate-600">{t("pol.examDesc")}</p>
        </section>
      </div>
    </Page>
  );
}
