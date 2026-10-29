import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { listFeatures } from "@/lib/features";
import { Page, PageHeader } from "@/components/ui";
import type { DictKey } from "@/lib/i18n/dict";
import { saveFeatures } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { isUnlocked } from "@/lib/phase";

export const metadata: Metadata = { title: "功能開關" };

const NOTES: Record<string, DictKey> = {
  image_gen: "f.note.image_gen",
  web_search: "f.note.web_search",
  exam_lock: "f.note.exam_lock",
  youtube: "f.note.youtube",
  essay: "f.note.essay",
};

export default async function FeaturesPage() {
  await requireUser(["admin"]);
  const { t } = await getT();
  const rows = listFeatures();

  const toggle = (name: string, on: boolean, locked: boolean, label: string) =>
    locked ? (
      <span className="phase-badge" title={t("f.note.locked")}>—</span>
    ) : (
      <label className="inline-flex cursor-pointer items-center">
        <input type="checkbox" name={name} defaultChecked={on} className="peer sr-only" aria-label={label} />
        <span className="relative h-5 w-9 rounded-full bg-slate-300 transition peer-checked:bg-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-300 after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4" />
      </label>
    );

  return (
    <Page>
      <PageHeader title={t("f.title")} subtitle={t("f.savedHint")} />
      <form action={saveFeatures} className="card overflow-x-auto">
        <table className="table-base" data-testid="features-table">
          <thead>
            <tr>
              <th>{t("f.module")}</th>
              <th className="text-center">{t("role.student")}</th>
              <th className="text-center">{t("role.teacher")}</th>
              <th>{t("f.note")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const locked = !isUnlocked(r.phase);
              const label = t(`f.${r.key}` as DictKey);
              return (
                <tr key={r.key} className={locked ? "text-slate-400" : ""}>
                  <td className="font-medium">
                    {label} {locked && <span className="phase-badge ml-1">P{r.phase}</span>}
                  </td>
                  <td className="text-center">{toggle(`${r.key}:student`, r.studentEnabled, locked, `${label} · ${t("role.student")}`)}</td>
                  <td className="text-center">{toggle(`${r.key}:teacher`, r.teacherEnabled, locked, `${label} · ${t("role.teacher")}`)}</td>
                  <td className="text-sm text-slate-500">{NOTES[r.key] ? t(NOTES[r.key]) : locked ? t("f.note.locked") : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex justify-end border-t border-slate-100 p-3">
          <SubmitButton>{t("common.save")}</SubmitButton>
        </div>
      </form>
    </Page>
  );
}
