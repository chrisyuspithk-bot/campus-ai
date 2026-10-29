/* P3 demo data: classes, question bank, papers, assignments + attempts, alerts inputs, community.
 * Idempotent: runs once per database (marker setting `p3SeedInit`), for fresh and upgraded DBs. */
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import * as schema from "../src/lib/db/schema";

type DB = BetterSQLite3Database<typeof schema>;
const id = () => randomUUID().replace(/-/g, "").slice(0, 16);

export function seedP3(db: DB) {
  if (db.select().from(schema.settings).where(eq(schema.settings.key, "p3SeedInit")).get()) return;
  const byName = (u: string) => db.select().from(schema.users).where(eq(schema.users.username, u)).get();
  const t09 = byName("t09");
  const t12 = byName("t12");
  if (!t09 || !t12) {
    console.log("• P3 seed skipped (demo teachers t09/t12 missing)");
    return;
  }

  // ---- Extra demo students / teacher ---------------------------------------------------------
  const pw = bcrypt.hashSync("demo1234", 10);
  const NAMES_3A = ["嘉欣", "子軒", "樂兒", "俊傑", "詠琪", "浩然", "曉晴", "家豪", "芷晴", "志明"];
  const NAMES_3B = ["梓鋒", "凱琳", "卓謙", "思穎", "柏希", "雅婷"];
  const NAMES_4B = ["Ethan", "Hailey", "Marcus", "Zoe", "Ryan"];
  const AVATARS = ["🐼", "🐯", "🐨", "🦁", "🐸", "🐵", "🐧", "🦄", "🐙", "🐳"];
  const newStudents: (typeof schema.users.$inferInsert)[] = [
    ...NAMES_3A.map((n, i) => ({ username: `s${125 + i}`, displayName: n, group: "3A" })),
    ...NAMES_3B.map((n, i) => ({ username: `s${301 + i}`, displayName: n, group: "3B" })),
    ...NAMES_4B.map((n, i) => ({ username: `s${202 + i}`, displayName: n, group: "4B", language: "en" as const })),
  ].map((u, i) => ({ ...u, id: id(), passwordHash: pw, role: "student" as const, email: `${u.username}@school.edu.hk`, avatar: AVATARS[i % AVATARS.length] }));
  const t15 = { id: id(), username: "t15", passwordHash: pw, displayName: "李老師", email: "t15@school.edu.hk", role: "teacher" as const, group: "物理", avatar: "🧑‍🔬" };
  for (const u of [...newStudents, t15]) db.insert(schema.users).values(u).onConflictDoNothing().run();

  const students = db.select().from(schema.users).where(eq(schema.users.role, "student")).all();
  const inGroup = (g: string) => students.filter((s) => s.group === g);

  // ---- Classes -------------------------------------------------------------------------------
  const cls = (name: string, subject: string, level: string, teacherId: string, emoji: string, members: string[]) => {
    const cid = id();
    db.insert(schema.classes).values({ id: cid, name, subject, level, teacherId, emoji }).run();
    for (const m of members) db.insert(schema.classMembers).values({ classId: cid, userId: m }).run();
    return cid;
  };
  const c3A = cls("3A", "數學", "S3", t09.id, "📐", inGroup("3A").map((s) => s.id));
  const c3B = cls("3B", "數學", "S3", t09.id, "📏", inGroup("3B").map((s) => s.id));
  const c4B = cls("4B", "數學", "S4", t09.id, "📊", inGroup("4B").map((s) => s.id));
  const c3AE = cls("3A", "英文", "S3", t12.id, "🔤", inGroup("3A").map((s) => s.id));

  // ---- Question bank -------------------------------------------------------------------------
  let code = 1000;
  type Q = typeof schema.questions.$inferInsert;
  const q = (o: Omit<Q, "id" | "code">) => {
    const row = { ...o, id: id(), code: `Q${++code}` };
    db.insert(schema.questions).values(row).run();
    return row.id;
  };
  const S = { subject: "數學", level: "S3", scope: "school" as const, ownerId: t09.id };
  const qF = [
    q({ ...S, topic: "因式分解", type: "mc", difficulty: 1, stem: "因式分解 $x^2 - 5x + 6$。", options: ["$(x-2)(x-3)$", "$(x+2)(x+3)$", "$(x-1)(x-6)$", "$(x+1)(x-6)$"], answer: "0", marks: 1, tags: ["十字相乘"] }),
    q({ ...S, topic: "因式分解", type: "mc", difficulty: 1, stem: "因式分解 $x^2 - 9$。", options: ["$(x-3)^2$", "$(x+3)(x-3)$", "$(x+9)(x-1)$", "$x(x-9)$"], answer: "1", marks: 1, tags: ["平方差"] }),
    q({ ...S, topic: "因式分解", type: "mc", difficulty: 2, stem: "以下哪一個是 $6x^2 + 9x$ 的因式分解？", options: ["$3(2x^2+3x)$", "$3x(2x+3)$", "$x(6x+9)$", "$6x(x+9)$"], answer: "1", marks: 1, tags: ["公因式"] }),
    q({ ...S, topic: "因式分解", type: "mc", difficulty: 2, stem: "因式分解 $2x^2 + 7x + 3$。", options: ["$(2x+1)(x+3)$", "$(2x+3)(x+1)$", "$(x+1)(x+3)$", "$(2x-1)(x-3)$"], answer: "0", marks: 2, tags: ["十字相乘"] }),
    q({ ...S, topic: "因式分解", type: "mc", difficulty: 3, stem: "因式分解 $a^2 + 2ab + b^2 - 4$。", options: ["$(a+b)^2 - 4$", "$(a+b+2)(a+b-2)$", "$(a+b+4)(a+b-1)$", "$(a-b+2)(a-b-2)$"], answer: "1", marks: 2, tags: ["恆等式"] }),
    q({ ...S, topic: "因式分解", type: "short", difficulty: 1, stem: "因式分解 $x^2 + 5x + 6$。", answer: "(x+2)(x+3)|(x+3)(x+2)", marks: 2, tags: ["十字相乘"] }),
    q({ ...S, topic: "因式分解", type: "short", difficulty: 2, stem: "若 $x^2 + kx + 12 = (x+3)(x+4)$，求 $k$。", answer: "7|k=7", marks: 2 }),
    q({ ...S, topic: "因式分解", type: "long", difficulty: 2, stem: "一個長方形花園的面積為 $x^2 + 5x + 6$ 平方米。\n\n(a) 因式分解 $x^2 + 5x + 6$。\n\n(b) 若花園的闊為 $(x+2)$ 米，求長。\n\n(c) 當 $x = 4$ 時，求花園的周界。", answer: "(a) (x+2)(x+3) [2]\n(b) x+3 米 [1]\n(c) 闊 6、長 7，周界 26 米 [3]", marks: 6 }),
    q({ ...S, topic: "因式分解", type: "upload", difficulty: 2, stem: "在紙上因式分解 $x^2 - 7x + 10$，寫出十字相乘的步驟，拍照上載。", answer: "(x-2)(x-5)；步驟清楚", marks: 3 }),
  ];
  const qQ = [
    q({ ...S, topic: "二次方程", type: "mc", difficulty: 1, stem: "解 $(x-2)(x-3) = 0$。", options: ["$x = 2$ 或 $x = 3$", "$x = -2$ 或 $x = -3$", "$x = 6$", "$x = 5$"], answer: "0", marks: 1 }),
    q({ ...S, topic: "二次方程", type: "mc", difficulty: 2, stem: "方程 $x^2 + 4x + 4 = 0$ 有多少個不同實根？", options: ["0", "1", "2", "無限"], answer: "1", marks: 1, tags: ["判別式"] }),
    q({ ...S, topic: "二次方程", type: "short", difficulty: 2, stem: "求 $x^2 - 6x + 5 = 0$ 較大的根。", answer: "5|x=5", marks: 2 }),
    q({ ...S, topic: "二次方程", type: "mc", difficulty: 3, stem: "若方程 $x^2 + kx + 9 = 0$ 有兩個相等實根，且 $k > 0$，則 $k =$", options: ["3", "6", "9", "18"], answer: "1", marks: 2, tags: ["判別式"] }),
  ];
  const qStat = [
    q({ ...S, topic: "統計", type: "mc", difficulty: 1, stem: "數據 2, 5, 5, 7, 11 的中位數是", options: ["5", "6", "7", "5.5"], answer: "0", marks: 1 }),
    q({ ...S, topic: "統計", type: "mc", difficulty: 1, stem: "數據 2, 5, 5, 7, 11 的眾數是", options: ["2", "5", "7", "11"], answer: "1", marks: 1 }),
    q({ ...S, topic: "統計", type: "short", difficulty: 2, stem: "數據 2, 5, 5, 7, 11 的平均數是多少？", answer: "6", marks: 2 }),
  ];
  q({ ...S, scope: "mine", topic: "因式分解", type: "short", difficulty: 3, stem: "因式分解 $x^3 - x$。", answer: "x(x+1)(x-1)|x(x-1)(x+1)", marks: 3 });
  const E = { subject: "英文", level: "S3", scope: "school" as const, ownerId: t12.id };
  const qEn = [
    q({ ...E, topic: "Tenses", type: "mc", difficulty: 1, stem: "She ____ to school every day.", options: ["go", "goes", "going", "gone"], answer: "1", marks: 1 }),
    q({ ...E, topic: "Tenses", type: "mc", difficulty: 2, stem: "By the time we arrived, the film ____.", options: ["already started", "has already started", "had already started", "starts"], answer: "2", marks: 1 }),
    q({ ...E, topic: "Tenses", type: "short", difficulty: 1, stem: "Write the past tense of “write”.", answer: "wrote", marks: 1 }),
    q({ ...E, topic: "Writing", type: "long", difficulty: 2, stem: "Write 80–100 words about your favourite school event and why you enjoy it.", answer: "Content 4, language 4", marks: 8 }),
  ];

  // ---- Papers --------------------------------------------------------------------------------
  const paper = (o: Omit<typeof schema.papers.$inferInsert, "id">) => {
    const pid = id();
    db.insert(schema.papers).values({ ...o, id: pid }).run();
    return pid;
  };
  const pFactor = paper({
    ownerId: t09.id, title: "中三數學測驗 A：因式分解", subject: "數學", durationMin: 45, shuffle: true, lockAi: true,
    sections: [
      { title: "一、選擇題", questionIds: qF.slice(0, 5) },
      { title: "二、短答題", questionIds: qF.slice(5, 7) },
      { title: "三、長答題", questionIds: [qF[7]] },
    ],
  });
  const pQuad = paper({ ownerId: t09.id, title: "二次方程小測", subject: "數學", durationMin: 20, lockAi: true, sections: [{ title: "小測", questionIds: qQ }] });
  const pStat = paper({ ownerId: t09.id, title: "統計小測", subject: "數學", durationMin: 15, lockAi: false, sections: [{ title: "小測", questionIds: qStat }] });
  const pEn = paper({ ownerId: t12.id, title: "Unit 5 Grammar Quiz", subject: "英文", durationMin: 20, lockAi: true, sections: [{ title: "Part A", questionIds: qEn.slice(0, 3) }, { title: "Part B", questionIds: [qEn[3]] }] });

  // ---- Assignments + attempts ----------------------------------------------------------------
  const tonight = new Date();
  tonight.setHours(23, 59, 0, 0);
  const days = (n: number) => new Date(tonight.getTime() + n * 86_400_000);
  const assign = (o: Omit<typeof schema.assignments.$inferInsert, "id">) => {
    const aid = id();
    db.insert(schema.assignments).values({ ...o, id: aid }).run();
    return aid;
  };
  const aFactor = assign({ teacherId: t09.id, classId: c3A, paperId: pFactor, title: "因式分解測驗", kind: "quiz", instructions: "45 分鐘內完成。考試模式：AI 已鎖定。", dueAt: tonight, durationMin: 45, lockAi: true, shuffle: true, allowReview: true, createdAt: days(-2) });
  const aWorksheet = assign({ teacherId: t09.id, classId: c3A, title: "工作紙：因式分解（拍照上載）", kind: "homework", instructions: "完成課本 P.42 第 1–10 題，寫出步驟，拍照或掃描上載。", dueAt: days(3), lockAi: false, allowReview: true, createdAt: days(-1) });
  const aQuad = assign({ teacherId: t09.id, classId: c3A, paperId: pQuad, title: "二次方程小測", kind: "quiz", dueAt: days(-3), durationMin: 20, lockAi: true, allowReview: true, createdAt: days(-6) });
  const aStat = assign({ teacherId: t09.id, classId: c3A, paperId: pStat, title: "統計小測", kind: "quiz", dueAt: days(-8), durationMin: 15, lockAi: false, allowReview: true, status: "closed", createdAt: days(-12) });
  const a3B = assign({ teacherId: t09.id, classId: c3B, paperId: pFactor, title: "因式分解測驗", kind: "exam", dueAt: days(1), durationMin: 45, lockAi: true, shuffle: true, allowReview: false, createdAt: days(-1) });
  assign({ teacherId: t09.id, classId: c4B, paperId: pQuad, title: "Quadratic equations check", kind: "quiz", dueAt: days(4), durationMin: 20, lockAi: true, allowReview: true, createdAt: new Date() });
  const aEn = assign({ teacherId: t12.id, classId: c3AE, paperId: pEn, title: "Unit 5 Grammar Quiz", kind: "quiz", dueAt: days(2), durationMin: 20, lockAi: true, allowReview: true, createdAt: days(-1) });

  const qById = new Map(db.select().from(schema.questions).all().map((x) => [x.id, x]));
  const wrongShort: Record<string, string> = {};
  /** Answer every question; `skill` (0–1) is the chance of a right answer. */
  const answersFor = (paperId: string, skill: number, salt: number) => {
    const p = db.select().from(schema.papers).where(eq(schema.papers.id, paperId)).get()!;
    const ans: Record<string, string> = {};
    let i = 0;
    for (const qid of p.sections.flatMap((s) => s.questionIds)) {
      const qq = qById.get(qid)!;
      const right = ((salt * 7 + i * 13) % 100) / 100 < skill;
      i++;
      if (qq.type === "mc") ans[qid] = right ? qq.answer : String((Number(qq.answer) + 1) % qq.options.length);
      else if (qq.type === "short") ans[qid] = right ? qq.answer.split("|")[0] : (wrongShort[qid] ?? "唔識");
      else ans[qid] = right ? "（作答）" + qq.answer.split("\n")[0] : "";
    }
    return ans;
  };
  const mark = (paperId: string, ans: Record<string, string>) => {
    const p = db.select().from(schema.papers).where(eq(schema.papers.id, paperId)).get()!;
    let score = 0, max = 0, needs = false;
    for (const qid of p.sections.flatMap((s) => s.questionIds)) {
      const qq = qById.get(qid)!;
      max += qq.marks;
      const a = (ans[qid] ?? "").trim();
      if (qq.type === "mc" && a === qq.answer) score += qq.marks;
      else if (qq.type === "short" && qq.answer.split("|").includes(a)) score += qq.marks;
      else if ((qq.type === "long" || qq.type === "upload") && a) needs = true;
    }
    return { score, maxScore: max, needsMarking: needs };
  };
  const SKILL: Record<string, number> = { s123: 0.85, s124: 0.25, s125: 0.9, s126: 0.7, s127: 0.6, s128: 0.75, s129: 0.95, s130: 0.55, s131: 0.8, s132: 0.65 };
  const submit = (aid: string, paperId: string, sid: string, uname: string, hoursAgo: number, salt: number) => {
    const ans = answersFor(paperId, SKILL[uname] ?? 0.7, salt);
    const submittedAt = new Date(Date.now() - hoursAgo * 3_600_000);
    db.insert(schema.attempts).values({
      id: id(), assignmentId: aid, studentId: sid, status: "submitted", answers: ans, ...mark(paperId, ans),
      blurCount: uname === "s130" ? 3 : 0, startedAt: new Date(submittedAt.getTime() - 15 * 60_000), savedAt: submittedAt, submittedAt,
    }).run();
  };
  const s3A = inGroup("3A");
  s3A.forEach((s, i) => {
    if (s.username !== "s133") submit(aStat, pStat, s.id, s.username, 24 * 9 + i, i + 3);
    if (s.username !== "s134" && s.username !== "s133") submit(aQuad, pQuad, s.id, s.username, 24 * 4 + i, i);
  });
  // Tonight's quiz: a few already done, one sitting it right now (not s123 — that's the demo login).
  s3A.filter((s) => ["s125", "s129", "s131"].includes(s.username)).forEach((s, i) => submit(aFactor, pFactor, s.id, s.username, 1 + i, i + 11));
  const live = s3A.find((s) => s.username === "s126");
  if (live) {
    const p = db.select().from(schema.papers).where(eq(schema.papers.id, pFactor)).get()!;
    const ids = p.sections.flatMap((x) => x.questionIds).slice(0, 4);
    db.insert(schema.attempts).values({ id: id(), assignmentId: aFactor, studentId: live.id, answers: Object.fromEntries(ids.map((k) => [k, qById.get(k)!.answer.split("|")[0]])), blurCount: 1, startedAt: new Date(Date.now() - 12 * 60_000), savedAt: new Date() }).run();
  }
  // Worksheet upload homework: two text submissions waiting for the teacher.
  for (const s of s3A.filter((x) => ["s125", "s129"].includes(x.username))) {
    db.insert(schema.attempts).values({ id: id(), assignmentId: aWorksheet, studentId: s.id, status: "submitted", answers: { _upload: "已完成 1–10 題，步驟見相片。" }, needsMarking: true, startedAt: new Date(Date.now() - 3 * 3_600_000), submittedAt: new Date(Date.now() - 2 * 3_600_000) }).run();
  }
  inGroup("3B").slice(0, 2).forEach((s, i) => submit(a3B, pFactor, s.id, s.username, 2 + i, i + 20));
  // English quiz: s123 already handed in (shows under 已交/已評).
  s3A.filter((s) => ["s123", "s125", "s127"].includes(s.username)).forEach((s, i) => submit(aEn, pEn, s.id, s.username, 5 + i, i + 30));

  // ---- Alert inputs: a heavy AI user today, an open risk case ----------------------------------
  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const heavy = byName("s128");
  if (heavy) db.insert(schema.usage).values({ userId: heavy.id, day: today, tokens: 46_000, requests: 61 }).onConflictDoUpdate({ target: [schema.usage.userId, schema.usage.day], set: { tokens: 46_000, requests: 61 } }).run();
  for (const u of ["s126", "s127", "s129", "s131"]) {
    const s = byName(u);
    if (s) db.insert(schema.usage).values({ userId: s.id, day: today, tokens: 4_000, requests: 9 }).onConflictDoNothing().run();
  }
  const risk = byName("s127");
  if (risk) {
    db.insert(schema.safetyCases).values({ id: id(), userId: risk.id, level: "medium", category: "bullying", source: "chat", matched: "冇人鍾意", excerpt: "（示範）班入面冇人鍾意我，佢哋成日笑我……", status: "open" }).run();
  }

  // ---- Community -----------------------------------------------------------------------------
  const post = (o: Omit<typeof schema.communityPosts.$inferInsert, "id">) => {
    const pid = id();
    db.insert(schema.communityPosts).values({ ...o, id: pid }).run();
    return pid;
  };
  const hours = (h: number) => new Date(Date.now() - h * 3_600_000);
  const posts = [
    post({ authorId: t09.id, kind: "worksheet", subject: "數學", title: "中三因式分解分層工作紙", description: "三個難度、附答案。十字相乘用生活化例子引入。", content: "# 因式分解分層工作紙\n\n## A 級\n1. $x^2+5x+6$\n2. $x^2-9$\n\n## B 級\n3. $2x^2+7x+3$\n\n## C 級\n4. $a^2+2ab+b^2-4$", status: "approved", createdAt: hours(30) }),
    post({ authorId: t09.id, kind: "paper", subject: "數學", title: "二次方程小測（20 分鐘）", description: "4 題，判別式重點，適合課後五分鐘檢查。", content: "二次方程小測 · 4 題 · 20 分鐘", refId: pQuad, status: "approved", createdAt: hours(50) }),
    post({ authorId: t12.id, kind: "paper", subject: "英文", title: "Unit 5 Grammar Quiz", description: "Past perfect vs past simple, with a short writing task.", content: "Part A: 3 items · Part B: writing", refId: pEn, status: "approved", createdAt: hours(20) }),
    post({ authorId: t12.id, kind: "tutor", subject: "英文", title: "Speaking role-play tutor pack", description: "System prompt + topics for S3 speaking practice. Moderate strategy.", content: "Strategy: moderate\nTopics: shopping, directions, school life\nRules: correct one error at a time.", status: "approved", createdAt: hours(80) }),
    post({ authorId: t15.id, kind: "worksheet", subject: "物理", title: "力學：自由落體探究工作紙", description: "手機慢鏡拍攝 + 數據表，學生自己計 g。", content: "# 自由落體探究\n\n1. 用手機 240fps 拍攝波子落下\n2. 記錄每格位置\n3. 畫 s–t² 圖，求斜率", status: "approved", createdAt: hours(10) }),
    post({ authorId: t15.id, kind: "tutor", subject: "物理", title: "電學導師設定包（嚴格模式）", description: "只引導唔俾答案，附常見錯誤清單。", content: "Strategy: strict\nCommon errors: 串聯並聯混淆、單位", status: "pending", createdAt: hours(2) }),
  ];
  const teachers = [t09.id, t12.id, t15.id];
  posts.forEach((p, i) => teachers.forEach((tid, j) => {
    if ((i + j) % 2 === 0) db.insert(schema.communityReactions).values({ postId: p, userId: tid, kind: "like" }).onConflictDoNothing().run();
    if ((i + j) % 3 === 0) db.insert(schema.communityReactions).values({ postId: p, userId: tid, kind: "save" }).onConflictDoNothing().run();
  }));

  db.insert(schema.settings).values({ key: "p3SeedInit", value: new Date().toISOString() }).run();
  console.log("• P3 demo data seeded (classes, bank, papers, assignments, community)");
}
