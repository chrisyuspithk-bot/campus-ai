import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { relativeTime } from "@/lib/format";
import { withBase } from "@/lib/base-path";
import { activeLockedAttempt } from "@/lib/p3/exam";
import { listPhotoPractice } from "@/lib/p7/photo";
import { ExamLocked } from "@/components/ExamLocked";
import { Page, PageHeader, SectionHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { PhotoPractice } from "./PhotoPractice";
import { addPhotoToWrongbook } from "./actions";

export const metadata: Metadata = { title: "影相練習" };

export default async function PhotoPracticePage({ searchParams }: PageProps<"/s/practice/photo">) {
  const user = await requireUser(["student"]);
  const lock = activeLockedAttempt(user.id);
  if (lock) return <ExamLocked assignmentId={lock.assignment.id} />;
  const { t, lang } = await getT();
  const sp = await searchParams;
  const recent = listPhotoPractice(user.id);

  return (
    <Page>
      <Link href="/s/practice" className="mb-3 inline-block text-sm text-slate-500 hover:underline">← {t("pr.title")}</Link>
      <PageHeader title={`📷 ${t("p7.photo.title")}`} subtitle={t("p7.photo.subtitle")} />
      {sp.added && <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800" data-testid="photo-wrong-added">{t("p7.photo.added")} <Link href="/s/wrongbook" className="underline">{t("rs2.openBook")}</Link></p>}
      <PhotoPractice />
      {recent.length > 0 && (
        <section className="mt-8">
          <SectionHeader title={t("p7.photo.recent")} />
          <ul className="card divide-y divide-slate-100 text-sm" data-testid="photo-recent">
            {recent.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                {p.imageFile ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={withBase(`/api/practice/photo/${p.id}/image`)} alt="" className="h-10 w-10 rounded object-cover" />
                ) : <span className="grid h-10 w-10 place-items-center rounded bg-slate-100" aria-hidden>⌨️</span>}
                <span className="min-w-0 flex-1 truncate">{p.ocrText.replace(/\$/g, "")}</span>
                <span className="badge">{p.subject}{p.topic && ` · ${p.topic}`}</span>
                {p.mock && <span className="badge bg-amber-50 text-amber-800">{t("p7.demo")}</span>}
                <span className="text-xs text-slate-400">{relativeTime(p.createdAt, lang)}</span>
                {p.conversationId && <Link href={`/ai/c/${p.conversationId}`} className="btn btn-sm">{t("p7.photo.continue")}</Link>}
                {p.inWrongbook ? (
                  <span className="badge bg-brand-50 text-brand-700">{t("rs2.inBook")}</span>
                ) : (
                  <form action={addPhotoToWrongbook}>
                    <input type="hidden" name="id" value={p.id} />
                    <SubmitButton className="btn btn-sm btn-ghost">{t("p7.photo.toWrongbook")}</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </Page>
  );
}
