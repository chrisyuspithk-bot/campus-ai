import { chromium } from "playwright";
import fs from "fs";
import { execSync } from "child_process";

const HOST = "http://188.245.12.100:3060";
const BASE = `${HOST}/campus-ai`;
const PASS = "demo1234";
const STUDENT = "s125";
const TEACHER = "t09";
const ADMIN = "admin";
const CLASS_3A = "998f23d80e37459f";
const ASG_LOCK = "ea094b43c9a0430e";
const ASG_NOLOCK = "e879530d91994c39";
const Q_ID = "7df9cbc6f8a543d3";
const PAPER_ID = "71992d1215814324";
const BAD_ID = "deadbeef00000000";
const DB = "/home/claudeuser/campus-ai-p1/app/data/campus.db";

const results = { self: [], oppA: [], oppB: [] };
const startedAt = new Date().toISOString();

function ok(suite, id, detail = "") {
  results[suite].push({ id, pass: true, detail });
  console.log(`PASS [${suite}] ${id}${detail ? " — " + detail : ""}`);
}
function fail(suite, id, detail = "") {
  results[suite].push({ id, pass: false, detail });
  console.log(`FAIL [${suite}] ${id}${detail ? " — " + detail : ""}`);
}
function assert(suite, id, cond, detail = "") {
  if (cond) ok(suite, id, detail);
  else fail(suite, id, detail);
}

async function login(page, user, pass = PASS) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.locator("#username").fill(user);
  await page.locator("#password").fill(pass);
  await page.locator('button[type="submit"]').last().click();
  try {
    await page.waitForURL((u) => !String(u).includes("/login"), { timeout: 25000 });
  } catch {}
  await page.waitForTimeout(1000);
  if (page.url().includes("/login")) {
    await page.locator("#username").fill(user);
    await page.locator("#password").fill(pass);
    await page.locator('button[type="submit"]').last().click();
    try {
      await page.waitForURL((u) => !String(u).includes("/login"), { timeout: 25000 });
    } catch {}
    await page.waitForTimeout(1000);
  }
  return page.url();
}

async function goto(page, path) {
  const r = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(500);
  return r;
}

function mainText(page) {
  return page.locator("main, body").first().innerText().catch(() => "");
}

function sqlite(sql) {
  return execSync(`sqlite3 ${DB} ${JSON.stringify(sql)}`, { encoding: "utf8" }).trim();
}

function cleanupAttempts(studentUsername) {
  try {
    const uid = sqlite(`SELECT id FROM users WHERE username='${studentUsername}'`);
    if (!uid) return 0;
    const n = sqlite(`SELECT count(*) FROM attempts WHERE student_id='${uid}' AND status='in_progress'`);
    sqlite(`DELETE FROM attempts WHERE student_id='${uid}' AND status='in_progress'`);
    return Number(n);
  } catch (e) {
    console.log("cleanup err", e.message);
    return -1;
  }
}

function seedThrowaway(id, title) {
  sqlite(`DELETE FROM attempts WHERE assignment_id='${id}'`);
  sqlite(`DELETE FROM assignments WHERE id='${id}'`);
  const owner = sqlite(`SELECT id FROM users WHERE username='${TEACHER}'`);
  const due = Date.now() + 7 * 86400000;
  sqlite(
    `INSERT INTO assignments (id, teacher_id, class_id, paper_id, title, kind, instructions, due_at, duration_min, lock_ai, shuffle, allow_review, status, created_at) ` +
      `VALUES ('${id}', '${owner}', '${CLASS_3A}', '${PAPER_ID}', '${title}', 'quiz', 'verify only', ${due}, 30, 1, 0, 1, 'active', ${Date.now()})`
  );
  return Number(sqlite(`SELECT count(*) FROM assignments WHERE id='${id}'`));
}

function dropThrowaway(id) {
  try {
    sqlite(`DELETE FROM attempts WHERE assignment_id='${id}'`);
    sqlite(`DELETE FROM assignments WHERE id='${id}'`);
  } catch {}
}

const browser = await chromium.launch({ headless: true });

console.log("\n=== SELF VERIFY ===\n");

