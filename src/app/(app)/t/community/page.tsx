import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Bookmark, Heart } from "lucide-react";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { relativeTime } from "@/lib/format";
import { COMMUNITY_KINDS, listPosts, myPendingPosts } from "@/lib/p3/community";
import { BANK_SUBJECTS } from "@/lib/p3/bank";
import { Markdown } from "@/components/Markdown";
import { SubmitButton } from "@/components/SubmitButton";
import { EmptyState, Page, PageHeader } from "@/components/ui";
import { copyToDrafts, sharePost, toggleReaction } from "./actions";

export const metadata: Metadata = { title: "教師社群" };

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function CommunityPage({ searchParams }: PageProps<"/t/community">) {
  const user = await requireUser(["teacher"]);
  const { t, lang } = await getT();
  const sp = await searchParams;
  const subject = str(sp.subject);
  const kind = str(sp.kind);
  const posts = listPosts(user.id, { subject, kind });
  const mine = myPendingPosts(user.id);
  const drafts = db.select({ id: schema.drafts.id, title: schema.drafts.title }).from(schema.drafts).where(eq(schema.drafts.ownerId, user.id)).orderBy(desc(schema.drafts.updatedAt)).all();
  const papers = db.select({ id: schema.papers.id, title: schema.papers.title }).from(schema.papers).where(eq(schema.papers.ownerId, user.id)).all();
  const tutors = db.select({ id: schema.tutors.id, name: schema.tutors.name }).from(schema.tutors).where(eq(schema.tutors.ownerId, user.id)).all();

  return (
    <Page wide>
      <PageHeader title={t("cm.title")} subtitle={t("cm.subtitle")} />
      {sp.shared && <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800" role="status">{t("cm.pendingNote")}</p>}
      {sp.copied && <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800" role="status">{t("cm.copied")} · <Link href="/t/drafts" className="underline">{t("nav.drafts")}</Link></p>}
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section>
          <form className="mb-4 flex flex-wrap gap-2">
            <select name="subject" defaultValue={subject} className="input w-auto" aria-label={t("bk.subject")}><option value="">{t("cm.allSubjects")}</option>{BANK_SUBJECTS.map((s) => <option key={s}>{s}</option>)}</select>
            <select name="kind" defaultValue={kind} className="input w-auto" aria-label={t("bk.type")}><option value="">{t("cm.allKinds")}</option>{COMMUNITY_KINDS.map((k) => <option key={k} value={k}>{t(`cm.kind.${k}`)}</option>)}</select>
            <button className="btn">{t("bk.filter")}</button>
          </form>
          {posts.length === 0 ? (
            <EmptyState>{t("cm.empty")}</EmptyState>
          ) : (
            <div className="grid gap-4 md:grid-cols-2" data-testid="community-posts">
              {posts.map((p) => (
                <article key={p.id} className="card flex flex-col p-4">
                  <div className="mb-1 flex items-center gap-2 text-xs">
                    <span className="badge bg-brand-50 text-brand-700">{t(`cm.kind.${p.kind}`)}</span>
                    <span className="badge">{p.subject}</span>
                    <span className="ml-auto text-slate-400">{relativeTime(p.createdAt, lang)}</span>
                  </div>
                  <h3 className="font-semibold">{p.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{p.description}</p>
                  <p className="mt-2 text-xs text-slate-500">{p.authorAvatar} {p.authorName}</p>
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer text-brand-600">{t("cm.show")}</summary>
                    <div className="mt-2 max-h-64 overflow-y-auto rounded-lg bg-slate-50 p-3"><Markdown>{p.content}</Markdown></div>
                    <form action={copyToDrafts} className="mt-2"><input type="hidden" name="postId" value={p.id} /><SubmitButton className="btn btn-sm">{t("cm.copyDraft")}</SubmitButton></form>
                  </details>
                  <div className="mt-auto flex gap-2 pt-3">
                    <form action={toggleReaction}>
                      <input type="hidden" name="postId" value={p.id} /><input type="hidden" name="kind" value="like" />
                      <button className={`btn btn-sm ${p.liked ? "border-rose-300 text-rose-600" : ""}`} aria-pressed={p.liked}><Heart className={`h-3.5 w-3.5 ${p.liked ? "fill-current" : ""}`} /> {t("cm.like")} {p.likes}</button>
                    </form>
                    <form action={toggleReaction}>
                      <input type="hidden" name="postId" value={p.id} /><input type="hidden" name="kind" value="save" />
                      <button className={`btn btn-sm ${p.saved ? "border-amber-300 text-amber-700" : ""}`} aria-pressed={p.saved}><Bookmark className={`h-3.5 w-3.5 ${p.saved ? "fill-current" : ""}`} /> {t("cm.save")} {p.saves}</button>
                    </form>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        <aside className="space-y-4">
          <form action={sharePost} className="card space-y-3 p-4" data-testid="community-share">
            <h2 className="section-title">{t("cm.share")}</h2>
            <select name="source" className="input" required aria-label={t("cm.pick")} defaultValue="">
              <option value="" disabled>{t("cm.pick")}</option>
              {drafts.length > 0 && <optgroup label={t("nav.drafts")}>{drafts.map((d) => <option key={d.id} value={`draft:${d.id}`}>{d.title}</option>)}</optgroup>}
              {papers.length > 0 && <optgroup label={t("nav.papers")}>{papers.map((d) => <option key={d.id} value={`paper:${d.id}`}>{d.title}</option>)}</optgroup>}
              {tutors.length > 0 && <optgroup label={t("nav.tTutors")}>{tutors.map((d) => <option key={d.id} value={`tutor:${d.id}`}>{d.name}</option>)}</optgroup>}
            </select>
            <textarea name="description" className="input min-h-16" placeholder={t("cm.desc")} />
            <p className="text-xs text-slate-500">{t("cm.pendingNote")}</p>
            <SubmitButton>{t("cm.submit")}</SubmitButton>
          </form>
          {mine.length > 0 && (
            <div className="card p-4">
              <h2 className="section-title mb-2">{t("cm.mine")}</h2>
              <ul className="space-y-2 text-sm">
                {mine.map((p) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <span className="flex-1 truncate">{p.title}</span>
                    <span className={`badge ${p.status === "pending" ? "bg-amber-50 text-amber-800" : "bg-rose-50 text-rose-700"}`}>{t(`cm.status.${p.status}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </Page>
  );
}
