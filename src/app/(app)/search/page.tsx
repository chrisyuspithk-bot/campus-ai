import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, like, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { listConversations } from "@/lib/conversations";
import { relativeTime } from "@/lib/format";
import { Page, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "搜尋" };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const user = await requireUser();
  const { t, lang } = await getT();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";

  const convs = q ? listConversations(user.id, q, 20) : [];
  const drafts =
    q && user.role === "teacher"
      ? db
          .select()
          .from(schema.drafts)
          .where(and(eq(schema.drafts.ownerId, user.id), or(like(schema.drafts.title, `%${q}%`), like(schema.drafts.content, `%${q}%`))))
          .orderBy(desc(schema.drafts.updatedAt))
          .limit(20)
          .all()
      : [];
  const tutors = q
    ? db
        .select()
        .from(schema.tutors)
        .where(and(or(like(schema.tutors.name, `%${q}%`), like(schema.tutors.subject, `%${q}%`), like(schema.tutors.topics, `%${q}%`), like(schema.tutors.nameEn, `%${q}%`)), user.role === "student" ? eq(schema.tutors.status, "published") : undefined))
        .limit(10)
        .all()
    : [];
  const total = convs.length + drafts.length + tutors.length;

  const section = (title: string, children: React.ReactNode) => (
    <section className="mb-6">
      <h2 className="section-title mb-2">{title}</h2>
      <ul className="card divide-y divide-slate-100">{children}</ul>
    </section>
  );
  const row = "flex items-center gap-3 px-4 py-3 hover:bg-slate-50";

  return (
    <Page>
      <PageHeader title={t("search.title")} subtitle={q ? t("search.results", { q }) : undefined} />
      <form className="mb-6 flex gap-2" role="search">
        <input name="q" defaultValue={q} type="search" autoFocus className="input max-w-lg" placeholder={t("top.search")} aria-label={t("common.search")} />
        <button className="btn btn-primary">{t("common.search")}</button>
      </form>
      {q && total === 0 && <p className="text-slate-500">{t("search.none")}</p>}
      {tutors.length > 0 &&
        section(
          t("search.tutors"),
          tutors.map((x) => (
            <li key={x.id}>
              <Link href={user.role === "student" ? `/ai?tutor=${x.slug}` : user.role === "teacher" ? `/t/tutors?id=${x.id}` : `/ai?tutor=${x.slug}&preview=1`} className={row}>
                <span aria-hidden>{x.emoji}</span>
                <span className="flex-1">{x.name}</span>
                <span className="text-xs text-slate-400">{x.subject}</span>
              </Link>
            </li>
          )),
        )}
      {convs.length > 0 &&
        section(
          t("search.convs"),
          convs.map((c) => (
            <li key={c.id}>
              <Link href={`/ai/c/${c.id}`} className={row}>
                <span aria-hidden>{c.tutorEmoji ?? "💬"}</span>
                <span className="flex-1 truncate">{c.title}</span>
                <span className="text-xs text-slate-400">{relativeTime(c.updatedAt, lang)}</span>
              </Link>
            </li>
          )),
        )}
      {drafts.length > 0 &&
        section(
          t("search.drafts"),
          drafts.map((d) => (
            <li key={d.id}>
              <Link href={`/t/drafts/${d.id}`} className={row}>
                <span aria-hidden>📝</span>
                <span className="flex-1 truncate">{d.title}</span>
                <span className="text-xs text-slate-400">{relativeTime(d.updatedAt, lang)}</span>
              </Link>
            </li>
          )),
        )}
    </Page>
  );
}