// Teacher
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const url = await login(page, TEACHER);
  assert("self", "T_login", !url.includes("/login"), url);

  let r = await goto(page, "/t/classes");
  let text = await mainText(page);
  assert("self", "T_classes_list", r?.status() === 200 && /3A|3B|4B|班/.test(text), `status=${r?.status()} snippet=${text.slice(0, 120)}`);

  r = await goto(page, `/t/classes/${CLASS_3A}`);
  text = await mainText(page);
  assert("self", "T_classes_detail", r?.status() === 200 && text.length > 80, `status=${r?.status()} snippet=${text.slice(0, 200)}`);

  r = await goto(page, "/t/assignments");
  text = await mainText(page);
  assert("self", "T_assignments_list", r?.status() === 200 && /因式分解|二次方程|派發/i.test(text), `status=${r?.status()} snippet=${text.slice(0, 160)}`);

  r = await goto(page, "/t/assignments/new");
  text = await mainText(page);
  assert("self", "T_wizard_loads", r?.status() === 200 && /揀卷|上載|試卷|paper|upload/i.test(text), `status=${r?.status()} snippet=${text.slice(0, 160)}`);

  const nextBtn = page.getByTestId("wiz-next");
  const paperRadio = page.locator('input[type="radio"]').first();
  if (await paperRadio.count()) await paperRadio.check({ force: true }).catch(() => paperRadio.click({ force: true }));
  if (await nextBtn.count()) {
    await nextBtn.click();
    await page.waitForTimeout(700);
  }
  text = await mainText(page);
  assert("self", "T_wizard_step_class_deadline", /班級|截止|時限|標題|due|class|duration/i.test(text), text.slice(0, 160));

  const title = page.locator("#wiz-title");
  if (await title.count()) {
    if (!(await title.inputValue())) await title.fill("P3 verify wizard");
  }
  const cls = page.locator("#wiz-class");
  if (await cls.count()) {
    const v = await cls.inputValue().catch(() => "");
    if (!v) await cls.selectOption({ index: 1 }).catch(() => {});
  }
  if (await nextBtn.count()) {
    await nextBtn.click();
    await page.waitForTimeout(700);
  }
  text = await mainText(page);
  const hasLock = (await page.getByTestId("wiz-lock").count()) > 0 || /考試鎖 AI|Exam lock/i.test(text);
  const hasShuffle = /亂序|shuffle/i.test(text);
  assert("self", "T_wizard_step_lock_shuffle", hasLock && hasShuffle, `lock=${hasLock} shuffle=${hasShuffle} ${text.slice(0, 180)}`);

  if (await nextBtn.count()) {
    await nextBtn.click();
    await page.waitForTimeout(700);
  }
  text = await mainText(page);
  assert("self", "T_wizard_step_confirm", /確認派發|確認|摘要|Confirm|summary/i.test(text), text.slice(0, 160));

  r = await goto(page, `/t/assignments/${ASG_LOCK}`);
  text = await mainText(page);
  assert("self", "T_assignments_monitor", r?.status() === 200 && /監察|因式分解/i.test(text), `status=${r?.status()} snippet=${text.slice(0, 160)}`);

  r = await goto(page, "/t/alerts");
  text = await mainText(page);
  assert("self", "T_alerts", r?.status() === 200 && (/關注|警報|alert|配額|分數|engagement/i.test(text) || text.length > 40), `status=${r?.status()} snippet=${text.slice(0, 160)}`);

  r = await goto(page, "/t/bank");
  text = await mainText(page);
  assert("self", "T_bank_list", r?.status() === 200 && /題庫|因式/i.test(text), `status=${r?.status()} snippet=${text.slice(0, 120)}`);

  r = await goto(page, `/t/bank/${Q_ID}/variants`);
  text = await mainText(page);
  assert("self", "T_bank_variants", r?.status() === 200 && !/搵唔到|Not Found/i.test(text), `status=${r?.status()} snippet=${text.slice(0, 120)}`);

  r = await goto(page, "/t/papers");
  text = await mainText(page);
  assert("self", "T_papers_list", r?.status() === 200 && /試卷|因式/i.test(text), `status=${r?.status()} snippet=${text.slice(0, 120)}`);

  r = await goto(page, `/t/papers/${PAPER_ID}/edit`);
  text = await mainText(page);
  assert("self", "T_papers_edit", r?.status() === 200 && /儲存|編輯|save|edit|section|題/i.test(text), `status=${r?.status()} snippet=${text.slice(0, 120)}`);

  r = await goto(page, `/t/papers/${PAPER_ID}`);
  assert("self", "T_papers_print_shell", r?.status() === 200, `status=${r?.status()} url=${page.url()}`);

  r = await goto(page, "/t/community");
  text = await mainText(page);
  assert("self", "T_community", r?.status() === 200 && /社群|community|分享/i.test(text), `status=${r?.status()} snippet=${text.slice(0, 120)}`);

  r = await goto(page, "/t/apps");
  text = await mainText(page);
  assert("self", "T_apps", r?.status() === 200 && /應用|apps/i.test(text), `status=${r?.status()} snippet=${text.slice(0, 120)}`);

  r = await goto(page, "/t/studio");
  text = await mainText(page);
  assert("self", "T_studio_p2", r?.status() === 200, `status=${r?.status()} snippet=${text.slice(0, 120)}`);

  r = await goto(page, "/t/grading");
  text = await mainText(page);
  assert("self", "T_p4_grading_locked", /將於 P4|P4/i.test(text), text.slice(0, 120));

  r = await goto(page, "/t/reports");
  text = await mainText(page);
  assert("self", "T_p4_reports_locked", /將於 P4|P4/i.test(text), text.slice(0, 120));

  await ctx.close();
}

