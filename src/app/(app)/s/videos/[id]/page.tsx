import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { Page } from "@/components/ui";
import { ScenePlayer } from "@/components/p6/ScenePlayer";

export const metadata: Metadata = { title: "講解短片" };

export default async function VideoPage({ params }: PageProps<"/s/videos/[id]">) {
  const user = await requireUser(["student"]);
  const { t } = await getT();
  const { id } = await params;
  const v = schema.videos;
  const row = db.select({ v, owner: schema.users.displayName }).from(v).leftJoin(schema.users, eq(schema.users.id, v.ownerId)).where(and(eq(v.id, id), eq(v.status, "published"))).get();
  if (!row) notFound();
  const x = row.v;
  db.insert(schema.videoViews).values({ videoId: x.id, userId: user.id }).onConflictDoUpdate({ target: [schema.videoViews.videoId, schema.videoViews.userId], set: { viewedAt: new Date() } }).run();
  const more = db.select({ id: v.id, title: v.title, topic: v.topic }).from(v).where(and(eq(v.status, "published"), eq(v.subject, x.subject), ne(v.id, x.id))).limit(4).all();
  const tutor = db.select({ id: schema.tutors.slug }).from(schema.tutors).where(and(eq(schema.tutors.subject, x.subject), eq(schema.tutors.status, "published"))).get();
  const topicQ = `subject=${encodeURIComponent(x.subject)}&topic=${encodeURIComponent(x.topic)}`;

  return (
    <Page wide>
      <Link href="/s/videos" className="text-sm text-brand-700 hover:underline">← {t("nav.videos")}</Link>
      <h1 className="page-title mt-2">{x.title}</h1>
      <p className="mb-4 text-sm text-slate-500">{x.subject}{x.topic && ` · ${x.topic}`}{x.level && ` · ${x.level}`} · {row.owner}</p>
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <ScenePlayer scenes={x.scenes} title={x.title} />
        <aside className="space-y-4">
          <div className="card p-4 text-sm" data-testid="video-keypoints">
            <h2 className="mb-2 font-semibold">📌 {t("p6.vid.keyPoints")}</h2>
            <ol className="list-decimal space-y-1 pl-5">{x.keyPoints.map((k, i) => <li key={i}>{k}</li>)}</ol>
          </div>
          <div className="card space-y-2 p-4 text-sm">
            {x.topic && <Link href={`/s/practice/animate?${topicQ}`} className="btn w-full">🎬 {t("p6.pr.animate")}</Link>}
            {x.topic && <Link href="/s/practice" className="btn btn-primary w-full">{t("p6.anim.practise")}</Link>}
            {tutor && <Link href={`/ai?tutor=${tutor.id}`} className="btn btn-ghost w-full">{t("p6.vid.askTutor")}</Link>}
          </div>
          {more.length > 0 && (
            <div className="card p-4 text-sm">
              <h2 className="mb-2 font-semibold">{t("p6.vid.more")}</h2>
              <ul className="space-y-1">{more.map((m) => <li key={m.id}><Link href={`/s/videos/${m.id}`} className="hover:underline">▶ {m.title}</Link></li>)}</ul>
            </div>
          )}
          <details className="card p-4 text-sm"><summary className="cursor-pointer font-semibold">{t("p6.vid.transcript")}</summary><div className="mt-2 space-y-2 text-slate-600">{x.scenes.map((s, i) => <p key={i}>{s.narration}</p>)}</div></details>
        </aside>
      </div>
    </Page>
  );
}
