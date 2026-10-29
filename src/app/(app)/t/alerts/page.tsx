import type { Metadata } from "next";
import { Notices } from "@/components/p7/Notices";
import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { computeAlerts, type AlertKind } from "@/lib/p3/alerts";
import { listClassesFor, memberIds } from "@/lib/p3/classes";
import { relativeTime } from "@/lib/format";
import { EmptyState, Page, PageHeader } from "@/components/ui";
import { dismissAlert } from "./actions";

export const metadata: Metadata = { title: "學生關注" };

const KINDS: AlertKind[] = ["engagement", "quota", "safety", "lowscore"];
const LEVEL_BADGE = { high: "bg-rose-50 text-rose-700", medium: "bg-amber-50 text-amber-800", low: "bg-slate-100 text-slate-600" };
const KIND_ICON: Record<AlertKind, string> = { engagement: "💤", quota: "⚡", safety: "🛡️", lowscore: "📉" };

export default async function AlertsPage({ searchParams }: PageProps<"/t/alerts">) {
  const user = await requireUser(["teacher"]);
  const { t, lang } = await getT();
  const sp = await searchParams;
  const kind = KINDS.find((k) => k === sp.kind);
  const all = computeAlerts(user.id);
  const rows = kind ? all.filter((a) => a.kind === kind) : all;
  // Link each student to the first of the teacher's classes they're in.
  const classOf = new Map<string, string>();
  for (const c of listClassesFor(user.id)) for (const m of memberIds(c.id)) if (!classOf.has(m)) classOf.set(m, c.id);

  return (
    <Page>
      <PageHeader title={t("al.title")} subtitle={t("al.subtitle")} />
      <Notices userId={user.id} />
      <nav className="mb-4 flex flex-wrap gap-2">
        <Link href="/t/alerts" className={`btn btn-sm ${!kind ? "btn-primary" : ""}`}>{t("common.all")} <span className="badge">{all.length}</span></Link>
        {KINDS.map((k) => (
          <Link key={k} href={`/t/alerts?kind=${k}`} className={`btn btn-sm ${kind === k ? "btn-primary" : ""}`}>
            {KIND_ICON[k]} {t(`al.kind.${k}`)} <span className="badge">{all.filter((a) => a.kind === k).length}</span>
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState>{t("al.empty")}</EmptyState>
      ) : (
        <ul className="card divide-y divide-slate-100" data-testid="alert-list">
          {rows.map((a) => (
            <li key={a.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="text-xl" aria-hidden>{KIND_ICON[a.kind]}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{a.avatar} {a.studentName}</span>
                  <span className="text-xs text-slate-400">{a.className}</span>
                  <span className="badge">{t(`al.kind.${a.kind}`)}</span>
                  <span className={`badge ${LEVEL_BADGE[a.level]}`}>{t(`al.level.${a.level}`)}</span>
                </div>
                <p className="mt-0.5 text-sm text-slate-600">{t(`al.detail.${a.kind}`, a.vars)} · <span className="text-slate-400">{relativeTime(a.at, lang)}</span></p>
              </div>
              {classOf.get(a.studentId) && <Link href={`/t/classes/${classOf.get(a.studentId)}#s-${a.studentId}`} className="btn btn-sm">{t("al.goStudent")}</Link>}
              <form action={dismissAlert}>
                <input type="hidden" name="key" value={a.key} />
                <button className="btn btn-sm btn-ghost text-slate-500">{t("al.dismiss")}</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
