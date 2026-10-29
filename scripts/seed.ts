/* Creates/migrates the SQLite DB and seeds demo data. Usage: npm run db:seed [-- --reset] */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import * as schema from "../src/lib/db/schema";
import { seedP3 } from "./seed-p3";
import { seedP4 } from "./seed-p4";
import { seedP5 } from "./seed-p5";
import { seedP6 } from "./seed-p6";
import { seedP7 } from "./seed-p7";
import { seedP8 } from "./seed-p8";

const dbPath = path.resolve(process.env.DATABASE_PATH ?? "./data/campus.db");
const reset = process.argv.includes("--reset");

if (reset) {
  for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) fs.rmSync(f, { force: true });
  fs.rmSync(path.join(path.dirname(dbPath), "uploads"), { recursive: true, force: true });
  console.log("• Removed existing database");
}
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
const db = drizzle(sqlite, { schema });
migrate(db, { migrationsFolder: path.resolve("drizzle") });
console.log("• Migrations applied");

const id = () => randomUUID().replace(/-/g, "").slice(0, 16);
const hash = (p: string) => bcrypt.hashSync(p, 10);
const DEMO_PASSWORD = "demo1234";

// ---- P2 feature switches (idempotent, also for databases seeded in P1) ------------------------
// P1 seeded studio/essay locked + off; the first run after the P2 upgrade turns the P2 tools on once.
// After that the admin's choices in /a/features are kept.
const P2_FEATURES = [
  { key: "studio", phase: 2, sortOrder: 3 },
  { key: "essay", phase: 2, sortOrder: 4 },
  { key: "create", phase: 2, sortOrder: 5 },
  { key: "youtube", phase: 2, sortOrder: 6 },
];
if (!db.select().from(schema.settings).where(eq(schema.settings.key, "p2FeaturesInit")).get()) {
  for (const f of P2_FEATURES) {
    db.insert(schema.features)
      .values({ ...f, studentEnabled: true, teacherEnabled: true })
      .onConflictDoUpdate({ target: schema.features.key, set: { studentEnabled: true, teacherEnabled: true } })
      .run();
  }
  db.insert(schema.settings).values({ key: "p2FeaturesInit", value: new Date().toISOString() }).run();
  console.log("• P2 feature switches enabled");
}

if (db.select().from(schema.users).all().length > 0) {
  console.log("• Data already present — skipping base seed (use --reset to start over)");
  seedP3(db);
  seedP4(db);
  seedP5(db, dbPath);
  seedP6(db);
  seedP7(db);
  seedP8(db);
  sqlite.close();
  process.exit(0);
}

// ---- Users ---------------------------------------------------------------------------------
type U = typeof schema.users.$inferInsert;
const student: U = { id: id(), username: "s123", passwordHash: hash(DEMO_PASSWORD), displayName: "阿明", email: "s123@school.edu.hk", role: "student", group: "3A", avatar: "🧑‍🎓" };
const teacher: U = { id: id(), username: "t09", passwordHash: hash(DEMO_PASSWORD), displayName: "陳老師", email: "t09@school.edu.hk", role: "teacher", group: "數學", avatar: "👩‍🏫" };
const admin: U = { id: id(), username: "admin", passwordHash: hash(DEMO_PASSWORD), displayName: "IT 管理員", email: "admin@school.edu.hk", role: "admin", group: "IT", avatar: "🛠️" };
const extra: U[] = [
  { id: id(), username: "s124", passwordHash: hash(DEMO_PASSWORD), displayName: "阿華", email: "s124@school.edu.hk", role: "student", group: "3A", avatar: "🙂" },
  { id: id(), username: "s201", passwordHash: hash(DEMO_PASSWORD), displayName: "Chloe", email: "s201@school.edu.hk", role: "student", group: "4B", avatar: "🦊", language: "en" },
  { id: id(), username: "t12", passwordHash: hash(DEMO_PASSWORD), displayName: "Ms Wong", email: "t12@school.edu.hk", role: "teacher", group: "英文", avatar: "📚", language: "en" },
];
db.insert(schema.users).values([student, teacher, admin, ...extra]).run();

