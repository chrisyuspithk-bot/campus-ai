/* P6 demo data: extra leveled MC questions for adaptive practice, explainer videos (published + drafts),
 * practice history, teacher-built apps (live / in review / returned), more classes for the /a/org grid and
 * a code-sandbox project. Idempotent: runs once per database (marker setting `p6SeedInit`). */
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import * as schema from "../src/lib/db/schema";
import { APP_TEMPLATES } from "../src/lib/p6/app-templates";
import { TOPIC_ANIMATIONS } from "../src/lib/p6/topics";

type DB = BetterSQLite3Database<typeof schema>;
const id = () => randomUUID().replace(/-/g, "").slice(0, 16);
const ago = (h: number) => new Date(Date.now() - h * 3_600_000);

// [topic, difficulty, stem, options, answerIndex]
const MATH: [string, number, string, string[], number][] = [
  ["因式分解", 1, "因式分解 $4x + 8$。", ["$4(x+2)$", "$4(x+8)$", "$2(x+8)$", "$x(4+8)$"], 0],
  ["因式分解", 1, "因式分解 $x^2 + 3x$。", ["$x(x+3)$", "$3x(x+1)$", "$(x+3)^2$", "$x^2(1+3)$"], 0],
  ["因式分解", 2, "因式分解 $x^2 + 7x + 12$。", ["$(x+3)(x+4)$", "$(x+2)(x+6)$", "$(x+1)(x+12)$", "$(x-3)(x-4)$"], 0],
  ["因式分解", 2, "因式分解 $x^2 - x - 6$。", ["$(x-3)(x+2)$", "$(x+3)(x-2)$", "$(x-6)(x+1)$", "$(x-1)(x+6)$"], 0],
  ["因式分解", 2, "因式分解 $x^2 - 16$。", ["$(x-4)^2$", "$(x+4)(x-4)$", "$(x+8)(x-2)$", "$(x-16)(x+1)$"], 1],
  ["因式分解", 3, "因式分解 $2x^2 + 7x + 3$。", ["$(2x+1)(x+3)$", "$(2x+3)(x+1)$", "$(x+7)(2x+3)$", "$2(x+1)(x+3)$"], 0],
  ["因式分解", 3, "因式分解 $3x^2 - 12$。", ["$3(x-2)^2$", "$3(x+2)(x-2)$", "$(3x+4)(x-3)$", "$3(x^2-12)$"], 1],
  ["因式分解", 3, "因式分解 $x^2 - 6x + 9$。", ["$(x-3)^2$", "$(x+3)^2$", "$(x-9)(x+1)$", "$(x-3)(x+3)$"], 0],
  ["二次方程", 1, "解 $(x-1)(x+4) = 0$。", ["$x = 1$ 或 $x = -4$", "$x = -1$ 或 $x = 4$", "$x = 4$", "$x = 1$"], 0],
  ["二次方程", 1, "解 $x^2 = 25$。", ["$x = 5$", "$x = \\pm 5$", "$x = 25$", "$x = \\pm 25$"], 1],
  ["二次方程", 2, "解 $x^2 - 7x + 10 = 0$。", ["$x = 2$ 或 $x = 5$", "$x = -2$ 或 $x = -5$", "$x = 1$ 或 $x = 10$", "$x = 7$"], 0],
  ["二次方程", 2, "$x^2 + 4x + 4 = 0$ 有幾多個不同實根？", ["0", "1", "2", "無限多"], 1],
  ["二次方程", 3, "若 $x^2 + kx + 9 = 0$ 有兩個相等實根，$k$ 可以是？", ["$3$", "$6$", "$9$", "$18$"], 1],
  ["二次方程", 3, "方程 $2x^2 - 3x + 5 = 0$ 的判別式是？", ["$-31$", "$49$", "$31$", "$-49$"], 0],
  ["統計", 1, "數據 2, 4, 6, 8 的平均數是？", ["4", "5", "6", "20"], 1],
  ["統計", 2, "數據 7, 3, 9, 5, 1 的中位數是？", ["5", "9", "3", "7"], 0],
  ["統計", 2, "數據 3, 3, 4, 5, 5, 5, 6 的眾數是？", ["3", "4", "5", "6"], 2],
  ["統計", 3, "數據 4, 8, 6, 2 的中位數是？", ["5", "6", "4", "7"], 0],
  ["統計", 3, "五個數的平均數是 6，其中四個是 4, 5, 7, 8，第五個是？", ["5", "6", "7", "30"], 1],
];
const ENG: [string, number, string, string[], number][] = [
  ["Tenses", 1, "She ___ to school every day.", ["walk", "walks", "walking", "walked"], 1],
  ["Tenses", 1, "Look! The children ___ in the park.", ["play", "plays", "are playing", "played"], 2],
  ["Tenses", 2, "We ___ Ocean Park last Sunday.", ["visit", "have visited", "visited", "are visiting"], 2],
  ["Tenses", 2, "I ___ my homework already.", ["have finished", "finish", "am finishing", "finishes"], 0],
  ["Tenses", 3, "He ___ in Hong Kong since 2019.", ["lives", "lived", "has lived", "is living"], 2],
  ["Tenses", 3, "Which sentence is correct?", ["I have seen him yesterday.", "I saw him yesterday.", "I have saw him yesterday.", "I seen him yesterday."], 1],
];

