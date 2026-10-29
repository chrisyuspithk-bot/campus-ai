/* P7 demo data (tender gap close): distinct OpenRouter models, image-model setting, cross-subject question banks
 * (企會財 / ICT / 生物 / 化學 / 物理), HKDSE tags + long items on 數學, a non-math paper for t09, step-level marks on
 * demo scripts, and one example each of the new document drafts. Additive only.
 * Idempotent: the one-off parts run once per database (marker setting `p7SeedInit`); the catalogue rows only
 * insert when missing, so admin edits in /a/models survive later seeds. */
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import * as schema from "../src/lib/db/schema";
import type { QuestionType, StepMark } from "../src/lib/db/schema";
import { P7_MODELS } from "../src/lib/p7/models";

type DB = BetterSQLite3Database<typeof schema>;
const id = () => randomUUID().replace(/-/g, "").slice(0, 16);

// [topic, type, difficulty, stem, options, answer, marks]
type Q = [string, QuestionType, number, string, string[], string, number];

const BANKS: Record<string, { level: string; qs: Q[] }> = {
  企業會計與財務概論: {
    level: "中四",
    qs: [
      ["會計基礎", "mc", 1, "以下哪一項屬於**資產**？", ["應付賬款", "銀行透支", "存貨", "資本"], "2", 1],
      ["會計基礎", "mc", 2, "會計等式是：", ["資產 = 負債 − 資本", "資產 = 負債 + 資本", "資本 = 資產 + 負債", "負債 = 資產 + 資本"], "1", 1],
      ["會計基礎", "mc", 2, "賒購存貨 \\$5,000，應如何記賬？", ["借 存貨／購貨，貸 應付賬款", "借 應付賬款，貸 購貨", "借 現金，貸 購貨", "借 購貨，貸 現金"], "0", 1],
      ["財務管理", "mc", 2, "流動比率的計算方法是：", ["流動資產 ÷ 流動負債", "流動負債 ÷ 流動資產", "總資產 ÷ 總負債", "淨利 ÷ 銷貨"], "0", 1],
      ["營商環境", "mc", 1, "以下哪一項是**獨資經營**的特點？", ["有限責任", "東主承擔無限責任", "必須有兩名或以上東主", "須向公眾發行股份"], "1", 1],
      ["財務管理", "short", 2, "某公司毛利 \\$40,000，銷貨 \\$160,000。求毛利率（以百分數表示）。", [], "25%|25", 2],
      ["會計基礎", "short", 2, "寫出「試算表」的一個主要用途。", [], "核對借貸總額是否相等|檢查借貸是否平衡|借貸平衡", 2],
      ["財務管理", "long", 3, "陳氏商店年初存貨 \\$12,000，本年購貨 \\$58,000，年末存貨 \\$10,000，銷貨 \\$90,000。\n\n(a) 計算銷貨成本。\n\n(b) 計算毛利。\n\n(c) 計算毛利率，並評論該比率。", [], "(a) 銷貨成本 = 12000 + 58000 − 10000 = 60000 [2]\n(b) 毛利 = 90000 − 60000 = 30000 [1]\n(c) 毛利率 = 30000 ÷ 90000 ≈ 33.3%；與行業平均比較評論 [3]", 6],
    ],
  },
  資訊及通訊科技: {
    level: "中四",
    qs: [
      ["資訊處理", "mc", 1, "二進制數 $1011_2$ 等於十進制的：", ["9", "10", "11", "13"], "2", 1],
      ["資訊處理", "mc", 2, "一個位元組（byte）有多少個位元（bit）？", ["4", "8", "16", "32"], "1", 1],
      ["電腦網絡", "mc", 2, "以下哪個協定用於**安全**瀏覽網頁？", ["HTTP", "FTP", "HTTPS", "SMTP"], "2", 1],
      ["電腦網絡", "mc", 2, "IP 地址的主要作用是：", ["加密數據", "識別網絡上的裝置", "儲存網頁", "壓縮檔案"], "1", 1],
      ["程式設計", "mc", 3, "以下偽代碼輸出甚麼？\n\n`x ← 0`\n`for i ← 1 to 4: x ← x + i`\n`output x`", ["4", "6", "10", "24"], "2", 1],
      ["資訊處理", "short", 2, "把十進制 $13$ 轉為二進制。", [], "1101", 2],
      ["電腦網絡", "short", 2, "寫出一種防止網絡釣魚（phishing）的方法。", [], "檢查網址|不要點擊可疑連結|使用雙重認證|核對寄件人", 2],
      ["程式設計", "long", 3, "設計一個演算法，找出一列 10 個整數中的最大值。\n\n(a) 寫出所需的變數及其用途。\n\n(b) 以偽代碼寫出演算法。\n\n(c) 說明如何測試此演算法。", [], "(a) 陣列 A 存放數字；max 存放目前最大值 [2]\n(b) max ← A[1]；for i ← 2 to 10：if A[i] > max then max ← A[i]；output max [3]\n(c) 用包含負數／最大值在首尾的測試數據 [1]", 6],
    ],
  },
  生物: {
    level: "中四",
    qs: [
      ["細胞與酶", "mc", 1, "以下哪個細胞器是進行**光合作用**的地方？", ["粒線體", "葉綠體", "核糖體", "細胞核"], "1", 1],
      ["細胞與酶", "mc", 2, "酶的活性在高溫下下降，主要原因是：", ["酶被消耗", "酶的活性部位變性", "受質太多", "pH 上升"], "1", 1],
      ["細胞與酶", "mc", 2, "以下哪一項只見於植物細胞而不見於動物細胞？", ["細胞膜", "細胞壁", "細胞質", "粒線體"], "1", 1],
      ["遺傳", "mc", 2, "DNA 中與腺嘌呤（A）配對的鹼基是：", ["胞嘧啶（C）", "鳥嘌呤（G）", "胸腺嘧啶（T）", "尿嘧啶（U）"], "2", 1],
      ["人體生理", "mc", 1, "血液中負責運送氧的是：", ["白血球", "血小板", "紅血球", "血漿"], "2", 1],
      ["細胞與酶", "short", 2, "寫出細胞膜的一項功能。", [], "控制物質進出細胞|選擇性透過|控制物質進出", 2],
      ["遺傳", "short", 2, "人類體細胞有多少條染色體？", [], "46|46條|23對", 2],
      ["細胞與酶", "long", 3, "某學生研究溫度對澱粉酶活性的影響。\n\n(a) 寫出此實驗的自變項及應變項。\n\n(b) 說明須保持不變的兩個因素。\n\n(c) 解釋 60°C 時酶活性下降的原因。", [], "(a) 自變項：溫度；應變項：澱粉消化速率 [2]\n(b) pH、酶與澱粉的濃度及體積 [2]\n(c) 高溫令活性部位變性，酶與受質無法結合 [2]", 6],
    ],
  },
  化學: {
    level: "中四",
    qs: [
      ["原子結構", "mc", 1, "原子核內含有：", ["質子和電子", "質子和中子", "中子和電子", "只有質子"], "1", 1],
      ["原子結構", "mc", 2, "鈉原子（原子序 11）的電子排佈是：", ["2,8,1", "2,9", "2,8,2", "8,2,1"], "0", 1],
      ["酸和鹽基", "mc", 2, "pH 值為 2 的溶液是：", ["強鹼性", "中性", "強酸性", "弱鹼性"], "2", 1],
      ["酸和鹽基", "mc", 2, "酸與鹼中和的產物是：", ["鹽和水", "鹽和氫", "水和氧", "氫和氧"], "0", 1],
      ["化學計量", "mc", 3, "$2\\,\\text{mol}$ 的 $\\text{H}_2\\text{O}$ 質量是多少？（H=1, O=16）", ["18 g", "20 g", "36 g", "34 g"], "2", 1],
      ["化學計量", "short", 2, "計算 $\\text{CO}_2$ 的摩爾質量（C=12, O=16）。", [], "44|44 g/mol|44g/mol", 2],
      ["酸和鹽基", "short", 2, "寫出一種常見的鹼。", [], "氫氧化鈉|NaOH|氫氧化鈣|氨水|氫氧化鉀", 2],
      ["化學計量", "long", 3, "把 $4.0\\,\\text{g}$ 氫氧化鈉（NaOH）溶於水，配成 $250\\,\\text{cm}^3$ 溶液。（Na=23, O=16, H=1）\n\n(a) 計算 NaOH 的摩爾質量。\n\n(b) 計算 NaOH 的摩爾數。\n\n(c) 計算溶液的摩爾濃度。", [], "(a) 23 + 16 + 1 = 40 g/mol [1]\n(b) 4.0 ÷ 40 = 0.1 mol [2]\n(c) 0.1 ÷ 0.25 = 0.4 M [3]", 6],
    ],
  },
  物理: {
    level: "中四",
    qs: [
      ["力和運動", "mc", 1, "力的國際單位是：", ["焦耳", "瓦特", "牛頓", "帕斯卡"], "2", 1],
      ["力和運動", "mc", 2, "一物體以 $2\\,\\text{m s}^{-2}$ 加速，質量 $5\\,\\text{kg}$，所受淨力為：", ["2.5 N", "7 N", "10 N", "3 N"], "2", 1],
      ["熱和氣體", "mc", 2, "水在 1 atm 下的沸點是：", ["0°C", "37°C", "100°C", "273°C"], "2", 1],
      ["電和磁", "mc", 2, "電阻 $R = 4\\,\\Omega$，電流 $I = 3\\,\\text{A}$，電壓為：", ["0.75 V", "7 V", "12 V", "1.33 V"], "2", 1],
      ["電和磁", "mc", 3, "兩個 $6\\,\\Omega$ 電阻並聯，總電阻為：", ["12 Ω", "6 Ω", "3 Ω", "36 Ω"], "2", 1],
      ["力和運動", "short", 2, "一車以 $20\\,\\text{m s}^{-1}$ 行駛 $5\\,\\text{s}$，行了多遠（米）？", [], "100|100m|100 m", 2],
      ["熱和氣體", "short", 2, "寫出熱傳遞的三種方式之一。", [], "傳導|對流|輻射", 2],
      ["力和運動", "long", 3, "一輛 $1200\\,\\text{kg}$ 的汽車由靜止開始，在 $8\\,\\text{s}$ 內勻加速至 $16\\,\\text{m s}^{-1}$。\n\n(a) 求加速度。\n\n(b) 求所需的淨力。\n\n(c) 求這段時間內行駛的距離。", [], "(a) a = 16 ÷ 8 = 2 m/s² [2]\n(b) F = ma = 1200 × 2 = 2400 N [2]\n(c) s = ½ × 16 × 8 = 64 m [2]", 6],
    ],
  },
};

