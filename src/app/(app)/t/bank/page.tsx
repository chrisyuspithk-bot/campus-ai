import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import type { DictKey } from "@/lib/i18n/dict";
import { BANK_SUBJECTS, QUESTION_TYPES, bankTopics, getQuestion, canSeeQuestion, listQuestions } from "@/lib/p3/bank";
import { Markdown } from "@/components/Markdown";
import { SubmitButton } from "@/components/SubmitButton";
import { Page, PageHeader } from "@/components/ui";
import { addToPaper, createQuestion, deleteQuestion, generateQuestions, importQuestions } from "./actions";

export const metadata: Metadata = { title: "題庫" };

const LETTERS = "ABCDEF";
const stars = (d: number) => "★".repeat(d) + "☆".repeat(3 - d);
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function BankPage({ searchParams }: PageProps<"/t/bank">) {
  const user = await requireUser(["teacher"]);
  const { t } = await getT();
  const sp = await searchParams;
  const f = { subject: str(sp.subject), topic: str(sp.topic), difficulty: str(sp.difficulty), type: str(sp.type), scope: str(sp.scope), q: str(sp.q), tag: str(sp.tag) };
  const rows = listQuestions(user.id, f);
  const topics = bankTopics(user.id);
  const topicList = f.subject ? (topics[f.subject] ?? []) : [...new Set(Object.values(topics).flat())].sort();
  const selRaw = getQuestion(str(sp.sel));
  const sel = canSeeQuestion(user.id, selRaw) ? selRaw : rows[0];
  const parent = sel?.parentId ? getQuestion(sel.parentId) : undefined;
  const papers = db.select({ id: schema.papers.id, title: schema.papers.title, sections: schema.papers.sections }).from(schema.papers).where(eq(schema.papers.ownerId, user.id)).orderBy(desc(schema.papers.updatedAt)).all();
  const added = papers.find((p) => p.id === sp.added);
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const selHref = (id: string) => `/t/bank?${qs ? `${qs}&` : ""}sel=${id}`;
  const msg = sp.msg === "imported" ? t("bk.imported", { n: str(sp.n) }) : sp.msg === "generated" ? t("bk.generated", { n: str(sp.n) }) : null;
  const err = sp.err ? t((sp.err === "invalid" ? "p2.err.generic" : `p2.err.${sp.err}`) as DictKey) : null;

  const subjectSelect = (name = "subject", value = f.subject || BANK_SUBJECTS[0]) => (
    <select name={name} className="input" defaultValue={value} aria-label={t("bk.subject")}>
      {BANK_SUBJECTS.map((s) => <option key={s}>{s}</option>)}
    </select>
  );

  return (
    <Page wide>
      <PageHeader title={t("bk.title")} subtitle={t("bk.subtitle")} actions={<Link href="/t/papers" className="btn">{t("nav.papers")} →</Link>} />
      {(msg || added) && <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800" role="status">{msg ?? t("bk.added", { title: added!.title })}</p>}
      {err && <p className="mb-4 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-800" role="alert">{err}</p>}

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <details className="card p-4">
          <summary className="cursor-pointer font-medium">{t("bk.new")}</summary>
          <form action={createQuestion} className="mt-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {subjectSelect()}
              <select name="type" className="input" aria-label={t("bk.type")}>{QUESTION_TYPES.map((x) => <option key={x} value={x}>{t(`bk.type.${x}`)}</option>)}</select>
              <input name="topic" className="input" placeholder={t("bk.topic")} defaultValue={f.topic} />
              <select name="difficulty" className="input" defaultValue="2" aria-label={t("bk.difficulty")}>{[1, 2, 3].map((d) => <option key={d} value={d}>{stars(d)}</option>)}</select>
            </div>
            <textarea name="stem" className="input min-h-20" placeholder={t("bk.stem")} required />
            <textarea name="options" className="input min-h-16" placeholder={t("bk.options")} />
            <input name="answer" className="input" placeholder={t("bk.correct")} />
            <div className="flex items-center gap-2">
              <input name="marks" type="number" min={1} max={50} defaultValue={1} className="input w-20" aria-label={t("bk.marks")} />
              <span className="text-sm text-slate-500">{t("bk.marks")}</span>
              <SubmitButton className="btn btn-primary ml-auto">{t("bk.create")}</SubmitButton>
            </div>
          </form>
        </details>
        <details className="card p-4">
          <summary className="cursor-pointer font-medium">✨ {t("bk.ai")}</summary>
          <form action={generateQuestions} className="mt-3 space-y-2" data-testid="bank-ai">
            <div className="grid grid-cols-2 gap-2">
              {subjectSelect()}
              <input name="topic" className="input" placeholder={t("bk.topic")} defaultValue={f.topic} />
              <select name="type" className="input" aria-label={t("bk.type")}>
                <option value="any">{t("bk.any")}</option>
                {QUESTION_TYPES.filter((x) => x !== "upload").map((x) => <option key={x} value={x}>{t(`bk.type.${x}`)}</option>)}
              </select>
              <input name="count" type="number" min={1} max={8} defaultValue={3} className="input" aria-label={t("bk.aiCount")} />
            </div>
            <SubmitButton>{t("bk.aiGo")}</SubmitButton>
          </form>
        </details>
        <details className="card p-4">
          <summary className="cursor-pointer font-medium">{t("bk.import")}</summary>
          <form action={importQuestions} className="mt-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {subjectSelect()}
              <input name="topic" className="input" placeholder={t("bk.topic")} />
            </div>
            <textarea name="text" className="input min-h-24 font-mono text-xs" placeholder="因式分解 x²−1 | (x+1)(x−1);(x−1)²;x(x−1);(x+1)² | A" required />
            <p className="text-xs text-slate-500">{t("bk.importHint")}</p>
            <SubmitButton>{t("bk.importGo")}</SubmitButton>
          </form>
        </details>
      </div>

      <div className="grid gap-4 lg:grid-cols-[13rem_1fr_24rem]">
        <form className="card h-fit space-y-3 p-4 text-sm" aria-label={t("bk.filter")}>
          <div><label className="label" htmlFor="f-q">{t("common.search")}</label><input id="f-q" name="q" className="input" defaultValue={f.q} /></div>
          <div>
            <label className="label" htmlFor="f-subject">{t("bk.subject")}</label>
            <select id="f-subject" name="subject" className="input" defaultValue={f.subject}><option value="">{t("common.all")}</option>{BANK_SUBJECTS.map((s) => <option key={s}>{s}</option>)}</select>
          </div>
          <div>
            <label className="label" htmlFor="f-topic">{t("bk.topic")}</label>
            <select id="f-topic" name="topic" className="input" defaultValue={f.topic}><option value="">{t("common.all")}</option>{topicList.map((s) => <option key={s}>{s}</option>)}</select>
          </div>
          <div>
            <label className="label" htmlFor="f-diff">{t("bk.difficulty")}</label>
            <select id="f-diff" name="difficulty" className="input" defaultValue={f.difficulty}><option value="">{t("common.all")}</option>{[1, 2, 3].map((d) => <option key={d} value={d}>{stars(d)}</option>)}</select>
          </div>
          <div>
            <label className="label" htmlFor="f-type">{t("bk.type")}</label>
            <select id="f-type" name="type" className="input" defaultValue={f.type}><option value="">{t("common.all")}</option>{QUESTION_TYPES.map((x) => <option key={x} value={x}>{t(`bk.type.${x}`)}</option>)}</select>
          </div>
          <div>
            <label className="label" htmlFor="f-scope">{t("bk.scope")}</label>
            <select id="f-scope" name="scope" className="input" defaultValue={f.scope}><option value="">{t("common.all")}</option><option value="school">{t("bk.scope.school")}</option><option value="mine">{t("bk.scope.mine")}</option></select>
          </div>
          <div>
            <span className="label">{t("p7.bk.tags")}</span>
            <div className="flex flex-wrap gap-1" data-testid="bank-tag-chips">
              {["", "hkdse"].map((tag) => (
                <label key={tag || "all"} className={`badge cursor-pointer ${f.tag === tag ? "bg-brand-100 text-brand-800" : "hover:bg-slate-200"}`}>
                  <input type="radio" name="tag" value={tag} defaultChecked={f.tag === tag} className="sr-only" />
                  {tag ? "HKDSE" : t("common.all")}
                </label>
              ))}
            </div>
            <Link href={`/t/bank?tag=hkdse${f.subject ? `&subject=${encodeURIComponent(f.subject)}` : ""}`} className="mt-1 inline-block text-xs text-brand-700 hover:underline" data-testid="bank-hkdse">{t("p7.bk.hkdseOnly")}</Link>
          </div>
          <button className="btn btn-primary w-full">{t("bk.filter")}</button>
        </form>

        <section className="card min-w-0 self-start">
          <div className="border-b border-slate-100 px-4 py-2 text-sm text-slate-500">{t("bk.count", { n: rows.length })}</div>
          {rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">{t("bk.empty")}</p>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto" data-testid="bank-list">
              {rows.map((q) => (
                <li key={q.id} className={sel?.id === q.id ? "bg-brand-50" : "hover:bg-slate-50"}>
                  <Link href={selHref(q.id)} scroll={false} className="block px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-semibold text-slate-700">{q.code}</span>
                      <span className="badge">{t(`bk.type.${q.type}`)}</span>
                      <span className="text-slate-500">{q.subject} · {q.topic || "—"} {q.level && `· ${q.level}`}</span>
                      <span className="text-amber-500" aria-label={`${t("bk.difficulty")} ${q.difficulty}`}>{stars(q.difficulty)}</span>
                      {q.scope === "mine" && <span className="badge bg-sky-50 text-sky-700">{t("bk.scope.mine")}</span>}
                      {q.parentId && <span className="badge">{t("bk.variants")}</span>}
                      {q.tags.includes("hkdse") && <span className="badge bg-violet-50 text-violet-700">HKDSE</span>}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-700">{q.stem.replace(/\$/g, "")}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="card h-fit p-4" aria-label={t("bk.preview")} data-testid="bank-preview">
          {!sel ? (
            <p className="text-sm text-slate-500">{t("bk.pickHint")}</p>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-sm font-semibold">{sel.code}</span>
                <span className="badge">{t(`bk.type.${sel.type}`)}</span>
                <span className="badge">{t("p3.marks", { n: sel.marks })}</span>
                <span className="text-amber-500">{stars(sel.difficulty)}</span>
              </div>
              {parent && <p className="mb-2 text-xs text-slate-500">{t("bk.variant.of", { code: parent.code })}</p>}
              <Markdown>{sel.stem}</Markdown>
              {sel.options.length > 0 && (
                <ol className="mt-2 space-y-1 text-sm">
                  {sel.options.map((o, k) => <li key={k} className="flex gap-2"><span className="font-medium">{LETTERS[k]}.</span><Markdown>{o}</Markdown></li>)}
                </ol>
              )}
              <details className="mt-3 rounded-lg bg-slate-50 p-2 text-sm">
                <summary className="cursor-pointer text-slate-600">{t("bk.showAnswer")}</summary>
                <div className="mt-1 whitespace-pre-wrap">{sel.type === "mc" ? `${LETTERS[Number(sel.answer)]}. ${sel.options[Number(sel.answer)] ?? ""}` : sel.answer.split("|").join(" / ")}</div>
              </details>
              {sel.tags.length > 0 && <p className="mt-2 text-xs text-slate-500">{t("bk.tags")}: {sel.tags.join("、")}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/t/bank/${sel.id}/variants`} className="btn btn-sm">{t("bk.variants")}</Link>
                {sel.scope === "mine" && sel.ownerId === user.id && (
                  <form action={deleteQuestion}><input type="hidden" name="id" value={sel.id} /><button className="btn btn-sm btn-danger">{t("bk.delete")}</button></form>
                )}
              </div>
              {papers.length > 0 && (
                <form action={addToPaper} className="mt-3 flex gap-2" data-testid="add-to-paper">
                  <input type="hidden" name="questionId" value={sel.id} />
                  <input type="hidden" name="back" value={selHref(sel.id)} />
                  <select name="paperId" className="input py-1 text-sm" aria-label={t("bk.addToPaper")}>
                    {papers.map((p) => <option key={p.id} value={p.id}>{p.title}{p.sections.some((s) => s.questionIds.includes(sel.id)) ? ` ✓` : ""}</option>)}
                  </select>
                  <SubmitButton className="btn btn-primary btn-sm shrink-0">{t("bk.addToPaper")}</SubmitButton>
                </form>
              )}
            </>
          )}
        </aside>
      </div>
    </Page>
  );
}
