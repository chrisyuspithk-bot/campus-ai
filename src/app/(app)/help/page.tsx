import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { getT } from "@/lib/i18n/server";
import { Page, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "使用說明" };

const ZH = [
  ["AI 對話", "左欄「AI 對話」或右上 [AI] 面板都可以同 AI 傾。對話會自動儲存，可以釘選、改名同搜尋。"],
  ["科目導師", "導師會一步步引導你思考，唔會直接俾答案。揀「科目導師」→「開始對話」。"],
  ["數學公式", "AI 回覆支援 Markdown 同 LaTeX，例如 $x^2$。"],
  ["配額", "學校為每位用戶設定每日／每月 AI 用量。用完後請等第二日或者問老師。"],
  ["灰色項目", "標住 P2–P6 嘅功能會陸續開放。"],
];
const EN = [
  ["AI chat", "Use “AI Chat” in the left menu or the [AI] side panel. Chats are saved automatically and can be pinned, renamed and searched."],
  ["Subject tutors", "Tutors guide you step by step instead of giving answers. Open “Subject tutors” → “Start chat”."],
  ["Maths", "Replies support Markdown and LaTeX, e.g. $x^2$."],
  ["Quota", "The school sets a daily/monthly AI allowance per user. When it runs out, try again tomorrow or ask a teacher."],
  ["Gray items", "Features marked P2–P6 will open in later phases."],
];

export default async function HelpPage() {
  await requireUser();
  const { t, lang } = await getT();
  return (
    <Page>
      <PageHeader title={t("help.title")} />
      <div className="grid gap-3 sm:grid-cols-2">
        {(lang === "en" ? EN : ZH).map(([title, body]) => (
          <div key={title} className="card p-5">
            <h2 className="mb-1 font-semibold">{title}</h2>
            <p className="text-sm text-slate-600">{body}</p>
          </div>
        ))}
      </div>
    </Page>
  );
}