// HKDSE-style long items for 數學 (structured, step-marked).
const DSE_LONG: [string, string, string, string, number][] = [
  ["二次方程", "代數", "（HKDSE 風格）設 $f(x) = x^2 - 6x + k$，其中 $k$ 為常數。\n\n(a) 若方程 $f(x) = 0$ 有兩個相等實根，求 $k$。\n\n(b) 利用 (a) 的 $k$，寫出 $y = f(x)$ 圖像頂點的坐標。\n\n(c) 若 $f(x) = 0$ 有兩個不同實根，求 $k$ 的取值範圍。", "(a) 判別式 36 − 4k = 0，k = 9 [2]\n(b) 頂點 (3, 0) [2]\n(c) 36 − 4k > 0，k < 9 [2]", 6],
  ["統計", "統計", "（HKDSE 風格）某班 8 名學生的測驗分數為：52, 61, 61, 68, 70, 75, 83, 90。\n\n(a) 求平均數及中位數。\n\n(b) 求分佈域。\n\n(c) 若老師把每個分數加 5 分，平均數及分佈域會怎樣改變？", "(a) 平均數 70，中位數 69 [2]\n(b) 分佈域 = 90 − 52 = 38 [1]\n(c) 平均數增加 5 變 75；分佈域不變 38 [2]", 5],
  ["因式分解", "代數", "（HKDSE 風格）(a) 因式分解 $x^2 - 9$。\n\n(b) 由此因式分解 $x^3 - 9x - x^2 + 9$。\n\n(c) 解方程 $x^3 - x^2 - 9x + 9 = 0$。", "(a) (x+3)(x−3) [1]\n(b) (x−1)(x+3)(x−3) [3]\n(c) x = 1, 3, −3 [2]", 6],
];