// ---- Models + quotas -------------------------------------------------------------------------
db.insert(schema.models)
  .values([
    { id: "campus-fast", displayName: "校園快速", openrouterId: "google/gemini-3.8-flash", description: "日常溫習、快速解答", roles: ["student", "teacher", "admin"], sortOrder: 1 },
    { id: "campus-light", displayName: "校園輕量", openrouterId: "anthropic/claude-haiku-5.5", description: "簡潔、慳配額", roles: ["student", "teacher", "admin"], sortOrder: 2 },
    { id: "campus-strong", displayName: "校園強", openrouterId: "anthropic/claude-sonnet-5.5", description: "備課、長文、複雜推理", roles: ["teacher", "admin"], sortOrder: 3 },
  ])
  .run();
db.insert(schema.quotas)
  .values([
    { role: "student", dailyTokens: 50_000, monthlyTokens: 1_000_000, imagesPerDay: 5 },
    { role: "teacher", dailyTokens: 200_000, monthlyTokens: 5_000_000, imagesPerDay: 50 },
    { role: "admin", dailyTokens: 500_000, monthlyTokens: 10_000_000, imagesPerDay: 100 },
  ])
  .run();

// ---- Feature switches ----------------------------------------------------------------------
db.insert(schema.features)
  .values([
    { key: "ai_chat", studentEnabled: true, teacherEnabled: true, phase: 1, sortOrder: 1 },
    { key: "tutors", studentEnabled: true, teacherEnabled: true, phase: 1, sortOrder: 2 },
    { key: "image_gen", studentEnabled: true, teacherEnabled: true, phase: 1, sortOrder: 7 },
    { key: "tts", studentEnabled: true, teacherEnabled: true, phase: 1, sortOrder: 8 },
    { key: "web_search", studentEnabled: false, teacherEnabled: true, phase: 1, sortOrder: 9 },
    { key: "exam_lock", studentEnabled: true, teacherEnabled: true, phase: 3, sortOrder: 10 },
  ])
  .onConflictDoNothing()
  .run();

db.insert(schema.settings).values([{ key: "schoolName", value: "佛教孔仙洲紀念中學" }]).run();

// ---- Tutors (七科) ----------------------------------------------------------------------------
const ALL = ["S1", "S2", "S3", "S4", "S5", "S6"];
type T = typeof schema.tutors.$inferInsert;
const tutorSeed: Omit<T, "id">[] = [
  { slug: "math", name: "數學導師", nameEn: "Maths Tutor", subject: "數學", emoji: "📐", levels: ALL, strategy: "strict", tagline: "一步步問你點諗", blurb: "陪你拆解代數、幾何同統計題目，每一步都由你自己諗出嚟。", will: "拆步驟\n反問引導\n俾相似題練習", wont: "考試期間作答\n直接抄答案（校規）", topics: "代數、因式分解、二次方程、幾何、三角、統計", status: "published" },
  { slug: "english", name: "英文導師", nameEn: "English Tutor", subject: "英文", emoji: "🔤", levels: ALL, strategy: "moderate", tagline: "先大綱再細節", blurb: "Writing, grammar and speaking practice — outline first, then details.", will: "Give feedback on structure and grammar\nSuggest vocabulary\nRole-play speaking tasks", wont: "Write your whole essay for you", topics: "Writing, grammar, reading, speaking", status: "published" },
  { slug: "chinese", name: "中文導師", nameEn: "Chinese Tutor", subject: "中文", emoji: "📜", levels: ALL, strategy: "moderate", tagline: "讀懂範文、寫好文章", blurb: "閱讀理解、範文賞析同寫作結構，用提問幫你理清思路。", will: "分析範文\n引導立意同結構\n解釋修辭", wont: "代寫整篇作文", topics: "閱讀理解、範文、寫作、文言文", status: "published" },
  { slug: "physics", name: "物理導師", nameEn: "Physics Tutor", subject: "物理", emoji: "🔭", levels: ["S3", "S4", "S5", "S6"], strategy: "strict", tagline: "由概念到計算", blurb: "力學、電學、波動 — 先搞清概念，再一步步計數。", will: "畫圖解釋概念\n逐步引導計算\n檢查單位", wont: "直接俾功課答案", topics: "力學、熱學、波動、電磁學", status: "published" },
  { slug: "chemistry", name: "化學導師", nameEn: "Chemistry Tutor", subject: "化學", emoji: "⚗️", levels: ["S3", "S4", "S5", "S6"], strategy: "strict", tagline: "平衡方程式唔再難", blurb: "化學方程式、摩爾計算同實驗安全。", will: "引導平衡方程式\n解釋反應原理", wont: "提供危險實驗步驟", topics: "摩爾、酸鹼、有機化學", status: "draft" },
  { slug: "biology", name: "生物導師", nameEn: "Biology Tutor", subject: "生物", emoji: "🧬", levels: ["S3", "S4", "S5", "S6"], strategy: "moderate", tagline: "用圖像記概念", blurb: "細胞、遺傳、人體系統 — 用例子同圖解幫你記得牢。", will: "用例子解釋\n出溫習問題", wont: "直接答功課", topics: "細胞、遺傳、生態、人體", status: "published" },
  { slug: "history", name: "中史導師", nameEn: "Chinese History Tutor", subject: "中史", emoji: "🏯", levels: ALL, strategy: "moderate", tagline: "時序同因果", blurb: "整理朝代時序、事件因果，練習史料題答題技巧。", will: "整理時間線\n分析因果\n講解史料題技巧", wont: "代答評估題", topics: "朝代更替、近代史、史料分析", status: "published" },
];
const tutors: T[] = tutorSeed.map((t) => ({ ...t, id: id(), ownerId: t.subject === "英文" ? extra[2].id : teacher.id }));
db.insert(schema.tutors).values(tutors).run();