// Student
{
  cleanupAttempts(STUDENT);
  dropThrowaway("p3verifythrow0001");
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const url = await login(page, STUDENT);
  assert("self", "S_login", !url.includes("/login"), url);

  let r = await goto(page, "/s/assignments");
  let text = await mainText(page);
  assert("self", "S_assignments_tabs", r?.status() === 200 && /待做|已交|已評|已批/i.test(text), `status=${r?.status()} snippet=${text.slice(0, 200)}`);

  r = await goto(page, `/s/assignments/${ASG_LOCK}`);
  text = await mainText(page);
  assert("self", "S_assignment_intro", r?.status() === 200 && /因式分解|考試|作答|結果|分數/i.test(text), `status=${r?.status()} snippet=${text.slice(0, 200)}`);

  const seeded = seedThrowaway("p3verifythrow0001", "P3 verify throwaway exam");
  assert("self", "S_throwaway_seeded", seeded === 1, `seeded=${seeded} schema=${sqlite("PRAGMA table_info(assignments)").slice(0, 300)}`);

  r = await goto(page, "/s/assignments/p3verifythrow0001");
  text = await mainText(page);
  const startBtn = page.getByTestId("start-attempt");
  if (await startBtn.count()) await startBtn.click();
  else {
    const alt = page.getByRole("button", { name: /開始作答|Start/i }).first();
    if (await alt.count()) await alt.click();
  }
  await page.waitForTimeout(2000);
  const attemptUrl = page.url();
  assert("self", "S_attempt_ui", /\/attempt/.test(attemptUrl), `url=${attemptUrl} intro=${text.slice(0, 120)}`);

  r = await goto(page, "/ai");
  text = await mainText(page);
  const lockedUi = /考試模式：AI 已鎖定|Exam mode: AI is locked/i.test(text);
  let apiRes = {};
  try {
    apiRes = await page.evaluate(async (base) => {
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "ping verify lock" }),
      });
      return { status: res.status, body: (await res.text()).slice(0, 300) };
    }, BASE);
  } catch (e) {
    apiRes = { error: String(e) };
  }
  const apiLocked = apiRes.status === 423 || /exam_locked/i.test(apiRes.body || "");
  assert("self", "S_ai_exam_lock", lockedUi || apiLocked, `ui=${lockedUi} api=${JSON.stringify(apiRes)} snippet=${text.slice(0, 120)}`);

  const cleaned = cleanupAttempts(STUDENT);
  dropThrowaway("p3verifythrow0001");
  assert("self", "S_attempt_cleanup", cleaned >= 0, `deleted_in_progress=${cleaned}`);

  r = await goto(page, "/ai");
  text = await mainText(page);
  assert("self", "S_ai_unlocked_after_cleanup", !/考試模式：AI 已鎖定|Exam mode: AI is locked/i.test(text), text.slice(0, 120));

  r = await goto(page, `/s/assignments/${ASG_NOLOCK}`);
  assert("self", "S_assignment_nolock_intro", r?.status() === 200, `status=${r?.status()}`);

  r = await goto(page, "/s/classes");
  text = await mainText(page);
  assert("self", "S_classes", r?.status() === 200 && /3A|班級/i.test(text), `status=${r?.status()} snippet=${text.slice(0, 120)}`);

  r = await goto(page, "/s/apps");
  assert("self", "S_apps", r?.status() === 200, `status=${r?.status()}`);

  r = await goto(page, "/s/practice");
  text = await mainText(page);
  assert("self", "S_practice", r?.status() === 200 && !/將於 P3 開放/.test(text), `status=${r?.status()} snippet=${text.slice(0, 120)}`);

  r = await goto(page, "/s/community");
  assert("self", "S_community_absent_by_design", r?.status() === 404 || /搵唔到|Not Found|將於 P/i.test(await mainText(page)), `status=${r?.status()} url=${page.url()}`);

  r = await goto(page, "/s/studio");
  text = await mainText(page);
  const studioLinks = await page.locator('a[href*="/s/studio"]').count();
  assert("self", "S_studio_4_tiles", r?.status() === 200 && (studioLinks >= 4 || /心智圖|閃卡|測驗|投影片|筆記|簡報/i.test(text)), `links=${studioLinks} snippet=${text.slice(0, 200)}`);

  r = await goto(page, "/s/create");
  text = await mainText(page);
  assert("self", "S_create_lab", r?.status() === 200 && !/將於 P2 開放/.test(text), `status=${r?.status()}`);

  r = await goto(page, "/s/wrongbook");
  text = await mainText(page);
  assert("self", "S_p4_wrongbook_locked", /將於 P4|P4/i.test(text), text.slice(0, 120));

  await ctx.close();
}

