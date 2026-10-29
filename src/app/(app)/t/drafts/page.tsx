import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, like, ne, or, type SQL } from "drizzle-orm";
import { Search } from "lucide-react";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { relativeTime } from "@/lib/format";
import { EmptyState, Page, PageHeader } from "@/components/ui";
import type { DictKey } from "@/lib/i18n/dict";
import { createDocDraft, createDraft } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { DRAFT_TYPES } from "@/lib/p7/draft-types";
import { DOC_TYPES } from "@/lib/p7/docs";
import { listClassesFor } from "@/lib/p3/classes";
import { DraftRowMenu } from "./DraftRowMenu";

export const metadata: Metadata = { title: "草稿庫" };

const TYPES = DRAFT_TYPES;
const STATUSES = ["draft", "exported", "archived"] as const;

export default async function DraftsPage({ searchParams }: PageProps<"/t/drafts">) {
  const user = await requireUser(["teacher"]);
  const { t, lang } = await getT();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const type = str("type");
  const subject = str("subject");
  const status = str("status");
  const q = str("q").trim();

  const d = schema.drafts;
  const conds: SQL[] = [eq(d.ownerId, user.id)];
  if ((TYPES as readonly string[]).includes(type)) conds.push(eq(d.type, type as (typeof TYPES)[number]));
  if (subject) conds.push(eq(d.subject, subject));
  if ((STATUSES as readonly string[]).includes(status)) conds.push(eq(d.status, status as (typeof STATUSES)[number]));
  else conds.push(ne(d.status, "archived"));
  if (q) conds.push(or(like(d.title, `%${q}%`), like(d.content, `%${q}%`))!);
  const rows = db.select().from(d).where(and(...conds)).orderBy(desc(d.updatedAt)).all();
  const subjects = [
    ...new Set(db.select({ s: d.subject }).from(d).where(eq(d.ownerId, user.id)).all().map((r) => r.s).filter(Boolean)),
  ];
  const filtered = Boolean(type || subject || status || q);
  const myClasses = listClassesFor(user.id);

  return (
    <Page>
      <PageHeader
        title={t("drafts.title")}
        actions={
          <form action={createDraft}>
            <button className="btn btn-primary">{t("drafts.new")}</button>
          </form>
        }
      />
      {typeof sp.err === "string" && <p className="mb-4 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-800" role="alert">{t(`p2.err.${sp.err === "bad_output" || sp.err === "upstream" ? "generic" : sp.err}` as DictKey)}</p>}
      <details className="card mb-4 p-4" data-testid="doc-drafts">
        <summary className="cursor-pointer font-medium">✨ {t("p7.doc.title")}</summary>
        <p className="mt-2 text-sm text-slate-500">{t("p7.doc.hint")}</p>
        <form action={createDocDraft} className="mt-3 flex flex-wrap items-end gap-2">
          <select name="type" className="input w-auto" aria-label={t("drafts.type")} defaultValue="notice">
            {DOC_TYPES.map((x) => <option key={x} value={x}>{t(`drafts.type.${x}`)}</option>)}
          </select>
          <select name="classId" className="input w-auto" aria-label={t("p7.doc.class")}>
            <option value="">{t("p7.doc.noClass")}</option>
            {myClasses.map((c) => <option key={c.id} value={c.id}>{c.name} {c.subject}</option>)}
          </select>
          <input name="topic" className="input min-w-48 flex-1" placeholder={t("p7.doc.topic")} aria-label={t("p7.doc.topic")} />
          <SubmitButton className="btn btn-primary">{t("p7.doc.go")}</SubmitButton>
        </form>
      </details>
      <form className="mb-4 flex flex-wrap items-center gap-2" role="search">
        <select name="type" defaultValue={type} className="input w-auto" aria-label={t("drafts.type")}>
          <option value="">{t("drafts.allTypes")}</option>
          {TYPES.map((x) => <option key={x} value={x}>{t(`drafts.type.${x}`)}</option>)}
        </select>
        <select name="subject" defaultValue={subject} className="input w-auto" aria-label={t("drafts.subject")}>
          <option value="">{t("drafts.allSubjects")}</option>
          {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select name="status" defaultValue={status} className="input w-auto" aria-label={t("common.status")}>
          <option value="">{t("drafts.allStatus")}</option>
          {STATUSES.map((x) => <option key={x} value={x}>{t(`drafts.status.${x}`)}</option>)}
        </select>
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input name="q" defaultValue={q} type="search" placeholder={t("common.search")} className="input pl-8" />
        </div>
        <button className="btn">{t("common.search")}</button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          action={
            !filtered && (
              <form action={createDraft}>
                <button className="btn btn-primary">{t("drafts.emptyCta")}</button>
              </form>
            )
          }
        >
          {t("drafts.empty")}
        </EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base" data-testid="drafts-table">
            <thead>
              <tr>
                <th>{t("drafts.type")}</th>
                <th>{t("drafts.titleCol")}</th>
                <th>{t("drafts.subject")}</th>
                <th>{t("drafts.updated")}</th>
                <th>{t("common.status")}</th>
                <th className="text-right">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td><span className="badge">{t(`drafts.type.${r.type}` as DictKey)}</span></td>
                  <td className="max-w-xs truncate font-medium">
                    <Link href={`/t/drafts/${r.id}`} className="hover:underline">{r.title}</Link>
                  </td>
                  <td>{r.subject}</td>
                  <td className="whitespace-nowrap text-slate-500">{relativeTime(r.updatedAt, lang)}</td>
                  <td>
                    <span className={`badge ${r.status === "exported" ? "bg-teal-50 text-teal-700" : r.status === "archived" ? "bg-slate-200" : ""}`}>
                      {t(`drafts.status.${r.status}` as DictKey)}
                    </span>
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <Link href={`/t/drafts/${r.id}`} className="btn btn-sm">{t("common.open")}</Link>{" "}
                    <DraftRowMenu id={r.id} title={r.title} archived={r.status === "archived"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}
