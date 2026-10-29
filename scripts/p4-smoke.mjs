// P4 smoke against the live demo: grading queue → workbench → score writeback, student result + wrongbook + redo,
// progress numbers, reports CSV, analytics, plus P1–P3 route regression. Usage: node scripts/p4-smoke.mjs
import { chromium } from "playwright";
import { execSync } from "child_process";

const BASE = process.env.BASE ?? "http://188.245.12.100:3060/campus-ai";
const DB = new URL("../data/campus.db", import.meta.url).pathname;
const sql = (q) => execSync(`sqlite3 "${DB}" "${q.replace(/"/g, '\\"')}"`).toString().trim();
let failed = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failed++;
};

async function session(browser, user) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator("#username").fill(user);
  await page.locator("#password").fill("demo1234");
  await page.locator('button[type="submit"]').last().click();
  await page.waitForURL((u) => !String(u).includes("/login"), { timeout: 20000 });
  return { ctx, page };
}
async function status(page, path) {
  const r = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  return r.status();
}

const browser = await chromium.launch();
const ASG = sql("select id from assignments where title='因式分解測驗（上週）'");

// ---- Teacher t09 ---------------------------------------------------------------------------
{
  const { page } = await session(browser, "t09");
  for (const p of ["/t", "/t/classes", "/t/assignments", "/t/alerts", "/t/bank", "/t/papers", "/t/community", "/t/studio", "/t/drafts", "/t/tutors", "/t/grading/essay", "/t/reports", "/t/grading"]) {
    check(`t09 ${p} 200`, (await status(page, p)) === 200);
  }
  await page.goto(`${BASE}/t`);
  check("t09 /t dashboard KPIs", await page.getByTestId("teacher-kpis").isVisible(), await page.getByTestId("kpi-grade").innerText());
  await page.goto(`${BASE}/t/grading?state=pending&assignment=${ASG}`);
  const tabs = await page.getByTestId("grading-tabs").innerText();
  check("queue tabs show counts", /未批\s*\d+/.test(tabs) && /進行中\s*\d+/.test(tabs) && /完成\s*\d+/.test(tabs), tabs.replace(/\s+/g, " "));
  check("queue links essay review", await page.getByTestId("grading-essay-link").isVisible());
  // Pick s125's pending attempt for last week's quiz.
  const attId = sql(`select t.id from attempts t join users u on u.id=t.student_id where t.assignment_id='${ASG}' and u.username='s125'`);
  await page.goto(`${BASE}/t/grading/${attId}`);
  check("workbench 3 columns", (await page.getByTestId("wb-students").isVisible()) && (await page.getByTestId("wb-script").isVisible()) && (await page.getByTestId("wb-rubric").isVisible()));
  // AI draft (OpenRouter if key, else rule-based mock)
  await page.getByRole("button", { name: /AI 初評/ }).click();
  await page.waitForURL(/ai=1|err=/, { timeout: 90000 });
  check("AI draft ran", page.url().includes("ai=1"), page.url().split("?")[1]);
  const nQ = await page.locator('[data-testid^="wb-score-"]').count();
  await page.getByTestId(`wb-score-${nQ - 1}`).fill("5");
  await page.getByTestId("wb-comment").fill("煙測：長答 (c) 周界要乘 2。");
  await page.getByTestId("wb-done").click();
  await page.waitForURL((u) => !String(u).includes(attId) || String(u).includes("saved=1"), { timeout: 20000 });
  const row = sql(`select t.needs_marking, t.score, t.max_score, g.status, g.comment from attempts t join grades g on g.attempt_id=t.id where t.id='${attId}'`);
  check("score written back (needs_marking=0, grade done)", /^0\|\d+\|17\|done\|煙測/.test(row), row);
  check("done → next item", page.url().includes("saved=1"), page.url().replace(BASE, ""));
  const sid = sql("select id from users where username='s125'");
  check("t09 /t/students/:id", (await status(page, `/t/students/${sid}`)) === 200 && (await page.getByTestId("student-kpis").isVisible()));
  const cls = sql("select id from classes where name='3A' and subject='數學'");
  const csv = await page.request.get(`${BASE}/api/reports/class/${cls}`);
  const body = await csv.text();
  check("reports CSV", csv.status() === 200 && (csv.headers()["content-type"] ?? "").includes("text/csv") && body.split("\n").length > 10 && body.includes("s125"), `${body.split("\n").length - 1} lines; ${body.split("\n")[0].slice(0, 80)}`);
  await page.goto(`${BASE}/t/reports?class=${cls}`);
  check("reports table", (await page.getByTestId("report-table").locator("tbody tr").count()) >= 10);
  check("P6 /t/media still locked (P5 unlocked)", /P6/.test(await (await page.goto(`${BASE}/t/media`)).text()));
  globalThis.s125Score = row.split("|")[1];
}

