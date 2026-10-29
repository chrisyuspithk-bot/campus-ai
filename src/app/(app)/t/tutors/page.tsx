import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { canEditTutor, listTutorsWithFileCounts } from "@/lib/tutors";
import { modelsFor } from "@/lib/models";
import { createTutor } from "./actions";
import { TutorEditor } from "./TutorEditor";

export const metadata: Metadata = { title: "導師與知識庫" };

export default async function TeacherTutors({ searchParams }: PageProps<"/t/tutors">) {
  const user = await requireUser(["teacher"]);
  const { t } = await getT();
  const sp = await searchParams;
  const tutors = listTutorsWithFileCounts().filter((x) => canEditTutor(user, x));
  const selectedId = typeof sp.id === "string" ? sp.id : tutors[0]?.id;
  const selected = tutors.find((x) => x.id === selectedId);
  const files = selected
    ? db.select().from(schema.tutorFiles).where(eq(schema.tutorFiles.tutorId, selected.id)).orderBy(asc(schema.tutorFiles.createdAt)).all()
    : [];
  // Teachers can whitelist any model students can use (the tutor is student-facing).
  const models = modelsFor("student").map((m) => ({ id: m.id, displayName: m.displayName }));

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <aside className="border-b border-slate-200 bg-white md:w-64 md:shrink-0 md:overflow-y-auto md:border-r md:border-b-0">
        <div className="flex items-center justify-between px-4 pt-5 pb-2">
          <h1 className="section-title">{t("tt.mine")}</h1>
        </div>
        <ul className="px-2" data-testid="tutor-list">
          {tutors.map((x) => (
            <li key={x.id}>
              <Link
                href={`/t/tutors?id=${x.id}`}
                aria-current={x.id === selected?.id ? "page" : undefined}
                className={`flex items-center gap-2 rounded-lg px-2 py-2 text-sm ${x.id === selected?.id ? "bg-brand-50 font-medium text-brand-800" : "hover:bg-slate-100"}`}
              >
                <span aria-hidden>{x.emoji}</span>
                <span className="flex-1 truncate">{x.name}</span>
                <span className={`h-2 w-2 rounded-full ${x.status === "published" ? "bg-teal-500" : "bg-slate-300"}`} title={x.status === "published" ? t("tt.published") : t("tt.draft")} />
              </Link>
            </li>
          ))}
        </ul>
        <form action={createTutor} className="p-3">
          <button className="btn w-full">{t("tt.new")}</button>
        </form>
      </aside>
      <div className="min-w-0 flex-1 overflow-y-auto">
        {selected ? (
          <TutorEditor
            key={selected.id + selected.updatedAt.getTime()}
            tutor={{
              id: selected.id,
              slug: selected.slug,
              name: selected.name,
              nameEn: selected.nameEn,
              subject: selected.subject,
              emoji: selected.emoji,
              levels: selected.levels,
              strategy: selected.strategy,
              tagline: selected.tagline,
              blurb: selected.blurb,
              will: selected.will,
              wont: selected.wont,
              topics: selected.topics,
              systemPrompt: selected.systemPrompt,
              modelWhitelist: selected.modelWhitelist,
              status: selected.status,
            }}
            files={files.map((f) => ({ id: f.id, filename: f.filename, size: f.size, status: f.status, chunkCount: f.chunkCount }))}
            models={models}
          />
        ) : (
          <p className="p-8 text-slate-500">{t("tt.selectHint")}</p>
        )}
      </div>
    </div>
  );
}
