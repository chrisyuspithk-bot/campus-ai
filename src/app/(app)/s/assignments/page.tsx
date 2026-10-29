import type { Metadata } from "next";
import Link from "next/link";
import { Lock, Timer } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dict";
import { listStudentAssignments } from "@/lib/p3/exam";
import { formatDue } from "@/lib/p3/format";
import { EmptyState, Page, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "功課／測驗" };

const TABS = ["todo", "submitted", "graded"] as const;

export default async function StudentAssignments({ searchParams }: PageProps<"/s/assignments">) {
  const user = await requireUser(["student"]);
  const { t, lang } = await getT();
  const sp = await searchParams;
  const tab = TABS.find((x) => x === sp.tab) ?? "todo";
  const all = listStudentAssignments(user.id);
  const groups = {
    todo: all.filter((a) => a.state === "todo" || a.state === "in_progress").sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime()),
    submitted: all.filter((a) => a.state === "submitted" || a.state === "missed"),
    graded: all.filter((a) => a.state === "graded"),
  };
  const rows = groups[tab];

  return (
    <Page>
      <PageHeader title={t("sa.title")} subtitle={t("sa.subtitle")} />
      <nav className="mb-4 flex gap-1 border-b border-slate-200" aria-label={t("sa.title")}>
        {TABS.map((k) => (
          <Link
            key={k}
            href={`/s/assignments?tab=${k}`}
            aria-current={tab === k ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === k ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            {t(`sa.tab.${k}`)} <span className="badge ml-1">{groups[k].length}</span>
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState>{t(`sa.empty.${tab}` as DictKey)}</EmptyState>
      ) : (
        <ul className="card divide-y divide-slate-100" data-testid="assignment-list">
          {rows.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Link href={`/s/assignments/${a.id}`} className="font-medium hover:underline">{a.title}</Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="badge">{a.subject} · {t(`asg.kind.${a.kind}` as DictKey)}</span>
                  <span>{formatDue(a.dueAt, lang)}</span>
                  {a.durationMin ? <span className="inline-flex items-center gap-1"><Timer className="h-3 w-3" />{t("p3.minutes", { n: a.durationMin })}</span> : null}
                  {a.lockAi && <span className="badge bg-rose-50 text-rose-700"><Lock className="h-3 w-3" />{t("sa.examMode")}</span>}
                </div>
              </div>
              {a.state === "todo" && <Link href={`/s/assignments/${a.id}`} className="btn btn-primary btn-sm">{t("sa.start")}</Link>}
              {a.state === "in_progress" && <Link href={`/s/assignments/${a.id}/attempt`} className="btn btn-primary btn-sm">{t("sa.continue")}</Link>}
              {a.state === "submitted" && <span className="badge bg-amber-50 text-amber-800">{t("sa.submittedWait")}</span>}
              {a.state === "missed" && <span className="badge bg-rose-50 text-rose-700">{t("sa.missed")}</span>}
              {a.state === "graded" && (
                <>
                  {a.attempt?.maxScore ? <span className="badge bg-emerald-50 text-emerald-700">{t("sa.score", { score: a.attempt.score ?? 0, max: a.attempt.maxScore })}</span> : null}
                  {a.allowReview && <Link href={`/s/assignments/${a.id}/result`} className="btn btn-sm">{t("sa.openResult")}</Link>}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