const step = (label: string, marksAwarded: number, marksMax: number, note: string): StepMark => ({ label, marksAwarded, marksMax, ok: marksAwarded === marksMax, note });

export function seedP7(db: DB) {
  // ---- G1 models: always make sure the catalogue rows exist (inserted once; admin edits survive). ----------
  const first = !db.select().from(schema.settings).where(eq(schema.settings.key, "p7SeedInit")).get();
  for (const m of P7_MODELS) {
    const row = { displayName: m.displayName, openrouterId: m.openrouterId, description: m.description, roles: m.roles, enabled: m.enabled, sortOrder: m.sortOrder };
    // First P7 run re-points the three P1 aliases (all DeepSeek) to distinct providers.
    if (first) db.insert(schema.models).values({ id: m.id, ...row }).onConflictDoUpdate({ target: schema.models.id, set: row }).run();
    else db.insert(schema.models).values({ id: m.id, ...row }).onConflictDoNothing().run();
  }
  // G7: web search on for teachers (admins always get unlocked features); students stay per the admin switch.
  db.update(schema.features).set({ teacherEnabled: true }).where(eq(schema.features.key, "web_search")).run();
  if (!first) return;

  const user = (u: string) => db.select().from(schema.users).where(eq(schema.users.username, u)).get();
  const t09 = user("t09");
  if (!t09) {
    console.log("• P7 seed skipped (no base data)");
    db.insert(schema.settings).values({ key: "p7SeedInit", value: new Date().toISOString() }).run();
    return;
  }

  // ---- G6: no image model works on this key (all 403) → blank = badged demo image. -----------------------
  db.insert(schema.settings).values({ key: "imageModel", value: "" }).onConflictDoUpdate({ target: schema.settings.key, set: { value: "" } }).run();

  // ---- G4: cross-subject banks ---------------------------------------------------------------------------
  let code = 2001;
  const nextCode = () => {
    while (db.select().from(schema.questions).where(eq(schema.questions.code, `Q${code}`)).get()) code++;
    return `Q${code++}`;
  };
  const ids: Record<string, string[]> = {};
  for (const [subject, bank] of Object.entries(BANKS)) {
    ids[subject] = [];
    for (const [topic, type, difficulty, stem, options, answer, marks] of bank.qs) {
      const qid = id();
      db.insert(schema.questions)
        .values({ id: qid, code: nextCode(), ownerId: t09.id, scope: "school", subject, topic, level: bank.level, difficulty, type, stem, options, answer, marks, tags: ["p7", "core"] })
        .run();
      ids[subject].push(qid);
    }
  }

  // ---- G10: HKDSE labels on the school maths bank + long items -------------------------------------------
  const group: Record<string, string> = { 因式分解: "代數", 二次方程: "代數", 統計: "統計" };
  const math = db.select().from(schema.questions).where(and(eq(schema.questions.subject, "數學"), eq(schema.questions.scope, "school"))).all();
  for (const q of math) {
    const g = group[q.topic];
    if (!g || q.tags.includes("hkdse")) continue;
    db.update(schema.questions).set({ tags: [...q.tags, "hkdse", g] }).where(eq(schema.questions.id, q.id)).run();
  }
  for (const [topic, g, stem, answer, marks] of DSE_LONG) {
    db.insert(schema.questions)
      .values({ id: id(), code: nextCode(), ownerId: t09.id, scope: "school", subject: "數學", topic, level: "中五", difficulty: 3, type: "long", stem, options: [], answer, marks, tags: ["hkdse", g, "長題"] })
      .run();
  }

  // ---- G4: one non-math paper for t09 --------------------------------------------------------------------
  const bio = db.select().from(schema.questions).where(eq(schema.questions.subject, "生物")).all().filter((q) => ids["生物"].includes(q.id));
  db.insert(schema.papers)
    .values({
      id: id(),
      ownerId: t09.id,
      title: "生物 · 細胞與酶 小測（P7 示範）",
      subject: "生物",
      durationMin: 30,
      lockAi: true,
      sections: [
        { title: "甲部 選擇題", questionIds: bio.filter((q) => q.type === "mc").map((q) => q.id) },
        { title: "乙部 結構題", questionIds: bio.filter((q) => q.type !== "mc").map((q) => q.id) },
      ],
    })
    .run();

  // ---- G3: step-level marks on the 因式分解測驗 long question (Q1008) --------------------------------------
  const q1008 = db.select().from(schema.questions).where(eq(schema.questions.code, "Q1008")).get();
  if (q1008) {
    const a = "(a) (x+2)(x+3)";
    const b = "(b) x+3 米";
    const c = "(c) 闊 6、長 7，周界 26 米";
    // [student, assignment title like, steps (as AI draft or teacher-final)]
    const plan: [string, string, "ai" | "teacher", StepMark[]][] = [
      ["s126", "因式分解測驗（上週）", "ai", [step(a, 2, 2, "十字相乘正確"), step(b, 1, 1, "長正確"), step(c, 1, 3, "長、闊正確，但周界應為 2(長+闊) = 26 米")]],
      ["s127", "因式分解測驗（上週）", "teacher", [step(a, 2, 2, "十字相乘正確"), step(b, 1, 1, "長正確"), step(c, 1, 3, "周界計錯：要加兩次長同闊")]],
      ["s125", "因式分解測驗（上週）", "teacher", [step(a, 2, 2, "因式分解正確"), step(b, 1, 1, "長正確"), step(c, 2, 3, "求得闊，但未寫周界")]],
      ["s127", "因式分解紙本測驗（掃描）", "ai", [step(a, 2, 2, "手寫辨識：正確"), step(b, 1, 1, "手寫辨識：正確"), step(c, 3, 3, "手寫辨識：周界 26 米正確")]],
    ];
    for (const [username, title, kind, steps] of plan) {
      const s = user(username);
      if (!s) continue;
      const rows = db
        .select({ att: schema.attempts, g: schema.grades })
        .from(schema.attempts)
        .innerJoin(schema.assignments, eq(schema.assignments.id, schema.attempts.assignmentId))
        .innerJoin(schema.grades, eq(schema.grades.attemptId, schema.attempts.id))
        .where(and(eq(schema.attempts.studentId, s.id), eq(schema.assignments.title, title), eq(schema.assignments.teacherId, t09.id)))
        .all()
        .filter((r) => r.g.marks[q1008.id]);
      const r = rows[0];
      if (!r) continue;
      const m = r.g.marks[q1008.id];
      const total = steps.reduce((n, x) => n + x.marksAwarded, 0);
      // Teacher-final steps only where they match the already-released score, so no student's total changes.
      if (kind === "teacher" && m.score !== total) continue;
      const next = kind === "ai" ? { ...m, aiSteps: steps, ai: total } : { ...m, aiSteps: m.aiSteps ?? steps, steps };
      const marks = { ...r.g.marks, [q1008.id]: next };
      const aiTotal = Object.values(marks).reduce((n, x) => n + (x.ai ?? 0), 0);
      db.update(schema.grades).set({ marks, aiTotal }).where(eq(schema.grades.attemptId, r.att.id)).run();
    }
  }

  // ---- G8: one example of each new document draft for t09 -------------------------------------------------
  const drafts: [schema.DraftType, string, string][] = [
    ["notice", "家長通知：中三數學科補課安排", "# 家長通知：中三數學科補課安排\n\n敬啟者：\n\n本校將於十一月逢星期三放學後（下午 3:45–4:45）為中三學生安排數學科補課，重點溫習因式分解及二次方程。\n\n1. 對象：3A、3B 學生\n2. 地點：301 室\n3. 負責老師：陳老師\n\n此致\n貴家長\n\n校長　　　　謹啟\n\n---\n\n### 回條\n\n學生姓名：＿＿＿＿　班別：＿＿　家長簽署：＿＿＿＿"],
    ["report_card", "3A 數學 成績單（上學期）", "# 3A 數學 成績單（上學期）\n\n| 學生 | 平均 % | 已交 | 評語 |\n|---|---|---|---|\n| s123 | 72 | 3/3 | 表現穩定，注意計算細節。 |\n| s125 | 80 | 3/3 | 表現優異，繼續保持。 |\n| s126 | 64 | 2/3 | 要加強長題步驟完整性。 |\n\n**全班平均：** 72%"],
    ["progress_report", "3A 數學 進度報告（十月）", "# 3A 數學 進度報告（十月）\n\n## 概覽\n- 已完成課題：因式分解、二次方程\n- 全班平均：72%\n\n## 需要支援的學生\n- s126、s132（長題步驟）\n\n## 下一步教學行動\n1. 周界／面積應用題加強練習\n2. 安排自適應練習及影相練習"],
  ];
  for (const [type, title, content] of drafts) {
    db.insert(schema.drafts).values({ id: id(), ownerId: t09.id, title, type, subject: "數學", content }).run();
  }

  db.insert(schema.settings).values({ key: "p7SeedInit", value: new Date().toISOString() }).run();
  console.log(`• P7 seed: ${P7_MODELS.length} models, ${Object.values(BANKS).reduce((n, b) => n + b.qs.length, 0)} cross-subject + ${DSE_LONG.length} HKDSE questions, 1 paper, step marks, 3 drafts`);
}
