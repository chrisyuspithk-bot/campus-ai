import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { activeLockedAttempt } from "@/lib/p3/exam";
import { animationFor, notesFor } from "@/lib/p6/topics";
import { ExamLocked } from "@/components/ExamLocked";
import { Page, PageHeader } from "@/components/ui";
import { ScenePlayer } from "@/components/p6/ScenePlayer";
import { startAdaptive } from "../actions";

export const metadata: Metadata = { title: "動畫講解" };

export default async function AnimatePage({ searchParams }: PageProps<"/s/practice/animate">) {
  const user = await requireUser(["student"]);
  const lock = activeLockedAttempt(user.id);
  if (lock) return <ExamLocked assignmentId={lock.assignment.id} />;
  const { t } = await getT();
  const sp = await searchParams;
  const subject = String(sp.subject ?? "數學");
  const topic = String(sp.topic ?? "因式分解");
  // A teacher's published explainer for this topic wins; else the built-in animation.
  const v = schema.videos;
  const video = db.select().from(v).where(and(eq(v.status, "published"), eq(v.topic, topic))).orderBy(desc(v.publishedAt)).get();
  const scenes = video?.scenes.length ? video.scenes : animationFor(topic);

  return (
    <Page>
      <Link href="/s/practice" className="text-sm text-brand-700 hover:underline">← {t("pr.title")}</Link>
      <PageHeader title={`🎬 ${t("p6.pr.animate")} · ${topic}`} subtitle={video ? t("p6.anim.fromVideo", { title: video.title }) : t("p6.anim.builtIn")} />
      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <ScenePlayer scenes={scenes} title={`${subject} · ${topic}`} />
        <aside className="card h-fit p-4 text-sm">
          <h2 className="mb-2 font-semibold">{t("p6.vid.keyPoints")}</h2>
          <ul className="list-disc space-y-1 pl-5">{(video?.keyPoints.length ? video.keyPoints : notesFor(topic)).map((n, i) => <li key={i}>{n}</li>)}</ul>
          <form action={startAdaptive} className="mt-4">
            <input type="hidden" name="subject" value={subject} />
            <input type="hidden" name="topic" value={topic} />
            <button className="btn btn-primary w-full">{t("p6.anim.practise")}</button>
          </form>
          {video && <Link href={`/s/videos/${video.id}`} className="btn mt-2 w-full">▶ {t("p6.anim.openVideo")}</Link>}
        </aside>
      </div>
    </Page>
  );
}
