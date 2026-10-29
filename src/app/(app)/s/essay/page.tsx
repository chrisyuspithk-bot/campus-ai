import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { featuresFor } from "@/lib/features";
import { getT } from "@/lib/i18n/server";
import { relativeTime } from "@/lib/format";
import { STATUS_BADGE } from "@/lib/essay";
import { EmptyState, Page, PageHeader } from "@/components/ui";
import type { DictKey } from "@/lib/i18n/dict";
import { createEssay } from "./actions";

export const metadata: Metadata = { title: "作文" };

export default async function EssayList() {
  const user = await requireUser(["student"]);
  const { t, lang } = await getT();
  if (!featuresFor(user.role).essay) {
    return (
      <Page>
        <PageHeader title={t("es.title")} />
        <EmptyState>{t("es.aiOff")}</EmptyState>
      </Page>
    );
  }
  const rows = db.select().from(schema.essays).where(eq(schema.essays.studentId, user.id)).orderBy(desc(schema.essays.updatedAt)).all();
  const newBtn = (
    <form action={createEssay}>
      <button className="btn btn-primary" data-testid="essay-new">{t("es.new")}</button>
    </form>
  );

  return (
    <Page>
      <PageHeader title={t("es.title")} actions={newBtn} />
      {rows.length === 0 ? (
        <EmptyState action={newBtn}>{t("es.empty")}</EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>{t("p2.title")}</th>
                <th>{t("es.subject")}／{t("es.genre")}</th>
                <th>{t("common.status")}</th>
                <th>{t("p2.updated")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="max-w-xs truncate font-medium"><Link href={`/s/essay/${r.id}`} className="hover:underline">{r.title}</Link></td>
                  <td>{t(`es.subject.${r.subject}` as DictKey)}{t(`es.genre.${r.genre}` as DictKey)}</td>
                  <td><span className={`badge ${STATUS_BADGE[r.status]}`}>{t(`es.status.${r.status}` as DictKey)}</span></td>
                  <td className="whitespace-nowrap text-slate-500">{relativeTime(r.updatedAt, lang)}</td>
                  <td className="text-right"><Link href={`/s/essay/${r.id}`} className="btn btn-sm">{t("common.open")}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}