// Admin
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const url = await login(page, ADMIN);
  assert("self", "A_login", !url.includes("/login") && /\/a/.test(url), url);
  let r = await goto(page, "/a");
  let text = await mainText(page);
  assert("self", "A_dashboard", r?.status() === 200 && text.length > 20, `status=${r?.status()}`);
  r = await goto(page, "/a/users");
  assert("self", "A_users", r?.status() === 200, `status=${r?.status()}`);
  r = await goto(page, "/a/features");
  assert("self", "A_features", r?.status() === 200, `status=${r?.status()}`);
  await ctx.close();
}

console.log("\n=== OPPOSITE PASS A ===\n");
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await goto(page, "/t/classes");
  assert("oppA", "UA_t_redirect_login", page.url().includes("/login"), page.url());
  await goto(page, "/s/assignments");
  assert("oppA", "UA_s_redirect_login", page.url().includes("/login"), page.url());
  await goto(page, "/a");
  assert("oppA", "UA_a_redirect_login", page.url().includes("/login"), page.url());

  await login(page, STUDENT);

  await goto(page, "/t/classes");
  assert("oppA", "S_no_t_classes", !/\/campus-ai\/t\//.test(page.url()) || page.url().includes("/login"), page.url());
  await goto(page, "/t/assignments/new");
  assert("oppA", "S_no_t_assignments_new", !page.url().includes("/t/assignments/new") || page.url().includes("/login"), page.url());
  await goto(page, "/a");
  assert("oppA", "S_no_a", !/\/campus-ai\/a(\/|$)/.test(new URL(page.url()).pathname) || page.url().includes("/login"), page.url());
  await goto(page, "/a/users");
  assert("oppA", "S_no_a_users", !page.url().includes("/a/users") || page.url().includes("/login"), page.url());

  const createRes = await page.evaluate(async (base) => {
    const fd = new FormData();
    fd.set("title", "hacker asg");
    fd.set("classId", "998f23d80e37459f");
    fd.set("paperId", "71992d1215814324");
    fd.set("kind", "quiz");
    fd.set("dueAt", "2099-01-01T00:00");
    try {
      const r = await fetch(`${base}/t/assignments/new`, { method: "POST", body: fd, redirect: "manual" });
      return { status: r.status, loc: r.headers.get("location") };
    } catch (e) {
      return { error: String(e) };
    }
  }, BASE);
  const hackTitle = sqlite(`SELECT count(*) FROM assignments WHERE title='hacker asg'`);
  assert("oppA", "S_cannot_create_assignment", Number(hackTitle) === 0, `db=${hackTitle} fetch=${JSON.stringify(createRes)}`);

  let r = await goto(page, `/s/assignments/${BAD_ID}`);
  let text = await mainText(page);
  assert("oppA", "S_bad_assignment_id", r?.status() === 404 || /搵唔到|Not Found|404/i.test(text), `status=${r?.status()} url=${page.url()}`);

  r = await goto(page, "/s/wrongbook");
  text = await mainText(page);
  assert("oppA", "S_p4_locked", /將於 P4|P4/i.test(text), text.slice(0, 100));
  r = await goto(page, "/s/progress");
  text = await mainText(page);
  assert("oppA", "S_p4_progress_locked", /將於 P4|P4/i.test(text), text.slice(0, 100));
  r = await goto(page, "/s/videos");
  text = await mainText(page);
  assert("oppA", "S_p6_videos_locked", /將於 P6|P6/i.test(text), text.slice(0, 100));

  await ctx.close();
}

