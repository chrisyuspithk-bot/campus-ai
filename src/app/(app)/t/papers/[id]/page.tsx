import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { getSetting } from "@/lib/settings";
import { paperQuestions } from "@/lib/p3/exam";
import { Markdown } from "@/components/Markdown";
import { Page } from "@/components/ui";
import { PrintButton } from "./PrintButton";
import QRCode from "qrcode";
import { qrPayload } from "@/lib/p5/qr";
import { listClassesFor, listMembers } from "@/lib/p3/classes";

export const metadata: Metadata = { title: "試卷預覽" };

const LETTERS = "ABCDEF";

/** Printable paper; `?answers=1` prints the answer key; `?class=<id>` prints one copy per student with a scan QR (P5). */
export default async function PaperPreview({ params, searchParams }: PageProps<"/t/papers/[id]">) {
  const user = await requireUser(["teacher"]);
  const { t } = await getT();
  const { id } = await params;
  const sp = await searchParams;
  const keyMode = sp.answers === "1";
  const paper = db.select().from(schema.papers).where(and(eq(schema.papers.id, id), eq(schema.papers.ownerId, user.id))).get();
  if (!paper) notFound();
  const qs = paperQuestions(paper.id);
  const total = qs.reduce((s, q) => s + q.marks, 0);
  const classes = keyMode ? [] : listClassesFor(user.id);
  const cls = typeof sp.class === "string" ? classes.find((c) => c.id === sp.class) : undefined;
  const copies = cls
    ? await Promise.all(listMembers(cls.id).map(async (m) => ({ m, qr: await QRCode.toString(qrPayload({ paperId: paper.id, username: m.username, page: 1 }), { type: "svg", margin: 0, errorCorrectionLevel: "M" }) })))
    : [null];

  return (
    <Page>
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <Link href="/t/papers" className="btn btn-sm">{t("p3.back")}</Link>
        <Link href={`/t/papers/${paper.id}/edit`} className="btn btn-sm">{t("pp.edit")}</Link>
        <Link href={`/t/papers/${paper.id}${keyMode ? "" : "?answers=1"}`} className="btn btn-sm">{keyMode ? t("pp.printPaper") : t("pp.printKey")}</Link>
        <PrintButton />
        <Link href={`/t/assignments/new?paper=${paper.id}`} className="btn btn-sm btn-primary">{t("pp.assign")}</Link>
      </div>
      {!keyMode && classes.length > 0 && (
        <div className="card mx-auto mb-4 max-w-3xl p-3 text-sm print:hidden" data-testid="paper-qr-print">
          <div className="font-medium">{t("pq.qrPrint")}</div>
          <p className="mb-2 text-xs text-slate-500">{t("pq.qrHint")}</p>
          <div className="flex flex-wrap gap-2">
            {cls && <Link href={`/t/papers/${paper.id}`} className="btn btn-sm">{paper.title}</Link>}
            {classes.map((c) => <Link key={c.id} href={`/t/papers/${paper.id}?class=${c.id}`} className={`btn btn-sm ${cls?.id === c.id ? "btn-primary" : ""}`}>{t("pq.forClass", { name: `${c.name} ${c.subject}`, n: c.memberCount })}</Link>)}
          </div>
        </div>
      )}
      {copies.map((copy, ci) => { let n = 0; return (
      <article key={copy?.m.id ?? "paper"} className={`card mx-auto mb-6 max-w-3xl p-8 print:mb-0 print:border-0 print:shadow-none ${ci < copies.length - 1 ? "print:break-after-page" : ""}`} data-testid="paper-preview">
        <header className="relative mb-6 border-b border-slate-200 pb-4 text-center">
          {copy && (
            <div className="absolute right-0 top-0 w-20 text-center" data-testid="paper-qr">
              <div className="h-20 w-20 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: copy.qr }} />
              <div className="mt-0.5 text-[9px] leading-tight text-slate-400">{copy.m.username} · p1<br />{t("pq.qrCaption")}</div>
            </div>
          )}
          <div className="text-sm text-slate-500">{getSetting("schoolName")}</div>
          <h1 className="mt-1 text-xl font-bold">{paper.title}{keyMode && `（${t("pp.answerKey")}）`}</h1>
          <div className="mt-1 text-sm text-slate-600">{t("p3.minutes", { n: paper.durationMin })} · {t("pp.total")} {total}</div>
          {!keyMode && <div className="mt-4 text-left text-sm">{copy ? <>{t("pp.name").split(/[_＿]/)[0]}<b>{copy.m.displayName}（{copy.m.username}）</b></> : t("pp.name")}</div>}
        </header>
        {paper.sections.map((s, si) => (
          <section key={si} className="mb-6">
            <h2 className="mb-3 font-semibold">{s.title}</h2>
            <ol className="space-y-4">
              {qs.filter((q) => q.section === s.title && s.questionIds.includes(q.id)).map((q) => {
                n++;
                return (
                  <li key={q.id} className="break-inside-avoid">
                    <div className="flex gap-2">
                      <span className="font-medium">{n}.</span>
                      <div className="min-w-0 flex-1">
                        <Markdown>{q.stem}</Markdown>
                        {q.options.length > 0 && (
                          <ol className="mt-1 grid gap-1 text-sm sm:grid-cols-2">
                            {q.options.map((o, k) => <li key={k} className={`flex gap-2 ${keyMode && String(k) === q.answer ? "font-semibold text-emerald-700" : ""}`}><span>{LETTERS[k]}.</span><Markdown>{o}</Markdown></li>)}
                          </ol>
                        )}
                        {keyMode && q.type !== "mc" && <p className="mt-1 rounded bg-emerald-50 p-2 text-sm whitespace-pre-wrap text-emerald-800">{q.answer.split("|")[0]}</p>}
                        {!keyMode && q.type === "long" && <div className="mt-2 h-28 rounded border border-dashed border-slate-300" />}
                      </div>
                      <span className="shrink-0 text-sm text-slate-500">({q.marks})</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </article>
      ); })}
    </Page>
  );
}
