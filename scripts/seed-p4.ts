/* P4 demo data: a marked factorisation quiz (done / in progress / pending), wrongbook items, recent activity.
 * Idempotent: runs once per database (marker setting `p4SeedInit`). Needs the P3 seed (class 3A, paper A). */
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import * as schema from "../src/lib/db/schema";

type DB = BetterSQLite3Database<typeof schema>;
const id = () => randomUUID().replace(/-/g, "").slice(0, 16);
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ago = (h: number) => new Date(Date.now() - h * 3_600_000);
const norm = (s: string) => s.replace(/\s+/g, "").replace(/[，,。.]/g, "").toLowerCase();

const LONG = {
  high: "(a) x² + 5x + 6 = (x+2)(x+3)\n(b) 長 = x+3 米\n(c) 當 x = 4，闊 = 6 米，長 = 7 米，周界 = 2(6+7) = 26 米",
  mid: "(a) (x+2)(x+3)\n(b) 長係 x+3\n(c) 闊 6 長 7，周界 = 6+7 = 13 米",
  low: "(a) (x+1)(x+6)\n(b) x+6",
};

export function seedP4(db: DB) {
  if (db.select().from(schema.settings).where(eq(schema.settings.key, "p4SeedInit")).get()) return;
  const t09 = db.select().from(schema.users).where(eq(schema.users.username, "t09")).get();
  const paper = db.select().from(schema.papers).where(eq(schema.papers.title, "中三數學測驗 A：因式分解")).get();
  const c3A = t09 && db.select().from(schema.classes).where(and(eq(schema.classes.teacherId, t09.id), eq(schema.classes.name, "3A"), eq(schema.classes.subject, "數學"))).get();
  if (!t09 || !paper || !c3A) {
    console.log("• P4 seed skipped (P3 demo data missing)");
    return;
  }
  const members = db.select({ id: schema.classMembers.userId }).from(schema.classMembers).where(eq(schema.classMembers.classId, c3A.id)).all().map((m) => m.id);
  const students = db.select().from(schema.users).where(inArray(schema.users.id, members)).all().sort((a, b) => a.username.localeCompare(b.username));
  const qids = paper.sections.flatMap((s) => s.questionIds);
  const qs = db.select().from(schema.questions).where(inArray(schema.questions.id, qids)).all();
  const qById = new Map(qs.map((q) => [q.id, q]));
  const ordered = qids.map((q) => qById.get(q)!).filter(Boolean);
  const maxScore = ordered.reduce((s, q) => s + q.marks, 0);

  // ---- Last week's factorisation quiz: marked in the P4 workbench -----------------------------
  const due = ago(24 * 5);
  const aid = id();
  db.insert(schema.assignments).values({
    id: aid, teacherId: t09.id, classId: c3A.id, paperId: paper.id, title: "因式分解測驗（上週）", kind: "quiz",
    instructions: "45 分鐘內完成。考試模式：AI 已鎖定。", dueAt: due, durationMin: 45, lockAi: true, shuffle: false, allowReview: true, status: "closed", createdAt: ago(24 * 8),
  }).run();

  const SKILL: Record<string, number> = { s123: 0.75, s124: 0.3, s125: 0.9, s126: 0.7, s127: 0.6, s128: 0.75, s129: 0.95, s130: 0.55, s131: 0.8, s132: 0.65, s133: 0.5, s134: 0.6 };
  const DONE = ["s123", "s124", "s127", "s128", "s130", "s132"];
  const IN_PROGRESS = ["s126"];
  const COMMENTS: Record<string, string> = {
    s123: "十字相乘做得唔錯！周界要計兩次長同闊，下次記得檢查答句。錯題請入錯題簿重做。",
    s124: "要重溫十字相乘同平方差，可以先做錯題簿入面嘅題目，有問題下課搵我。",
    s127: "概念大致明白，計算要細心啲。",
    s128: "整體良好，長答題步驟清楚。",
    s130: "注意審題，(c) 要用 x = 4 代入。",
    s132: "進步咗！繼續保持。",
  };

  students.forEach((s, si) => {
    const skill = SKILL[s.username] ?? 0.65;
    const answers: Record<string, string> = {};
    const marks: Record<string, schema.QuestionGrade> = {};
    let total = 0;
    ordered.forEach((q, i) => {
      let right = ((si * 7 + i * 13 + 5) % 100) / 100 < skill;
      if (s.username === "s123" && (i === 3 || i === 6)) right = false; // demo mistakes for the wrongbook
      if (q.type === "mc") {
        answers[q.id] = right ? q.answer : String((Number(q.answer) + 1) % q.options.length);
        const ai = right ? q.marks : 0;
        marks[q.id] = { ai, aiNote: right ? "自動評分：正確" : "自動評分：錯誤" };
      } else if (q.type === "short") {
        answers[q.id] = right ? q.answer.split("|")[0] : i === 6 ? "-7" : "(x+1)(x+6)";
        const ai = right ? q.marks : 0;
        marks[q.id] = { ai, aiNote: right ? "自動評分：正確" : "自動評分：錯誤" };
      } else {
        const tier = s.username === "s123" ? "mid" : skill >= 0.8 ? "high" : skill >= 0.55 ? "mid" : "low";
        answers[q.id] = LONG[tier];
        const ai = tier === "high" ? 6 : tier === "mid" ? 5 : 2;
        marks[q.id] = { ai, aiNote: tier === "high" ? "涵蓋參考答案要點 6/6" : tier === "mid" ? "涵蓋參考答案要點 5/6；未見：26" : "涵蓋參考答案要點 1/6；未見：(x+2)(x+3)、x+3、26" };
        if (DONE.includes(s.username) || IN_PROGRESS.includes(s.username)) {
          const score = tier === "high" ? 6 : tier === "mid" ? 4 : 1;
          marks[q.id].annotations =
            tier === "mid"
              ? [{ quote: "(x+2)(x+3)", note: "十字相乘正確", kind: "good" }, { quote: "周界 = 6+7 = 13 米", note: "周界 = 2(長 + 闊) = 26 米", kind: "bad" }]
              : tier === "low"
                ? [{ quote: "(x+1)(x+6)", note: "1 × 6 = 6 但 1 + 6 ≠ 5", kind: "bad" }]
                : [{ quote: "周界 = 2(6+7) = 26 米", note: "步驟完整", kind: "good" }];
          if (DONE.includes(s.username)) {
            marks[q.id].score = score;
            marks[q.id].tags = tier === "high" ? [] : tier === "mid" ? ["步驟不完整"] : ["十字相乘符號錯", "概念混淆"];
            marks[q.id].note = tier === "high" ? "完整清晰。" : tier === "mid" ? "(c) 周界計錯：要加兩次長同闊。" : "請重溫十字相乘。";
          }
        }
      }
    });
    const isDone = DONE.includes(s.username);
    if (isDone) for (const q of ordered) if (marks[q.id].score === undefined) marks[q.id].score = marks[q.id].ai;
    for (const q of ordered) total += isDone ? (marks[q.id].score ?? 0) : q.type === "mc" || q.type === "short" ? (marks[q.id].ai ?? 0) : 0;
    const submittedAt = new Date(due.getTime() - (si + 1) * 3_600_000);
    const attId = id();
    db.insert(schema.attempts).values({
      id: attId, assignmentId: aid, studentId: s.id, status: "submitted", answers, score: total, maxScore,
      needsMarking: !isDone, blurCount: s.username === "s130" ? 2 : 0,
      startedAt: new Date(submittedAt.getTime() - 40 * 60_000), savedAt: submittedAt, submittedAt,
    }).run();
    const aiTotal = Object.values(marks).reduce((n, m) => n + (m.ai ?? 0), 0);
    if (isDone || IN_PROGRESS.includes(s.username)) {
      db.insert(schema.grades).values({
        attemptId: attId, status: isDone ? "done" : "in_progress", marks, aiTotal, aiSummary: "規則初評（示範）", aiMock: true,
        comment: COMMENTS[s.username] ?? "", gradedBy: t09.id, gradedAt: isDone ? ago(24 * 3) : null, updatedAt: ago(24 * 3),
      }).run();
    }
  });

  // ---- Wrongbook: lost-mark questions from marked work, for s123 and s125 ---------------------
  for (const uname of ["s123", "s125"]) {
    const u = students.find((s) => s.username === uname);
    if (!u) continue;
    const atts = db.select().from(schema.attempts).where(and(eq(schema.attempts.studentId, u.id), eq(schema.attempts.status, "submitted"))).all();
    const seen = new Set<string>();
    let k = 0;
    for (const att of atts) {
      const a = db.select().from(schema.assignments).where(eq(schema.assignments.id, att.assignmentId)).get();
      if (!a?.paperId) continue;
      const p = db.select().from(schema.papers).where(eq(schema.papers.id, a.paperId)).get()!;
      const subject = db.select().from(schema.classes).where(eq(schema.classes.id, a.classId)).get()?.subject ?? "";
      const g = db.select().from(schema.grades).where(eq(schema.grades.attemptId, att.id)).get();
      for (const qid of p.sections.flatMap((s) => s.questionIds)) {
        const q = db.select().from(schema.questions).where(eq(schema.questions.id, qid)).get();
        if (!q || seen.has(q.id)) continue;
        const ans = att.answers[q.id] ?? "";
        const wrong =
          q.type === "mc" ? ans !== q.answer
          : q.type === "short" ? !q.answer.split("|").some((x) => norm(x) === norm(ans))
          : g?.status === "done" && (g.marks[q.id]?.score ?? q.marks) < q.marks;
        if (!wrong) continue;
        seen.add(q.id);
        k++;
        db.insert(schema.wrongItems).values({
          id: id(), studentId: u.id, questionId: q.id, assignmentId: a.id, source: "assignment", subject: q.subject || subject, topic: q.topic,
          type: q.type, stem: q.stem, options: q.options, answer: q.answer, myAnswer: ans, createdAt: ago(24 * 2 + k),
        }).run();
      }
    }
    // One already mastered via redo, from self-practice.
    db.insert(schema.wrongItems).values({
      id: id(), studentId: u.id, source: "practice", subject: "數學", topic: "因式分解", type: "mc",
      stem: "因式分解 $x^2 - 9$。", options: ["$(x-3)^2$", "$(x+3)(x-3)$", "$(x+9)(x-1)$", "$x(x-9)$"], answer: "1", myAnswer: "0",
      redoCount: 2, redoCorrect: 1, mastered: true, lastRedoAt: ago(26), createdAt: ago(24 * 6),
    }).run();
  }

  // ---- Recent activity so streaks / weekly KPIs / analytics have numbers -----------------------
  const all = db.select().from(schema.users).where(eq(schema.users.role, "student")).all();
  all.forEach((s, i) => {
    for (let o = 6; o >= 0; o--) {
      if ((i + o) % 4 === 3 && s.username !== "s123" && s.username !== "s125") continue; // gaps for variety
      const d = new Date();
      d.setDate(d.getDate() - o);
      db.insert(schema.usage).values({ userId: s.id, day: dayKey(d), tokens: 1500 + ((i * 37 + o * 211) % 5000), requests: 2 + ((i + o) % 6) }).onConflictDoNothing().run();
    }
  });
  const s125 = all.find((s) => s.username === "s125");
  const mathTutor = db.select().from(schema.tutors).where(eq(schema.tutors.slug, "math")).get();
  if (s125) {
    const cid = id();
    db.insert(schema.conversations).values({ id: cid, userId: s125.id, title: "數學導師", tutorId: mathTutor?.id ?? null, modelId: "campus-fast", createdAt: ago(50), updatedAt: ago(3) }).run();
    const msgs: [("user" | "assistant"), string, number][] = [
      ["user", "點樣判斷二次方程有幾多個實根？", 50],
      ["assistant", "好問題！你記唔記得判別式 $\\Delta = b^2 - 4ac$？試吓諗：$\\Delta > 0$、$= 0$、$< 0$ 分別代表咩？", 50],
      ["user", "Δ > 0 係兩個不同實根？", 26],
      ["assistant", "啱！咁 $x^2 + 4x + 4 = 0$ 嘅 $\\Delta$ 係幾多？", 26],
      ["user", "16 - 16 = 0，所以得一個實根", 3],
    ];
    msgs.forEach(([role, content, h], i) => db.insert(schema.messages).values({ id: id(), conversationId: cid, role, content, modelId: role === "assistant" ? "campus-fast" : null, createdAt: new Date(ago(h).getTime() + i * 1000) }).run());
  }
  for (const [uname, h] of [["s123", 20], ["s123", 70], ["s125", 30]] as const) {
    const u = all.find((s) => s.username === uname);
    if (!u) continue;
    db.insert(schema.libraryItems).values({
      id: id(), ownerId: u.id, kind: "quiz", source: "studio", title: "練習：數學 · 因式分解", folder: "自主練習",
      data: { questions: [{ q: "因式分解 $x^2 - 5x + 6$。", options: ["$(x-2)(x-3)$", "$(x+2)(x+3)$", "$(x-1)(x-6)$", "$(x+1)(x-6)$"], answer: 0, explain: "Q1001 · 因式分解" }], attempts: [{ score: 1, total: 1, at: ago(h).getTime() }] },
      createdAt: ago(h), updatedAt: ago(h),
    }).run();
  }

  db.insert(schema.settings).values({ key: "p4SeedInit", value: new Date().toISOString() }).run();
  console.log("• P4 demo data seeded (marked quiz, grading queue, wrongbook, activity)");
}