// A ready knowledge-base file for the maths tutor (indexed into chunks).
const mathTutor = tutors[0];
const kbText = `中三代數校本筆記：因式分解
1. 抽公因式：例如 6x + 9 = 3(2x + 3)。
2. 恆等式：a² − b² = (a + b)(a − b)；a² + 2ab + b² = (a + b)²。
3. 十字相乘：x² + bx + c，搵兩個數 p、q 使 p × q = c 及 p + q = b，則 x² + bx + c = (x + p)(x + q)。
   例：x² − 5x + 6，p = −2、q = −3，所以 = (x − 2)(x − 3)。
4. 常見錯誤：忘記檢查負號；未抽盡公因式。
二次方程：若 (x − 2)(x − 3) = 0，則 x = 2 或 x = 3。判別式 Δ = b² − 4ac 決定實根數目。`;
const fileId = id();
db.insert(schema.tutorFiles).values({ id: fileId, tutorId: mathTutor.id!, filename: "中三_代數筆記.md", size: Buffer.byteLength(kbText), status: "ready", chunkCount: 1 }).run();
db.insert(schema.tutorChunks).values({ fileId, tutorId: mathTutor.id!, content: kbText }).run();
const fileId2 = id();
db.insert(schema.tutorFiles).values({ id: fileId2, tutorId: mathTutor.id!, filename: "校本練習集.docx", size: 48211, status: "unsupported" }).run();