// ---- Student s125 sees the teacher's score -------------------------------------------------
{
  const { page } = await session(browser, "s125");
  await page.goto(`${BASE}/s/assignments/${ASG}/result`);
  const score = await page.getByTestId("result-score").innerText().catch(() => "");
  check("s125 result shows written-back score", score.replace(/\s/g, "").startsWith(`${globalThis.s125Score}/17`), score.replace(/\s/g, ""));
  check("s125 sees teacher comment", (await page.getByTestId("teacher-comment").innerText().catch(() => "")).includes("煙測"));
}

// ---- Student s123 ---------------------------------------------------------------------------
{
  const { page } = await session(browser, "s123");
  for (const p of ["/s", "/ai", "/s/tutors", "/s/studio", "/s/essay", "/s/create", "/s/library", "/s/assignments", "/s/classes", "/s/apps", "/s/practice", "/s/wrongbook", "/s/progress"]) {
    check(`s123 ${p} 200`, (await status(page, p)) === 200);
  }
  await page.goto(`${BASE}/s/assignments/${ASG}/result`);
  check("s123 result score + sections", (await page.getByTestId("result-score").isVisible()) && (await page.getByTestId("result-sections").isVisible()), (await page.getByTestId("result-score").innerText()).replace(/\s/g, ""));
  check("s123 teacher notes visible", (await page.getByTestId("teacher-note").count()) > 0);
  const before = Number(sql("select count(*) from wrong_items w join users u on u.id=w.student_id where u.username='s123'"));
  const addBtn = page.getByTestId("add-wrongbook");
  if (await addBtn.count()) {
    await addBtn.click();
    await page.waitForURL(/added=/);
  } else {
    // All already in the book: remove one and re-add it through the per-question button.
    sql(`delete from wrong_items where id=(select w.id from wrong_items w join users u on u.id=w.student_id where u.username='s123' and w.assignment_id='${ASG}' limit 1)`);
    await page.reload();
    await page.getByTestId("add-wrongbook").click();
    await page.waitForURL(/added=/);
  }
  const after = Number(sql("select count(*) from wrong_items w join users u on u.id=w.student_id where u.username='s123'"));
  check("result → 錯題入簿 adds items", after >= before && (await page.getByTestId("wrong-added").isVisible()), `${before} → ${after}`);
  check("s123 script view", (await status(page, `/s/assignments/${ASG}/script`)) === 200 && (await page.getByTestId("script-list").isVisible()));
  await page.goto(`${BASE}/s/wrongbook`);
  const items = await page.getByTestId("wrong-item").count();
  check("wrongbook lists items by topic", items > 0 && (await page.getByTestId("wrongbook-groups").isVisible()), `${items} items`);
  await page.getByTestId("redo-topic").first().click();
  await page.waitForURL(/wrongbook\/redo/);
  check("[重做] → /s/wrongbook/redo", await page.getByTestId("redo-card").isVisible());
  const opt = page.getByTestId("redo-opt-0");
  if (await opt.count()) {
    await opt.click();
  } else if (await page.getByTestId("redo-input").count()) {
    await page.getByTestId("redo-input").fill("test");
  }
  await page.getByTestId("redo-check").click();
  check("redo gives feedback", await page.getByTestId("redo-feedback").isVisible());
  await page.waitForTimeout(800);
  const redone = sql("select count(*) from wrong_items w join users u on u.id=w.student_id where u.username='s123' and w.redo_count>0");
  check("redo recorded", Number(redone) > 0, `${redone} with redo history`);
  await page.goto(`${BASE}/s/progress`);
  const kpis = await page.getByTestId("progress-kpis").innerText();
  check("progress KPIs have numbers", /\d+\s*天/.test(kpis) && /\d/.test(await page.getByTestId("kpi-chats").innerText()), kpis.replace(/\s+/g, " "));
  check("progress radar + recs", (await page.locator("svg[role=img]").count()) >= 2 && (await page.getByTestId("progress-recs").locator("li").count()) >= 2);
  check("P6 /s/videos still locked (P5 unlocked)", /P6/.test(await (await page.goto(`${BASE}/s/videos`)).text()));
}

// ---- Admin ----------------------------------------------------------------------------------
{
  const { page } = await session(browser, "admin");
  for (const p of ["/a", "/a/features", "/a/models", "/a/users", "/a/safety", "/a/policies", "/a/logs", "/a/org", "/a/moderation", "/a/analytics"]) {
    check(`admin ${p} 200`, (await status(page, p)) === 200);
  }
  await page.goto(`${BASE}/a/analytics`);
  const k = await page.getByTestId("analytics-kpis").innerText();
  check("analytics KPIs", /\d+\/\d+/.test(k) && (await page.getByTestId("analytics-classes").locator("tbody tr").count()) >= 3, k.replace(/\s+/g, " ").slice(0, 160));
}

await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
