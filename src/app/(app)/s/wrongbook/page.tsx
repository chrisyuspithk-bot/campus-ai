import type { Metadata } from "next";
import Link from "next/link";
import { inArray } from "drizzle-orm";
import { RotateCcw, Trash2 } from "lucide-react";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { relativeTime } from "@/lib/format";
import { listWrong } from "@/lib/p4/wrongbook";
import { activeLockedAttempt } from "@/lib/p3/exam";
import { ExamLocked } from "@/components/ExamLocked";
import { Markdown } from "@/components/Markdown";
import { EmptyState, Page, PageHeader } from "@/components/ui";
import { removeWrong } from "./actions";

export const metadata: Metadata = { title: "錯題簿" };

const LETTERS = "ABCDEF";

export default async function WrongbookPage({ searchParams }: PageProps<"/s/wrongbook">) {
  const user = await requireUser(["student"]);
  const { t, lang } = await getT();
  const sp = await searchParams;
  const lock = activeLockedAttempt(user.id);
  if (lock) return <ExamLocked assignmentId={lock.assignment.id} />;
  const tab = sp.tab === "mastered" ? "mastered" : "active";
  const all = listWrong(user.id);
  const items = all.filter((w) => (tab === "mastered" ? w.mastered : !w.mastered));
  const topicKey = (w: (typeof all)[number]) => `${w.subject || "—"} · ${w.topic || t("wb.noTopic")}`;
  const groups = new Map<string, typeof items>();
  for (const w of items) groups.set(topicKey(w), [...(groups.get(topicKey(w)) ?? []), w]);
  const aIds = [...new Set(all.map((w) => w.assignmentId).filter((x): x is string => !!x))];
  const titles = new Map(aIds.length ? db.select({ id: schema.assignments.id, title: schema.assignments.title }).from(schema.assignments).where(inArray(schema.assignments.id, aIds)).all().map((a) => [a.id, a.title]) : []);
  const activeCount = all.filter((w) => !w.mastered).length;
  const show = (w: (typeof all)[number], v: string) => (!v.trim() ? t("rs.blank") : w.type === "mc" ? `${LETTERS[Number(v)] ?? "?"}. ${w.options[Number(v)] ?? ""}` : w.type === "short" ? v.split("|")[0] : v);

  return (
    <Page>
      <PageHeader
        title={t("wb.title")}
        subtitle={t("wb.subtitle")}
        actions={activeCount > 0 ? <Link href="/s/wrongbook/redo" className="btn btn-primary" data-testid="redo-all"><RotateCcw className="h-4 w-4" /> {t("wb.redoAll", { n: activeCount })}</Link> : null}
      />
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 self-start w-fit">
        {(["active", "mastered"] as const).map((s) => (
          <Link key={s} href={`/s/wrongbook?tab=${s}`} className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === s ? "bg-white shadow-sm" : "text-slate-600"}`}>
            {t(`wb.tab.${s}`)} <span className="text-slate-500 tabular-nums">{all.filter((w) => (s === "mastered" ? w.mastered : !w.mastered)).length}</span>
          </Link>
        ))}
      </div>
      {items.length === 0 ? (
        <EmptyState action={<Link href="/s/assignments?tab=graded" className="btn">{t("wb.fromResults")}</Link>}>{t(`wb.empty.${tab}`)}</EmptyState>
      ) : (
        <div className="space-y-6" data-testid="wrongbook-groups">
          {[...groups].map(([topic, list]) => (
            <section key={topic}>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="section-title">{topic}</h2>
                <span className="badge">{list.length}</span>
                {tab === "active" && (
                  <Link href={`/s/wrongbook/redo?topic=${encodeURIComponent(list[0].topic)}`} className="btn btn-sm ml-auto" data-testid="redo-topic"><RotateCcw className="h-3.5 w-3.5" /> {t("wb.redo")}</Link>
                )}
              </div>
              <ul className="space-y-2">
                {list.map((w) => (
                  <li key={w.id} className="card p-4 text-sm" data-testid="wrong-item">
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{w.assignmentId ? (titles.get(w.assignmentId) ?? t("wb.assignment")) : t("wb.practice")}</span>
                      <span>· {relativeTime(w.createdAt, lang)}</span>
                      {w.redoCount > 0 && <span>· {t("wb.redoStats", { n: w.redoCount, k: w.redoCorrect })}</span>}
                      <form action={removeWrong} className="ml-auto">
                        <input type="hidden" name="id" value={w.id} />
                        <button className="text-slate-400 hover:text-rose-600" aria-label={t("common.delete")} title={t("common.delete")}><Trash2 className="h-3.5 w-3.5" /></button>
                      </form>
                    </div>
                    <Markdown>{w.stem}</Markdown>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div className="rounded bg-rose-50 p-2"><span className="text-xs text-rose-700">{t("wb.mine")}</span><Markdown>{show(w, w.myAnswer)}</Markdown></div>
                      <details className="rounded bg-emerald-50 p-2"><summary className="cursor-pointer text-xs text-emerald-700">{t("wb.showAnswer")}</summary><Markdown>{show(w, w.answer)}</Markdown></details>
                    </div>
                    <Link href={`/s/wrongbook/redo?id=${w.id}`} className="mt-2 inline-block text-xs font-medium text-brand-600 hover:underline">{t("wb.redoOne")} →</Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Page>
  );
}
