import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { relativeTime } from "@/lib/format";
import { Markdown } from "@/components/Markdown";
import { EmptyState, Page, PageHeader, SectionHeader } from "@/components/ui";
import { moderatePost, reviewApp, unlistApp } from "./actions";
import { AppReviewPreview } from "./AppReviewPreview";

export const metadata: Metadata = { title: "內容審核" };

export default async function ModerationPage({ searchParams }: PageProps<"/a/moderation">) {
  await requireUser(["admin"]);
  const { t, lang } = await getT();
  const p = schema.communityPosts;
  const rows = (status: "pending" | "done") =>
    db.select({ post: p, author: schema.users.displayName })
      .from(p)
      .leftJoin(schema.users, eq(schema.users.id, p.authorId))
      .where(status === "pending" ? eq(p.status, "pending") : ne(p.status, "pending"))
      .orderBy(desc(p.createdAt))
      .limit(status === "pending" ? 100 : 10)
      .all();
  const pending = rows("pending");
  const done = rows("done");
  const ap = schema.appListings;
  const appRows = db.select({ app: ap, author: schema.users.displayName }).from(ap).leftJoin(schema.users, eq(schema.users.id, ap.ownerId)).orderBy(desc(ap.updatedAt)).all();
  const appQueue = appRows.filter((r) => r.app.status === "pending");
  const liveApps = appRows.filter((r) => r.app.publishedHtml);
  const tab = (await searchParams).tab === "community" ? "community" : "apps";

  return (
    <Page>
      <PageHeader title={t("mod.title")} subtitle={t("p6.mod.subtitle")} />
      <div className="mb-5 flex gap-1 border-b border-slate-200" role="tablist">
        <Link href="/a/moderation?tab=apps" role="tab" aria-selected={tab === "apps"} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === "apps" ? "border-brand-600 font-semibold text-brand-700" : "border-transparent text-slate-500"}`} data-testid="mod-tab-apps">🧩 {t("p6.mod.apps")} ({appQueue.length})</Link>
        <Link href="/a/moderation?tab=community" role="tab" aria-selected={tab === "community"} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === "community" ? "border-brand-600 font-semibold text-brand-700" : "border-transparent text-slate-500"}`} data-testid="mod-tab-community">💬 {t("p6.mod.community")} ({pending.length})</Link>
      </div>
      {tab === "apps" ? (
        <>
          <SectionHeader title={`${t("mod.pending")} (${appQueue.length})`} />
          {appQueue.length === 0 ? (
            <EmptyState>{t("p6.mod.appsEmpty")}</EmptyState>
          ) : (
            <ul className="space-y-4" data-testid="app-queue">
              {appQueue.map(({ app, author }) => (
                <li key={app.id} className="card p-4">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                    <span className="badge bg-amber-50 text-amber-800">{app.version > 0 ? t("p6.mod.update", { v: app.version + 1 }) : t("p6.mod.newListing")}</span>
                    <span className="badge">{app.subject}</span>
                    <span className="badge">{t(app.audience === "teacher" ? "p6.ap.aud.teacher" : "p6.ap.aud.all")}</span>
                    <span className="text-slate-500">{author} · {app.submittedAt ? relativeTime(app.submittedAt, lang) : ""} · {(Buffer.byteLength(app.html) / 1024).toFixed(1)} KB</span>
                  </div>
                  <h3 className="font-semibold">{app.emoji} {app.title}</h3>
                  {app.description && <p className="text-sm text-slate-600">{app.description}</p>}
                  <AppReviewPreview html={app.html} title={app.title} flags={codeFlags(app.html)} />
                  <form action={reviewApp} className="mt-3 flex flex-wrap gap-2">
                    <input type="hidden" name="id" value={app.id} />
                    <input name="note" className="input max-w-xs flex-1" placeholder={t("mod.note")} />
                    <button name="decision" value="approve" className="btn btn-primary" data-testid="app-approve">{t("mod.approve")}</button>
                    <button name="decision" value="reject" className="btn btn-danger">{t("mod.reject")}</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          {liveApps.length > 0 && (
            <>
              <div className="mt-8" />
              <SectionHeader title={t("p6.mod.live")} />
              <ul className="card divide-y divide-slate-100 text-sm" data-testid="app-live">
                {liveApps.map(({ app, author }) => (
                  <li key={app.id} className="flex items-center gap-3 px-4 py-2">
                    <span className="flex-1 truncate">{app.emoji} {app.title} <span className="text-xs text-slate-400">· {author} · v{app.version}</span></span>
                    {app.status === "pending" && <span className="badge bg-amber-50 text-amber-800">{t("p6.ap.st.pending")}</span>}
                    <form action={unlistApp}><input type="hidden" name="id" value={app.id} /><button className="btn btn-sm btn-ghost text-rose-700">{t("p6.mod.unlist")}</button></form>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
      <>
      <SectionHeader title={`${t("mod.pending")} (${pending.length})`} />
      {pending.length === 0 ? (
        <EmptyState>{t("mod.empty")}</EmptyState>
      ) : (
        <ul className="space-y-4" data-testid="moderation-queue">
          {pending.map(({ post, author }) => (
            <li key={post.id} className="card p-4">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                <span className="badge bg-brand-50 text-brand-700">{t(`cm.kind.${post.kind}`)}</span>
                <span className="badge">{post.subject}</span>
                <span className="text-slate-500">{author} · {relativeTime(post.createdAt, lang)}</span>
              </div>
              <h3 className="font-semibold">{post.title}</h3>
              {post.description && <p className="text-sm text-slate-600">{post.description}</p>}
              <div className="mt-2 max-h-48 overflow-y-auto rounded-lg bg-slate-50 p-3 text-sm"><Markdown>{post.content}</Markdown></div>
              <form action={moderatePost} className="mt-3 flex flex-wrap gap-2">
                <input type="hidden" name="id" value={post.id} />
                <input name="note" className="input max-w-xs flex-1" placeholder={t("mod.note")} />
                <button name="decision" value="approve" className="btn btn-primary">{t("mod.approve")}</button>
                <button name="decision" value="reject" className="btn btn-danger">{t("mod.reject")}</button>
              </form>
            </li>
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <>
          <div className="mt-8" />
          <SectionHeader title={t("mod.recent")} />
          <ul className="card divide-y divide-slate-100 text-sm">
            {done.map(({ post, author }) => (
              <li key={post.id} className="flex items-center gap-3 px-4 py-2">
                <span className="flex-1 truncate">{post.title} <span className="text-xs text-slate-400">· {author}</span></span>
                <span className={`badge ${post.status === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{t(`cm.status.${post.status}`)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      </>
      )}
    </Page>
  );
}

/** Quick static hints for the reviewer (the app runs sandboxed with no network either way). */
function codeFlags(html: string) {
  const checks: [RegExp, string][] = [
    [/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource/, "network"],
    [/https?:\/\//, "external URL"],
    [/\beval\s*\(|new\s+Function\s*\(/, "eval"],
    [/localStorage|sessionStorage|indexedDB|document\.cookie/, "storage"],
    [/<form\b/i, "form"],
  ];
  return checks.filter(([re]) => re.test(html)).map(([, l]) => l);
}