// ---- Conversations ---------------------------------------------------------------------------
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
function conv(userId: string, title: string, h: number, msgs: [("user" | "assistant"), string][], extra: Partial<typeof schema.conversations.$inferInsert> = {}) {
  const cid = id();
  db.insert(schema.conversations).values({ id: cid, userId, title, modelId: "campus-fast", createdAt: hoursAgo(h), updatedAt: hoursAgo(h), ...extra }).run();
  msgs.forEach(([role, content], i) =>
    db.insert(schema.messages).values({ id: id(), conversationId: cid, role, content, modelId: role === "assistant" ? "campus-fast" : null, createdAt: new Date(hoursAgo(h).getTime() + i * 1000) }).run(),
  );
  return cid;
}
conv(student.id!, "數學導師", 2, [
  ["user", "點樣因式分解 x² − 5x + 6？"],
  ["assistant", "好問題！我哋一步步嚟 🙂\n\n**步驟 1：** 呢條係 $x^2 + bx + c$ 形式，$b = -5$、$c = 6$。\n\n你可唔可以諗到兩個數，**相乘係 $6$**、**相加係 $-5$**？"],
  ["user", "−2 同 −3？"],
  ["assistant", "啱晒！✅ 因為 $(-2)\\times(-3) = 6$ 而且 $(-2)+(-3) = -5$。\n\n所以：\n\n$$x^2 - 5x + 6 = (x-2)(x-3)$$\n\n試吓用同一個方法因式分解 $x^2 + 7x + 12$？"],
], { tutorId: mathTutor.id!, pinned: true, tools: { rag: true, search: false, image: false, tts: false } });
conv(student.id!, "歷史溫習：辛亥革命", 26, [
  ["user", "幫我簡單整理辛亥革命嘅原因"],
  ["assistant", "可以由三方面整理：\n\n1. **政治**：清廷腐敗、立憲失敗\n2. **經濟**：列強侵略、賠款沉重\n3. **思想**：革命思想傳播（三民主義）\n\n想唔想我出幾條溫習問題？"],
]);
conv(student.id!, "Essay outline: My dream job", 50, [
  ["user", "Help me outline an essay about my dream job"],
  ["assistant", "Sure! Let's build it together. First — **what job** are you thinking of, and **one reason** it matters to you?"],
], { tutorId: tutors[1].id! });
conv(teacher.id!, "備課：出題靈感", 3, [
  ["user", "中三因式分解有咩生活化例子？"],
  ["assistant", "幾個生活化例子：\n\n- **花園面積**：長方形花園面積 $x^2 + 5x + 6$，求長同闊\n- **排櫈**：禮堂座位排成方陣，加減一行後點表示\n- **包裝盒**：體積因式分解求尺寸"],
]);

// ---- Drafts ----------------------------------------------------------------------------------
db.insert(schema.drafts)
  .values([
    { id: id(), ownerId: teacher.id!, title: "中三數學：因式分解工作紙", type: "worksheet", subject: "數學", content: "# 因式分解練習（中三）\n\n1. 因式分解 $x^2 + 5x + 6$\n2. 因式分解 $x^2 - 9$\n3. 因式分解 $2x^2 + 7x + 3$\n\n## 答案\n1. $(x+2)(x+3)$\n2. $(x+3)(x-3)$\n3. $(2x+1)(x+3)$\n", updatedAt: hoursAgo(2) },
    { id: id(), ownerId: teacher.id!, title: "二次方程講解大綱", type: "outline", subject: "數學", content: "# 二次方程講解大綱\n\n1. 引入：拋物線例子\n2. 因式分解法\n3. 公式法 $x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$\n4. 判別式\n", updatedAt: hoursAgo(30) },
    { id: id(), ownerId: teacher.id!, title: "統計 MC 10題", type: "quiz", subject: "數學", status: "exported", content: "# 統計 MC\n\n1. 以下哪個是中位數？…\n", updatedAt: hoursAgo(24 * 6) },
    { id: id(), ownerId: extra[2].id!, title: "Unit 5 Speaking outline", type: "outline", subject: "英文", content: "# Unit 5 Speaking\n\n- Warm-up\n- Group discussion prompts\n", updatedAt: hoursAgo(20) },
  ])
  .run();

// ---- Usage history (for charts / quota bars) ---------------------------------------------------
const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const usageRows: (typeof schema.usage.$inferInsert)[] = [];
const people = [student, teacher, ...extra];
for (let o = 6; o >= 0; o--) {
  for (const p of people) {
    const base = p.role === "teacher" ? 18_000 : 6_000;
    usageRows.push({ userId: p.id!, day: day(o), tokens: Math.round(base * (0.4 + ((o * 7 + p.username.length * 3) % 10) / 10)), requests: 4 + (o % 5), images: o % 3 === 0 ? 1 : 0 });
  }
}
db.insert(schema.usage).values(usageRows).run();
db.insert(schema.events).values([{ type: "blocked", userId: extra[0].id!, detail: "seed" }]).run();

seedP3(db);
seedP4(db);
seedP5(db, dbPath);
seedP6(db);
seedP7(db);
seedP8(db);

console.log("✓ Seed complete. Demo logins (password: demo1234):");
console.log("   student  s123   → /s");
console.log("   teacher  t09    → /t");
console.log("   admin    admin  → /a");
sqlite.close();
