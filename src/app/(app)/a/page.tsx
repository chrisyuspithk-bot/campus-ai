import type { Metadata } from "next";
import { Notices } from "@/components/p7/Notices";
import Link from "next/link";
import fs from "node:fs";
import path from "node:path";
import { and, eq, gte, sql } from "drizzle-orm";
import { CheckCircle2, Cpu, ScrollText, ShieldAlert, ShieldCheck, SlidersHorizontal, TriangleAlert, Users } from "lucide-react";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { getSetting } from "@/lib/settings";
import { hasOpenRouterKey } from "@/lib/ai/openrouter";
import { limitsFor } from "@/lib/quota";
import { dayKey, startOfToday } from "@/lib/time";
import { formatNumber } from "@/lib/format";
import { Page, PageHeader } from "@/components/ui";
import { DB_PATH } from "@/lib/paths";
import { saveSchoolSettings } from "./actions";

export const metadata: Metadata = { title: "平台總覽" };

function storageWritable() {
  try {
    fs.accessSync(path.dirname(DB_PATH), fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export default async function AdminOverview() {
  const user = await requireUser(["admin"]);
  const { t } = await getT();
  const since = startOfToday();
  const today = dayKey();

  const usageToday = db.select().from(schema.usage).where(eq(schema.usage.day, today)).all();
  const users = new Map(db.select().from(schema.users).all().map((u) => [u.id, u]));
  const convs = db.select({ n: sql<number>`count(*)` }).from(schema.conversations).where(gte(schema.conversations.createdAt, since)).get()?.n ?? 0;
  const msgs = db.select({ n: sql<number>`count(*)` }).from(schema.messages).where(gte(schema.messages.createdAt, since)).get()?.n ?? 0;
  const blocked = db.select({ n: sql<number>`count(*)` }).from(schema.events).where(and(eq(schema.events.type, "blocked"), gte(schema.events.createdAt, since))).get()?.n ?? 0;
  const pcts = usageToday
    .map((u) => {
      const user = users.get(u.userId);
      if (!user) return null;
      const lim = limitsFor(user.id, user.role).dailyTokens;
      return lim > 0 ? Math.min(100, (u.tokens / lim) * 100) : 100;
    })
    .filter((x): x is number => x !== null);
  const avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;
  const pendingIndex = db.select({ n: sql<number>`count(*)` }).from(schema.tutorFiles).where(eq(schema.tutorFiles.status, "indexing")).get()?.n ?? 0;
  const apiOk = hasOpenRouterKey();

  const kpis = [
    { label: t("a.activeUsers"), value: formatNumber(usageToday.length) },
    { label: t("a.convs"), value: formatNumber(convs) },
    { label: t("a.messages"), value: formatNumber(msgs) },
    { label: t("a.blocked"), value: formatNumber(blocked) },
    { label: t("a.quotaAvg"), value: `${avg}%` },
  ];
  const services = [
    { label: t("a.svcApi"), ok: apiOk, note: apiOk ? "OpenRouter" : t("a.svcApiMock") },
    { label: t("a.svcDb"), ok: true, note: "SQLite" },
    { label: t("a.svcIndex"), ok: pendingIndex === 0, note: pendingIndex ? `${pendingIndex} …` : "" },
    { label: t("a.svcStorage"), ok: storageWritable(), note: "" },
    { label: t("a.svcTts"), ok: true, note: "" },
  ];

  return (
    <Page>
      <PageHeader title={t("a.title")} />
      <Notices userId={user.id} />
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">{t("a.today")}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5" data-testid="kpis">
          {kpis.map((k) => (
            <div key={k.label} className="card p-4">
              <div className="text-sm text-slate-500">{k.label}</div>
              <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{k.value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ["/a/features", t("nav.features"), SlidersHorizontal],
            ["/a/models", t("nav.models"), Cpu],
            ["/a/users", t("nav.users"), Users],
            ["/a/safety", t("nav.safety"), ShieldAlert],
            ["/a/policies", t("nav.policies"), ShieldCheck],
            ["/a/logs", t("nav.logs"), ScrollText],
          ] as const
        ).map(([href, label, Icon]) => (
          <Link key={href} href={href} className="card group flex flex-col gap-3 p-5 transition hover:border-brand-300 hover:shadow">
            <Icon className="h-6 w-6 text-brand-600" aria-hidden />
            <span className="font-semibold">{label}</span>
            <span className="text-sm text-brand-600 group-hover:underline">{t("a.manage")}</span>
          </Link>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="section-title mb-3">{t("a.services")}</h2>
          <ul className="space-y-2" data-testid="services">
            {services.map((s) => (
              <li key={s.label} className="flex items-center gap-2 text-sm">
                {s.ok ? <CheckCircle2 className="h-4 w-4 text-teal-600" aria-label="OK" /> : <TriangleAlert className="h-4 w-4 text-amber-600" aria-label="Warning" />}
                <span className="font-medium">{s.label}</span>
                {s.note && <span className="text-slate-500">· {s.note}</span>}
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-5">
          <h2 className="section-title mb-3">{t("a.announcement")}</h2>
          <form action={saveSchoolSettings} className="space-y-3">
            <div>
              <textarea name="announcement" defaultValue={getSetting("announcement")} rows={2} className="input" aria-label={t("a.announcement")} />
              <p className="mt-1 text-xs text-slate-500">{t("a.announcementHint")}</p>
            </div>
            <div>
              <label className="label" htmlFor="schoolName">{t("a.schoolName")}</label>
              <input id="schoolName" name="schoolName" defaultValue={getSetting("schoolName")} className="input" />
            </div>
            <button className="btn btn-primary">{t("common.save")}</button>
          </form>
        </section>
      </div>
    </Page>
  );
}
