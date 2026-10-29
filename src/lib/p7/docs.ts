import "server-only";
import type { CurrentUser } from "@/lib/auth/dal";
import type { DraftType } from "@/lib/db/schema";
import { runStructured } from "@/lib/ai/run";
import { canManageClass, getClass } from "@/lib/p3/classes";
import { classReport } from "@/lib/p4/stats";

// P7 (G8) admin / pastoral document drafts: 成績單 report card, 通知信 parent notice, 進度報告 progress report.
// The AI fills a Markdown draft from the class's real numbers when a class is picked (no student names are sent
// to the model — rows are referred to by login id); without a key a template is filled locally.

export const DOC_TYPES = ["report_card", "notice", "progress_report"] as const satisfies readonly DraftType[];
export type DocType = (typeof DOC_TYPES)[number];

const BRIEF: Record<DocType, string> = {
  report_card: "a class REPORT CARD draft (成績單): a Markdown table of each student id with average %, submissions, open wrongbook items and a one-line teacher remark; then a short class summary.",
  notice: "a formal PARENT NOTICE letter (通知信) from the school in Traditional Chinese: heading, date line, salutation 敬啟者, body paragraphs, a reply slip (回條) section, signature block. Use the teacher's topic; use the class numbers only if relevant.",
  progress_report: "a class PROGRESS REPORT (進度報告) for the panel head: overview, assignment completion, average performance, students needing support (by id), next-step teaching actions.",
};

type Stats = { className: string; subject: string; rows: { id: string; avg: number | null; submitted: number; total: number; wrongOpen: number; chats7d: number }[] };

function classStats(user: CurrentUser, classId: string): Stats | null {
  const c = getClass(classId);
  if (!classId || !canManageClass(user, c)) return null;
  return {
    className: c.name,
    subject: c.subject,
    rows: classReport(c.id).map((r) => ({ id: r.username, avg: r.avg, submitted: r.submitted, total: r.total, wrongOpen: r.wrongOpen, chats7d: r.chats7d })),
  };
}

function mockDoc(type: DocType, topic: string, s: Stats | null, school: string) {
  const today = new Date().toLocaleDateString("zh-HK", { year: "numeric", month: "long", day: "numeric" });
  const cls = s ? `${s.className} ${s.subject}` : "（班別）";
  const avg = s?.rows.filter((r) => r.avg != null).map((r) => r.avg!) ?? [];
  const mean = avg.length ? Math.round(avg.reduce((a, b) => a + b, 0) / avg.length) : null;
  if (type === "report_card") {
    return `# ${cls} 成績單（草稿）\n\n> 示範模式：按班級數據自動填寫，請老師核對及補充評語。\n\n| 學生 | 平均 % | 已交 | 未掌握錯題 | 評語 |\n|---|---|---|---|---|\n${(s?.rows ?? []).map((r) => `| ${r.id} | ${r.avg ?? "—"} | ${r.submitted}/${r.total} | ${r.wrongOpen} | ${r.avg == null ? "未有成績" : r.avg >= 80 ? "表現優異，繼續保持。" : r.avg >= 60 ? "表現穩定，注意細節。" : "需要加強基礎，建議重做錯題。"} |`).join("\n")}\n\n**全班平均：** ${mean ?? "—"}%\n`;
  }
  if (type === "notice") {
    return `# ${school}\n\n## 家長通知：${topic || "（主題）"}\n\n${today}\n\n敬啟者：\n\n本校謹定於（日期）就「${topic || "（主題）"}」安排有關活動／事項，詳情如下：\n\n1. 對象：${cls}\n2. 日期及時間：＿＿＿＿\n3. 地點：＿＿＿＿\n4. 注意事項：＿＿＿＿\n\n如有查詢，請致電校務處與（負責老師）聯絡。\n\n此致\n貴家長\n\n校長　　　　謹啟\n\n---\n\n### 回條\n\n本人已知悉「${topic || "（主題）"}」安排。\n\n學生姓名：＿＿＿＿　班別：＿＿　家長簽署：＿＿＿＿　日期：＿＿＿＿\n\n> 示範模式草稿，請老師修改後再發出。`;
  }
  const weak = (s?.rows ?? []).filter((r) => r.avg != null && r.avg < 60).map((r) => r.id);
  return `# ${cls} 進度報告（草稿）\n\n> 示範模式：按班級數據自動填寫。\n\n## 概覽\n- 學生人數：${s?.rows.length ?? "—"}\n- 全班平均：${mean ?? "—"}%\n- 功課完成：${s ? s.rows.reduce((a, r) => a + r.submitted, 0) : "—"} / ${s ? s.rows.reduce((a, r) => a + r.total, 0) : "—"}\n\n## 需要支援的學生\n${weak.length ? weak.map((w) => `- ${w}`).join("\n") : "- 暫無"}\n\n## 下一步教學行動\n1. 針對常見錯題安排重溫。\n2. 為需要支援的學生安排自適應練習。\n3. ${topic || "（補充）"}\n`;
}

export async function draftDocument(user: CurrentUser, opts: { type: DocType; classId: string; topic: string; school: string }) {
  const s = classStats(user, opts.classId);
  const topic = opts.topic.trim().slice(0, 200);
  return runStructured({
    user,
    source: "drafts",
    input: topic || opts.type,
    system: [
      `You draft ${BRIEF[opts.type]}`,
      "Write in Traditional Chinese (Hong Kong formal written style). Output Markdown. Never invent student names — refer to students only by the ids given. Leave ＿＿＿ blanks for details you do not know.",
      'JSON shape: {"title":string,"content":string}.',
    ].join("\n"),
    prompt: JSON.stringify({ school: opts.school, topic, class: s ? { name: s.className, subject: s.subject, students: s.rows } : null }),
    normalize: (raw) => {
      const o = raw as { title?: unknown; content?: unknown };
      if (typeof o?.content !== "string" || !o.content.trim()) return null;
      return { title: typeof o.title === "string" && o.title.trim() ? o.title.trim().slice(0, 120) : "", content: o.content.slice(0, 60_000) };
    },
    mock: () => ({ title: "", content: mockDoc(opts.type, topic, s, opts.school) }),
  }).then((r) => ({ ...r, stats: s }));
}
