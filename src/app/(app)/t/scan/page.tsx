import type { Metadata } from "next";
import Link from "next/link";
import { ScanLine } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { relativeTime } from "@/lib/format";
import { linkableAssignments, listBatches } from "@/lib/p5/scan";
import { EmptyState, Page, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { createBatchAction } from "./actions";
import { StatusChip } from "./StatusChip";

export const metadata: Metadata = { title: "掃描上載" };

export default async function ScanHome({ searchParams }: PageProps<"/t/scan">) {
  const user = await requireUser(["teacher", "admin"]);
  const { t, lang } = await getT();
  const sp = await searchParams;
  const batches = listBatches(user);
  const assignments = linkableAssignments(user);

  return (
    <Page>
      <PageHeader title={t("sc.title")} subtitle={t("sc.subtitle")} />
      <details className="card mb-6 p-4" open={sp.new === "1" || !batches.length} data-testid="scan-new">
        <summary className="btn btn-primary inline-flex cursor-pointer list-none">{t("sc.new")}</summary>
        <form action={createBatchAction} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_8rem_auto] sm:items-end">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t("sc.name")}</span>
            <input name="title" className="input" required maxLength={120} placeholder={t("sc.namePh")} data-testid="scan-title" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t("sc.assignment")}</span>
            <select name="assignmentId" className="input" data-testid="scan-assignment">
              <option value="">{t("sc.noAssignment")}</option>
              {assignments.map((a) => <option key={a.id} value={a.id}>{a.title} · {a.className} {a.subject}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t("sc.pps")}</span>
            <input name="pagesPerStudent" type="number" min={1} max={8} defaultValue={2} className="input" />
          </label>
          <SubmitButton>{t("sc.create")}</SubmitButton>
        </form>
      </details>

      {batches.length === 0 ? (
        <EmptyState>{t("sc.empty")}</EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2" data-testid="scan-batches">
          {batches.map((b) => (
            <li key={b.id}>
              <Link href={`/t/scan/${b.id}`} className="card flex items-start gap-3 p-4 hover:bg-slate-50" data-testid="scan-batch">
                <ScanLine className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{b.title}</span>
                    <StatusChip status={b.status} matched={b.matched} pages={b.pages} t={t} />
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {b.assignmentTitle ? `${b.assignmentTitle} · ${b.className}` : t("sc.noAssignment")}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {t("sc.pages", { n: b.pages })} · {t("sc.students", { n: b.students })}
                    {b.failed > 0 && b.status !== "uploading" && <span className="ml-2 text-rose-600">{t("sc.match.failed")} {b.failed}</span>}
                    {" · "}{relativeTime(b.updatedAt, lang)}
                  </p>
                </div>
                <span className="text-sm text-brand-600">{t("sc.open")}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