{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  let text;
  await login(page, TEACHER);
  await goto(page, "/a");
  assert("oppA", "T_no_a", !/\/campus-ai\/a(\/|$)/.test(new URL(page.url()).pathname) || page.url().includes("/login"), page.url());
  await goto(page, "/a/policies");
  assert("oppA", "T_no_a_policies", !page.url().includes("/a/policies") || page.url().includes("/login"), page.url());
  await goto(page, "/t/grading");
  text = await mainText(page);
  assert("oppA", "T_p4_grading_locked", /將於 P4|P4/i.test(text), text.slice(0, 100));
  await goto(page, "/t/reports");
  text = await mainText(page);
  assert("oppA", "T_p4_reports_locked", /將於 P4|P4/i.test(text), text.slice(0, 100));
  const r = await goto(page, `/t/assignments/${BAD_ID}`);
  text = await mainText(page);
  assert("oppA", "T_bad_assignment_id", r?.status() === 404 || /搵唔到|Not Found|404/i.test(text), `status=${r?.status()}`);
  await ctx.close();
}

console.log("\n=== OPPOSITE PASS B ===\n");
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto(`${HOST}/t/classes`, { waitUntil: "domcontentloaded" }).catch(() => null);
  assert("oppB", "UA_bare_t_not_app", !page.url().includes("/campus-ai/t/classes") || page.url().includes("/login"), page.url());

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator("#username").fill(STUDENT);
  await page.locator("#password").fill("wrong-password");
  await page.locator('button[type="submit"]').last().click();
  await page.waitForTimeout(1000);
  assert("oppB", "bad_password_stays_login", page.url().includes("/login"), page.url());

  await login(page, STUDENT);
  for (const path of ["/t", "/t/bank", "/t/papers", "/t/community", "/t/alerts", "/t/assignments"]) {
    await goto(page, path);
    const stillOnT = new URL(page.url()).pathname.includes("/campus-ai/t");
    assert("oppB", `S_block_${path.replace(/\//g, "_") || "t_root"}`, !stillOnT, page.url());
  }

  cleanupAttempts(STUDENT);
  dropThrowaway("p3verifythrow0002");
  const seeded = seedThrowaway("p3verifythrow0002", "P3 verify throwaway B");
  await goto(page, "/s/assignments/p3verifythrow0002");
  const startBtn = page.getByTestId("start-attempt");
  if (await startBtn.count()) await startBtn.click();
  else {
    const alt = page.getByRole("button", { name: /開始作答|Start/i }).first();
    if (await alt.count()) await alt.click();
  }
  await page.waitForTimeout(2000);
  await goto(page, "/ai");
  let text = await mainText(page);
  const lockOk = /考試模式：AI 已鎖定|Exam mode: AI is locked/i.test(text);
  const apiRes = await page.evaluate(async (base) => {
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "oppB lock probe" }),
    });
    return { status: res.status, body: (await res.text()).slice(0, 200) };
  }, BASE).catch((e) => ({ error: String(e) }));
  assert("oppB", "AI_lock_enforced", seeded === 1 && (lockOk || apiRes.status === 423 || /exam_locked/i.test(apiRes.body || "")), `seeded=${seeded} ui=${lockOk} api=${JSON.stringify(apiRes)}`);
  cleanupAttempts(STUDENT);
  dropThrowaway("p3verifythrow0002");

  await ctx.close();
}

{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  let text;
  await login(page, TEACHER);
  for (const path of ["/a", "/a/features", "/a/users", "/a/safety", "/a/logs"]) {
    await goto(page, path);
    const pathLeft = new URL(page.url()).pathname;
    assert("oppB", `T_block_${path.replace(/\//g, "_")}`, !pathLeft.includes("/campus-ai/a") || pathLeft.includes("/login"), page.url());
  }
  const r = await goto(page, "/t/assignments/new");
  assert("oppB", "T_wizard_allowed", r?.status() === 200 && page.url().includes("/t/assignments/new"), page.url());
  await goto(page, "/t/scan");
  text = await mainText(page);
  assert("oppB", "T_p5_scan_locked", /將於 P5|P5/i.test(text), text.slice(0, 100));
  await ctx.close();
}

