import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { EmptyState, Page, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "講解短片" };

const dur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default async function VideosPage({ searchParams }: PageProps<"/s/videos">) {
  const user = await requireUser(["student"]);
  const { t } = await getT();
  const sp = await searchParams;
  const subject = typeof sp.subject === "string" ? sp.subject : "";
  const v = schema.videos;
  const all = db
    .select({ v, owner: schema.users.displayName })
    .from(v)
    .leftJoin(schema.users, eq(schema.users.id, v.ownerId))
    .where(eq(v.status, "published"))
    .orderBy(desc(v.publishedAt))
    .all();
  const subjects = [...new Set(all.map((r) => r.v.subject))];
  const rows = subject ? all.filter((r) => r.v.subject === subject) : all;
  const seen = new Set(db.select({ id: schema.videoViews.videoId }).from(schema.videoViews).where(eq(schema.videoViews.userId, user.id)).all().map((x) => x.id));

  return (
    <Page wide>
      <PageHeader title={t("nav.videos")} subtitle={t("p6.vid.subtitle")} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/s/videos" className={`btn btn-sm ${!subject ? "btn-primary" : ""}`}>{t("common.all")}</Link>
        {subjects.map((s) => <Link key={s} href={`/s/videos?subject=${encodeURIComponent(s)}`} className={`btn btn-sm ${subject === s ? "btn-primary" : ""}`}>{s}</Link>)}
      </div>
      {rows.length === 0 ? (
        <EmptyState>{t("p6.vid.empty")}</EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="video-list">
          {rows.map(({ v: x, owner }) => (
            <Link key={x.id} href={`/s/videos/${x.id}`} className="card group flex flex-col overflow-hidden transition hover:border-brand-300 hover:shadow" data-testid="video-card">
              <div className="relative grid aspect-video place-items-center bg-gradient-to-br from-brand-50 via-white to-amber-50 text-5xl">
                <span aria-hidden>{x.scenes[0]?.emoji ?? "🎬"}</span>
                <span className="absolute right-2 bottom-2 rounded bg-slate-900/75 px-1.5 py-0.5 text-xs text-white">{dur(x.scenes.reduce((s, c) => s + c.seconds, 0))}</span>
                {seen.has(x.id) && <span className="absolute top-2 left-2 badge bg-emerald-50 text-emerald-700">✓ {t("p6.vid.watched")}</span>}
              </div>
              <div className="flex flex-1 flex-col p-3">
                <div className="mb-1 flex flex-wrap gap-1.5 text-xs"><span className="badge">{x.subject}</span>{x.topic && <span className="badge bg-brand-50 text-brand-700">{x.topic}</span>}{x.level && <span className="badge">{x.level}</span>}</div>
                <h2 className="font-semibold group-hover:underline">{x.title}</h2>
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-slate-600">{x.keyPoints.slice(0, 3).map((k, i) => <li key={i}>{k}</li>)}</ul>
                <p className="mt-auto pt-2 text-xs text-slate-400">{owner}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Page>
  );
}
