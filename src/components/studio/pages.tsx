import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, ne, and } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { featuresFor } from "@/lib/features";
import { getT } from "@/lib/i18n/server";
import { relativeTime } from "@/lib/format";
import { LIBRARY_ACCEPT } from "@/lib/extract";
import { listLibrary } from "@/lib/library";
import { ownStudioItem } from "@/lib/studio/server";
import { STUDIO_KINDS, type Flashcards, type Mindmap, type Quiz, type StudioKind, type Worksheet, type YoutubeNotes } from "@/lib/studio/types";
import { EmptyState, Page, PageHeader, SectionHeader } from "@/components/ui";
import type { DictKey } from "@/lib/i18n/dict";
import { StudioHome } from "./StudioHome";
import { MindmapView } from "./MindmapView";
import { FlashcardsView } from "./FlashcardsView";
import { QuizView } from "./QuizView";
import { WorksheetView } from "./WorksheetView";
import { YoutubeView } from "./YoutubeView";

const ICON: Record<string, string> = { mindmap: "🧠", flashcards: "🗂️", quiz: "✅", worksheet: "📄", youtube: "▶️" };

/** `/s/studio` and `/t/studio`: pick a source, make an output, see recent outputs. */
export async function StudioIndexPage({ teacher, item }: { teacher: boolean; item?: string }) {
  const user = await requireUser([teacher ? "teacher" : "student"]);
  const { t, lang } = await getT();
  const features = featuresFor(user.role);
  const base = teacher ? "/t/studio" : "/s/studio";
  const title = teacher ? t("st.tTitle") : t("st.title");
  if (!features.studio) {
    return (
      <Page>
        <PageHeader title={title} />
        <EmptyState>{t("p2.err.feature_off")}</EmptyState>
      </Page>
    );
  }
  const all = listLibrary(user.id);
  const recent = all.filter((r) => r.source === "studio").slice(0, 8);
  const sources = all.filter((r) => r.hasText).map((r) => ({ id: r.id, title: r.title }));
  const drafts = teacher
    ? db
        .select({ id: schema.drafts.id, title: schema.drafts.title })
        .from(schema.drafts)
        .where(and(eq(schema.drafts.ownerId, user.id), ne(schema.drafts.status, "archived")))
        .orderBy(desc(schema.drafts.updatedAt))
        .all()
    : [];

  return (
    <Page>
      <PageHeader title={title} subtitle={teacher ? t("st.tSubtitle") : t("st.subtitle")} />
      <StudioHome teacher={teacher} youtube={features.youtube} library={sources} drafts={drafts} initialItem={sources.some((s) => s.id === item) ? item : undefined} accept={LIBRARY_ACCEPT.join(",")} />
      <section className="mt-8">
        <SectionHeader title={t("st.recent")} href={teacher ? undefined : "/s/library"} linkLabel={t("common.allArrow")} />
        {recent.length === 0 ? (
          <EmptyState>{t("st.noRecent")}</EmptyState>
        ) : (
          <ul className="card divide-y divide-slate-100" data-testid="studio-recent">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span aria-hidden>{ICON[r.kind]}</span>
                <span className="text-slate-500">{t(`lib.kind.${r.kind}` as DictKey)}：</span>
                <Link href={`${base}/${r.kind}/${r.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{r.title}</Link>
                <span className="text-slate-500">{relativeTime(r.updatedAt, lang)}</span>
                <Link href={`${base}/${r.kind}/${r.id}`} className="btn btn-sm">{t("common.open")}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  );
}

/** `/{s,t}/studio/:kind/:id` viewers. */
export async function StudioItemPage({ teacher, kind, id, saveAsDraft }: { teacher: boolean; kind: string; id: string; saveAsDraft?: (id: string, markdown: string) => Promise<void> }) {
  const user = await requireUser([teacher ? "teacher" : "student"]);
  const { t } = await getT();
  const item = ownStudioItem(user.id, id);
  if (!item || item.kind !== kind || !(STUDIO_KINDS as readonly string[]).includes(kind)) notFound();
  const base = teacher ? "/t/studio" : "/s/studio";

  let body: React.ReactNode;
  switch (item.kind as StudioKind) {
    case "mindmap":
      body = <MindmapView id={id} initial={item.data as Mindmap} />;
      break;
    case "flashcards":
      body = <FlashcardsView id={id} initial={item.data as Flashcards} />;
      break;
    case "quiz":
      body = <QuizView id={id} initial={item.data as Quiz} wrongbook={!teacher} />;
      break;
    case "worksheet":
      body = <WorksheetView id={id} initial={(item.data as Worksheet).markdown} saveAsDraft={saveAsDraft!.bind(null, id)} />;
      break;
    case "youtube":
      {
        const notes = item.data as YoutubeNotes;
        body = featuresFor(user.role).youtube ? (
          <YoutubeView
            notes={notes}
            copyright={t("st.yt.copyright")}
            openLabel={t("st.yt.open")}
            timelineLabel={t("st.yt.timeline")}
            basisLabel={notes.basis ? t(`st.yt.basis.${notes.basis}` as DictKey) : undefined}
          />
        ) : (
          <EmptyState>{t("st.yt.off")}</EmptyState>
        );
      }
  }

  return (
    <Page wide>
      <Link href={base} className="text-sm text-brand-700 hover:underline">{t("st.back")}</Link>
      <PageHeader title={<><span aria-hidden>{ICON[item.kind]}</span> {item.title}</>} subtitle={`${t(`lib.kind.${item.kind}` as DictKey)} · ${t("st.saved")}`} />
      {body}
    </Page>
  );
}