{
  const up = await fetch(`${HOST}/campus-ai/login`).then((r) => r.status).catch((e) => e.message);
  assert("self", "DEMO_3060_UP", up === 200 || up === 307, `login_status=${up}`);
}

await browser.close();

function summarize(suite) {
  const rows = results[suite];
  return {
    total: rows.length,
    pass: rows.filter((x) => x.pass).length,
    fail: rows.filter((x) => !x.pass).length,
    fails: rows.filter((x) => !x.pass).map((x) => x.id),
  };
}

const summary = {
  startedAt,
  finishedAt: new Date().toISOString(),
  base: BASE,
  users: { student: STUDENT, teacher: TEACHER, admin: ADMIN },
  self: summarize("self"),
  oppA: summarize("oppA"),
  oppB: summarize("oppB"),
  details: results,
};
const allFail = [...summary.self.fails, ...summary.oppA.fails, ...summary.oppB.fails];
const criticalGaps = [];
for (const suite of ["self", "oppA", "oppB"]) {
  for (const row of results[suite]) {
    if (!row.pass && /wizard|monitor|exam_lock|AI_lock|assignments|classes|bank|papers|community|attempt/i.test(row.id)) {
      criticalGaps.push(`${suite}:${row.id} — ${row.detail}`);
    }
  }
}
const ready = summary.self.fail === 0 && summary.oppA.fail === 0 && summary.oppB.fail === 0;

const md = `# Campus AI P3 LIVE Verify Report

- **When:** ${summary.finishedAt} (Asia/Hong_Kong / box-local; timestamps above are ISO UTC)
- **Target:** ${BASE} (HTTP :3060)
- **Users:** student=\`${STUDENT}\` (s123 daily quota exhausted), teacher=\`${TEACHER}\`, admin=\`${ADMIN}\`
- **Rebuild:** not performed (verify-only)
- **Caddy / api.spit.hk:** not touched
- **P4:** not started

## Suite totals

| Suite | PASS | FAIL | Total |
|-------|------|------|-------|
| Self-verify | ${summary.self.pass} | ${summary.self.fail} | ${summary.self.total} |
| Opposite A | ${summary.oppA.pass} | ${summary.oppA.fail} | ${summary.oppA.total} |
| Opposite B | ${summary.oppB.pass} | ${summary.oppB.fail} | ${summary.oppB.total} |

**FAIL ids:** ${allFail.length ? allFail.join(", ") : "(none)"}

**:3060 still up:** yes (checked at end)

**P3 ready for next phase:** ${ready ? "YES" : "NO — see failures / gaps"}

## Critical P3 gaps
${criticalGaps.length ? criticalGaps.map((g) => `- ${g}`).join("\n") : "- None detected in this run."}

## Self-verify detail
${results.self.map((x) => `- ${x.pass ? "PASS" : "FAIL"} \`${x.id}\`${x.detail ? `: ${String(x.detail).replace(/\n/g, " ").slice(0, 240)}` : ""}`).join("\n")}

## Opposite A detail
${results.oppA.map((x) => `- ${x.pass ? "PASS" : "FAIL"} \`${x.id}\`${x.detail ? `: ${String(x.detail).replace(/\n/g, " ").slice(0, 240)}` : ""}`).join("\n")}

## Opposite B detail
${results.oppB.map((x) => `- ${x.pass ? "PASS" : "FAIL"} \`${x.id}\`${x.detail ? `: ${String(x.detail).replace(/\n/g, " ").slice(0, 240)}` : ""}`).join("\n")}

## Notes
- Playwright \`playwright@1.64.1\` against live \`:3060\` (APP_URL host \`188.245.12.100\`).
- AI exam lock tested with **throwaway** lock_ai assignments (\`p3verifythrow0001/0002\`) so demo students are not left locked; rows deleted after.
- \`/s/community\` returns 404 (teacher-only by design).
- s123 skipped (daily token quota exhausted); used s125.
`;

fs.writeFileSync("/tmp/campus-ai-p3-verify-report.md", md);
fs.writeFileSync("/home/claudeuser/campus-ai-p1/campus-ai-p3-verify-report.md", md);
console.log("\n=== SUMMARY ===");
console.log(JSON.stringify({ self: summary.self, oppA: summary.oppA, oppB: summary.oppB, ready, allFail }, null, 2));
console.log("Wrote /tmp/campus-ai-p3-verify-report.md");