export function seedP6(db: DB) {
  // Feature switch for the media studio (P6) — on for teachers.
  db.insert(schema.features).values({ key: "media", studentEnabled: true, teacherEnabled: true, phase: 6, sortOrder: 11 }).onConflictDoNothing().run();
  if (db.select().from(schema.settings).where(eq(schema.settings.key, "p6SeedInit")).get()) return;
  const user = (u: string) => db.select().from(schema.users).where(eq(schema.users.username, u)).get();
  const t09 = user("t09");
  const t12 = user("t12");
  const t15 = user("t15");
  const s123 = user("s123");
  const s125 = user("s125");
  if (!t09) {
    console.log("• P6 seed skipped (no base data)");
    return;
  }

  // ---- Leveled MC questions ------------------------------------------------------------------
  const maxCode = db.select({ code: schema.questions.code }).from(schema.questions).all().reduce((m, q) => Math.max(m, Number(q.code.slice(1)) || 0), 1000);
  let n = maxCode;
  const qIds: Record<string, string[]> = {};
  for (const [subject, list, owner] of [["數學", MATH, t09], ["英文", ENG, t12 ?? t09]] as const) {
    for (const [topic, difficulty, stem, options, answer] of list) {
      const qid = id();
      db.insert(schema.questions).values({ id: qid, code: `Q${++n}`, ownerId: owner.id, scope: "school", subject, topic, level: subject === "數學" ? "S3" : "S2", difficulty, type: "mc", stem, options, answer: String(answer), marks: 1, tags: [topic] }).run();
      (qIds[topic] ??= []).push(qid);
    }
  }

  // ---- Classes across levels for the /a/org grade × subject grid ---------------------------------
  const classRows = [
    { name: "1A", subject: "中文", level: "S1", teacherId: t15?.id ?? null, emoji: "📜" },
    { name: "2B", subject: "英文", level: "S2", teacherId: t12?.id ?? null, emoji: "🔤" },
    { name: "5C", subject: "物理", level: "S5", teacherId: null, emoji: "🔭" },
    { name: "6A", subject: "生物", level: "S6", teacherId: t15?.id ?? null, emoji: "🧬" },
  ];
  for (const c of classRows) {
    const exists = db.select().from(schema.classes).all().some((x) => x.name === c.name && x.subject === c.subject);
    if (!exists) db.insert(schema.classes).values({ id: id(), ...c }).run();
  }

  // ---- Explainer videos ------------------------------------------------------------------
  const v = (o: Partial<typeof schema.videos.$inferInsert> & { title: string; subject: string }, h: number) => {
    const vid = id();
    db.insert(schema.videos).values({ id: vid, ownerId: t09.id, level: "S3", createdAt: ago(h + 2), updatedAt: ago(h), ...o }).run();
    return vid;
  };
  const scriptOf = (topic: string) => TOPIC_ANIMATIONS[topic].map((s) => s.narration).join("\n\n");
  const published = (topic: string, title: string, subject: string, keyPoints: string[], h: number, owner = t09) =>
    v({ ownerId: owner.id, title, subject, topic, script: scriptOf(topic), scenes: TOPIC_ANIMATIONS[topic], keyPoints, status: "published", renderInfo: `mock · ${TOPIC_ANIMATIONS[topic].length} scenes · storyboard player`, renderedAt: ago(h), publishedAt: ago(h) }, h);
  const vFactor = published("因式分解", "一分鐘學識十字相乘", "數學", ["x² + bx + c：搵 p × q = c、p + q = b", "答案寫成 (x + p)(x + q)", "做完展開驗算，留意負號"], 30);
  published("二次方程", "判別式話你知有幾多個根", "數學", ["Δ = b² − 4ac", "Δ > 0 兩個實根；Δ = 0 一個重根；Δ < 0 冇實根", "先整理成 ax² + bx + c = 0"], 52);
  published("統計", "中位數同平均數", "數學", ["中位數：排好次序取正中間", "雙數個數據：取中間兩個嘅平均", "平均數 = 總和 ÷ 個數"], 75);
  if (t12) published("Tenses", "Present perfect in 30 seconds", "英文", ["have / has + past participle", "Links the past to now", "Not with finished time words like yesterday"], 40, t12);
  const draftScenes = [
    { emoji: "📐", title: "勾股定理", visual: "$$a^2 + b^2 = c^2$$", narration: "直角三角形入面，兩條短邊嘅平方和等於斜邊嘅平方。", seconds: 6 },
    { emoji: "🔺", title: "例子", visual: "$3^2 + 4^2 = 9 + 16 = 25 = 5^2$", narration: "例如三、四、五：九加十六等於二十五，啱啱好係五嘅平方。", seconds: 7 },
    { emoji: "⚠️", title: "注意", visual: "$c$ 一定係斜邊（最長）", narration: "記住 c 一定要係斜邊，即係直角對面最長嗰條。", seconds: 5 },
  ];
  v({ title: "勾股定理一分鐘", subject: "數學", topic: "勾股定理", script: draftScenes.map((s) => s.narration).join("\n\n"), scenes: draftScenes, keyPoints: ["a² + b² = c²", "c 係斜邊"], status: "storyboard" }, 5);
  v({ title: "百分數變化（未完成）", subject: "數學", topic: "百分數", script: "今日講百分數增加同減少。\n\n新值 = 原值 × (1 ± 百分率)。", status: "script" }, 2);
  if (s123) db.insert(schema.videoViews).values({ videoId: vFactor, userId: s123.id, viewedAt: ago(20) }).onConflictDoNothing().run();

  // ---- Practice history ------------------------------------------------------------------
  const run = (student: typeof s123, subject: string, topic: string, path: [number, boolean][], h: number, active = false) => {
    if (!student) return;
    const pool = qIds[topic] ?? [];
    const steps = path.map(([level, correct], i) => ({ qid: pool[i % pool.length], level, choice: correct ? 0 : 1, correct, at: ago(h).getTime() + i * 40_000 }));
    const last = path[path.length - 1];
    const level = last[1] ? Math.min(3, last[0] + (path.length > 1 && path[path.length - 2][1] && path[path.length - 2][0] === last[0] ? 1 : 0)) : Math.max(1, last[0] - 1);
    db.insert(schema.practiceSessions).values({ id: id(), studentId: student.id, subject, topic, level, startLevel: path[0][0], steps, target: 8, status: active ? "active" : "done", currentQid: active ? pool[path.length % pool.length] : null, createdAt: ago(h), updatedAt: ago(h - 0.2) }).run();
  };
  run(s123, "數學", "因式分解", [[1, true], [1, true], [2, false], [1, true], [1, true], [2, true], [2, true], [3, false]], 26);
  run(s123, "數學", "二次方程", [[1, true], [1, true], [2, true]], 3, true);
  run(s125, "數學", "統計", [[1, true], [1, true], [2, true], [2, true], [3, true], [3, false], [2, true], [2, true]], 18);

  // ---- Teacher-built apps ------------------------------------------------------------------
  const app = (o: Partial<typeof schema.appListings.$inferInsert> & { title: string }, h: number) =>
    db.insert(schema.appListings).values({ id: id(), ownerId: t09.id, subject: "數學", createdAt: ago(h + 5), updatedAt: ago(h), ...o }).run();
  const pk = APP_TEMPLATES.picker;
  app({ title: "3A 隨機抽問", emoji: pk.emoji, description: "貼名單，一按抽一位（唔重複）", audience: "teacher", html: pk.html, publishedHtml: pk.html, version: 1, status: "approved", reviewNote: "OK", submittedAt: ago(50) }, 48);
  const fc = APP_TEMPLATES.flashcards;
  app({ title: "代數概念閃卡", emoji: fc.emoji, description: "因式分解、判別式、中位數 — 撳卡翻轉", audience: "all", html: fc.html, publishedHtml: fc.html, version: 1, status: "approved", submittedAt: ago(30) }, 29);
  const sb = APP_TEMPLATES.scoreboard;
  app({ ownerId: (t12 ?? t09).id, title: "Vocab Battle scoreboard", emoji: sb.emoji, subject: "英文", description: "Team points for vocabulary games", audience: "all", html: sb.html.replace(/紅隊/g, "Red").replace(/藍隊/g, "Blue").replace(/綠隊/g, "Green").replace(/黃隊/g, "Yellow"), status: "pending", submittedAt: ago(4) }, 4);
  app({ title: "因式分解十字相乘練習器", emoji: "✖️", description: "隨機出 x²+bx+c，學生輸入 p、q", audience: "all", status: "pending", submittedAt: ago(1),
    html: `<!doctype html><html><head><style>body{font-family:system-ui;padding:20px;text-align:center}input{width:4em;font-size:1.2rem;text-align:center}button{font-size:1rem;padding:6px 14px;margin:6px}</style></head><body>
<h2>✖️ 十字相乘練習器</h2><div id="q" style="font-size:1.6rem;margin:12px"></div>
p = <input id="p"> q = <input id="q2"> <br><button id="chk">檢查</button><button id="new">下一題</button><p id="out"></p>
<script>
let P, Q; const r = () => Math.floor(Math.random() * 13) - 6 || 1;
function make() { P = r(); Q = r(); const b = P + Q, c = P * Q; document.getElementById("q").textContent = "x² " + (b < 0 ? "− " : "+ ") + Math.abs(b) + "x " + (c < 0 ? "− " : "+ ") + Math.abs(c); document.getElementById("out").textContent = ""; }
document.getElementById("chk").onclick = () => { const p = +document.getElementById("p").value, q = +document.getElementById("q2").value; document.getElementById("out").textContent = (p * q === P * Q && p + q === P + Q) ? "✓ 啱晒！" : "✗ 再試：p × q 同 p + q 要啱"; };
document.getElementById("new").onclick = make; make();
</script></body></html>` }, 1);
  if (t15) app({ ownerId: t15.id, title: "外部連結測驗", emoji: "🔗", subject: "生物", description: "從外部網站載入題目", audience: "all", html: `<script>fetch("https://example.com/quiz.json").then(r => r.json()).then(q => document.body.textContent = q.title);</script>`, status: "rejected", reviewNote: "應用唔可以由外部網站載入內容（沙盒冇網絡），請將題目放入應用內。", submittedAt: ago(20) }, 19);

  // ---- A pending community share so both moderation queues have content ---------------------------
  if (!db.select().from(schema.communityPosts).where(eq(schema.communityPosts.status, "pending")).all().length && t12) {
    db.insert(schema.communityPosts).values({ id: id(), authorId: t12.id, kind: "worksheet", subject: "英文", title: "Present perfect gap-fill (S2)", description: "10 gap-fill items with answers", content: "# Present perfect\n\n1. I ___ (finish) my homework.\n2. She ___ (live) here since 2020.\n\n**Answers:** 1. have finished 2. has lived", status: "pending", createdAt: ago(6) }).run();
  }

  // ---- Code sandbox project ------------------------------------------------------------------
  if (s123) {
    db.insert(schema.createProjects).values({ id: id(), ownerId: s123.id, kind: "code", title: "平均數同中位數計算機", html: "const marks = [56, 72, 88, 64, 91, 77];\nconst mean = marks.reduce((a, b) => a + b, 0) / marks.length;\nconst s = [...marks].sort((a, b) => a - b);\nconst median = (s[2] + s[3]) / 2;\nconsole.log(\"平均數\", mean.toFixed(1));\nconsole.log(\"中位數\", median);", createdAt: ago(10), updatedAt: ago(9) }).run();
  }

  db.insert(schema.settings).values({ key: "p6SeedInit", value: new Date().toISOString() }).run();
  console.log("• P6 demo data seeded (questions, videos, practice, apps, classes)");
}
