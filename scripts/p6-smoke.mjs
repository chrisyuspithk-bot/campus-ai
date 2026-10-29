// P6 smoke against the live demo: adaptive practice (level up/down, AI concept hint, wrongbook, summary),
// animated explainer, /s/videos, /t/media script → storyboard → draft → publish, create-lab code sandbox
// (run / timeout / no network), apps package → admin moderation → gallery, /a/org matrix, exam lock on P6
// pages, and P1–P5 routes still 200. Cleans up what it creates. Usage: node scripts/p6-smoke.mjs
import { chromium } from "playwright";
import { execSync } from "child_process";

const BASE = process.env.BASE ?? "http://188.245.12.100:3060/campus-ai";
const DB = new URL("../data/campus.db", import.meta.url).pathname;
const sql = (q) => execSync(`sqlite3 "${DB}" "${q.replace(/"/g, '\\"')}"`).toString().trim();
const STUDENT = process.env.P6_STUDENT ?? "s125";
let failed = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failed++;
};

async function session(browser, user) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
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

// Clean previous runs.
const SID = sql(`select id from users where username='${STUDENT}'`);
sql(`delete from practice_sessions where student_id='${SID}' and topic='因式分解'`);
sql("delete from videos where title like '煙測短片%'");
sql("delete from app_listings where title like '煙測應用%'");
sql(`delete from create_projects where owner_id='${SID}' and kind='code'`);

const browser = await chromium.launch();

// ---- Teacher t09: media studio + app packaging -------------------------------------------------
{
  const { page } = await session(browser, "t09");
  check("t09 nav: 多媒體工作室 unlocked", (await page.locator(`nav a[href$="/t/media"]`).count()) > 0);
  check("/t/media 200", (await status(page, "/t/media")) === 200);
  check("/t/media lists seeded videos", (await page.getByTestId("media-list").locator("li").count()) >= 4);
  await page.locator('[data-testid="media-new"] input[name="title"]').fill("煙測短片：十字相乘");
  await page.locator('[data-testid="media-new"] input[name="topic"]').fill("因式分解");
  await page.locator('[data-testid="media-new"] button').click();
  await page.waitForURL(/\/t\/media\/[a-z0-9]+$/);
  await page.getByTestId("media-gen-script").click();
  await page.waitForFunction(() => document.querySelector('[data-testid="media-script"]')?.value.length > 30, null, { timeout: 90000 });
  check("AI script generated", true, (await page.getByTestId("media-script").inputValue()).slice(0, 60).replace(/\n/g, " "));
  await page.getByTestId("media-gen-board").click();
  await page.getByTestId("media-scenes").waitFor({ timeout: 90000 });
  const scenes = await page.getByTestId("media-scenes").locator("li").count();
  check("storyboard generated", scenes >= 2, `${scenes} scenes`);
  await page.getByTestId("media-render").click();
  await page.getByTestId("scene-player").waitFor({ timeout: 30000 });
  check("short-video draft rendered (player)", (await page.getByTestId("media-render-info").innerText()).includes("mock"));
  await page.getByTestId("media-publish").click();
  await page.waitForFunction(() => /已發佈|Published/.test(document.querySelector('[data-testid="media-status"]')?.textContent ?? ""), null, { timeout: 15000 });
  check("video published", sql("select status from videos where title like '煙測短片%'") === "published");

  check("/t/apps 200", (await status(page, "/t/apps")) === 200);
  check("my apps section", await page.getByTestId("my-apps").isVisible());
  await page.getByTestId("app-new-picker").click();
  await page.waitForURL(/\/t\/apps\/build\/[a-z0-9]+$/);
  check("build page + sandbox preview", (await page.getByTestId("app-preview").getAttribute("sandbox")) === "allow-scripts");
  const frame = page.frameLocator('[data-testid="app-preview"]');
  await frame.locator("#go").click();
  check("preview app runs (script in sandbox)", /剩餘/.test(await frame.locator("#left").innerText()));
  await page.getByTestId("app-title").fill("煙測應用 抽問");
  await page.getByTestId("app-submit").click();
  await page.waitForFunction(() => /審核中|In review/.test(document.querySelector('[data-testid="app-status"]')?.textContent ?? ""), null, { timeout: 15000 });
  check("app submitted for review", sql("select status from app_listings where title='煙測應用 抽問'") === "pending");
  for (const p of ["/t", "/t/drafts", "/t/studio", "/t/tutors", "/t/bank", "/t/papers", "/t/classes", "/t/assignments", "/t/alerts", "/t/grading", "/t/scan", "/t/reports", "/t/community"]) {
    check(`t09 ${p} 200`, (await status(page, p)) === 200);
  }
}

// ---- Admin: moderation + org --------------------------------------------------------------------
{
  const { page } = await session(browser, "admin");
  check("/a/moderation 200", (await status(page, "/a/moderation")) === 200);
  const queue = page.getByTestId("app-queue");
  check("app listing queue visible", (await queue.locator("> li").count()) >= 3, `${await queue.locator("> li").count()} pending`);
  const item = queue.locator("> li", { hasText: "煙測應用 抽問" });
  await item.getByTestId("app-approve").click();
  await page.waitForFunction(() => !document.body.innerText.includes("煙測應用 抽問") || document.querySelector('[data-testid="app-live"]')?.textContent?.includes("煙測應用"), null, { timeout: 15000 });
  check("app approved → live v1", sql("select status||'/'||version||'/'||(published_html<>'') from app_listings where title='煙測應用 抽問'") === "approved/1/1");
  await page.goto(`${BASE}/a/moderation?tab=community`);
  check("community queue tab", (await page.getByTestId("moderation-queue").count()) > 0 || /冇|No /.test(await page.locator("main").innerText()));
  check("/a/org 200", (await status(page, "/a/org")) === 200);
  check("org grade × subject grid", (await page.getByTestId("org-grid").locator("tbody tr").count()) === 6);
  check("org permission matrix", (await page.getByTestId("org-perms").locator("input[type=checkbox]").count()) >= 9);
  check("features has media (P6) switch", (await status(page, "/a/features")) === 200 && /多媒體工作室/.test(await page.locator("main").innerText()));
  for (const p of ["/a", "/a/models", "/a/users", "/a/safety", "/a/policies", "/a/logs", "/a/analytics"]) check(`admin ${p} 200`, (await status(page, p)) === 200);
}

// ---- Student: adaptive practice, videos, create sandbox, apps --------------------------------------
{
  const { page } = await session(browser, STUDENT);
  check(`${STUDENT} nav: 講解短片 unlocked`, (await page.locator(`nav a[href$="/s/videos"]`).count()) > 0);
  check("/s/practice 200", (await status(page, "/s/practice")) === 200);
  const topic = page.getByTestId("practice-topic").filter({ hasText: "因式分解" }).first();
  await topic.getByRole("button", { name: /自適應練習|Adaptive/ }).click();
  await page.waitForURL(/\/s\/practice\/session\/[a-z0-9]+$/);
  const sessId = page.url().split("/").pop();
  const levels = [];
  const lvl = async () => Number(await page.getByTestId("adaptive-level").locator("[data-level]").getAttribute("data-level"));
  levels.push(await lvl());
  // AI concept hint on the first question (gate: quota/safety/exam lock).
  await page.getByTestId("adaptive-ask").fill("十字相乘點揀數？");
  await page.getByRole("button", { name: /問概念|Ask$/ }).click();
  await page.getByTestId("adaptive-hint").waitFor({ timeout: 90000 });
  check("AI concept hint shown", (await page.getByTestId("adaptive-hint").innerText()).length > 20);
  const plan = [true, true, true, true, false, true, true, true]; // q1 hinted → no streak credit
  for (let i = 0; i < plan.length; i++) {
    const qid = sql(`select current_qid from practice_sessions where id='${sessId}'`);
    if (!qid) break;
    const ans = Number(sql(`select answer from questions where id='${qid}'`));
    const n = Number(sql(`select json_array_length(options) from questions where id='${qid}'`));
    await page.getByTestId(`adaptive-opt-${plan[i] ? ans : (ans + 1) % n}`).click();
    await page.getByTestId("adaptive-submit").click();
    await page.getByTestId("adaptive-feedback").waitFor();
    const done = /睇結果|See results/.test(await page.getByTestId("adaptive-next").innerText());
    await page.getByTestId("adaptive-next").click();
    if (done) break;
    await page.getByTestId("adaptive-submit").waitFor();
    levels.push(await lvl());
  }
  // hinted q1 ✓ (no credit) → q2 ✓ → q3 ✓ (L2) → q4 ✓ → q5 ✓ (L3) … wait for path
  check("difficulty adapted up", Math.max(...levels) > levels[0], `levels ${levels.join("→")}`);
  const wrongIdx = plan.indexOf(false);
  check("wrong answer → level down", levels[wrongIdx + 1] < levels[wrongIdx], `L${levels[wrongIdx]} → L${levels[wrongIdx + 1]}`);
  await page.getByTestId("practice-summary").waitFor({ timeout: 15000 });
  check("summary page", (await page.getByTestId("practice-summary").innerText()).includes("%"));
  check("session stored done with 8 steps", sql(`select status||'/'||json_array_length(steps) from practice_sessions where id='${sessId}'`) === "done/8");
  check("wrong answer saved to wrongbook (practice)", Number(sql(`select count(*) from wrong_items where student_id='${SID}' and source='practice'`)) >= 1);

  check("/s/practice/animate 200", (await status(page, `/s/practice/animate?subject=${encodeURIComponent("數學")}&topic=${encodeURIComponent("因式分解")}`)) === 200);
  const cap1 = await page.getByTestId("scene-caption").innerText();
  await page.getByTestId("scene-play").click();
  await page.waitForFunction((c) => document.querySelector('[data-testid="scene-caption"]')?.textContent !== c, cap1, { timeout: 15000 });
  check("animated explainer plays (scene advances)", true);

  check("/s/videos 200", (await status(page, "/s/videos")) === 200);
  const cards = await page.getByTestId("video-card").count();
  check("videos list (seed + smoke)", cards >= 5 && (await page.locator("main").innerText()).includes("煙測短片"), `${cards} videos`);
  await page.getByTestId("video-card").first().click();
  await page.getByTestId("video-keypoints").waitFor();
  check("video page: player + key points", (await page.getByTestId("scene-player").count()) === 1 && (await page.getByTestId("video-keypoints").locator("li").count()) >= 2);
  check("view recorded", Number(sql(`select count(*) from video_views where user_id='${SID}'`)) >= 1);

  check("/s/create 200", (await status(page, "/s/create")) === 200);
  await page.getByTestId("create-new-code").click();
  await page.waitForURL(/\/s\/create\/[a-z0-9]+$/);
  await page.getByTestId("code-editor").fill('const xs = [1, 2, 3, 4];\nconsole.log("sum", xs.reduce((a, b) => a + b, 0));\nconsole.log({ ok: true });');
  await page.getByTestId("code-run").click();
  await page.getByTestId("code-status").waitFor({ timeout: 10000 });
  const out = await page.getByTestId("code-output").innerText();
  check("sandbox runs snippet", out.includes("sum 10") && out.includes('{"ok":true}') && /完成|Done/.test(await page.getByTestId("code-status").innerText()), out.replace(/\n/g, " | "));
  await page.getByTestId("code-editor").fill("let n = 0; while (true) n++;");
  await page.getByTestId("code-run").click();
  await page.getByTestId("code-status").waitFor({ timeout: 10000 });
  check("sandbox timeout stops infinite loop", /超時|Timed out/.test(await page.getByTestId("code-status").innerText()));
  await page.getByTestId("code-editor").fill('await fetch("https://example.com"); console.log("LEAK");');
  await page.getByTestId("code-run").click();
  await page.getByTestId("code-status").waitFor({ timeout: 10000 });
  const net = await page.getByTestId("code-output").innerText();
  check("sandbox blocks network", !net.includes("LEAK") && /network|網絡/.test(net), net.slice(0, 100));
  await page.getByTestId("code-editor").fill('console.log(typeof document, typeof localStorage, typeof XMLHttpRequest === "function" ? "xhr-stub" : "");');
  await page.getByTestId("code-run").click();
  await page.getByTestId("code-status").waitFor({ timeout: 10000 });
  check("sandbox has no DOM/storage", (await page.getByTestId("code-output").innerText()).startsWith("undefined undefined"));
  await page.getByTestId("code-save").click();
  await page.waitForTimeout(800);
  check("code saved", sql(`select count(*) from create_projects where owner_id='${SID}' and kind='code' and html like '%typeof document%'`) === "1");

  check("/s/apps 200", (await status(page, "/s/apps")) === 200);
  const apps = await page.getByTestId("custom-app").allInnerTexts();
  check("student gallery: approved teacher apps (not teacher-only)", apps.some((a) => a.includes("代數概念閃卡")) && apps.some((a) => a.includes("煙測應用")) && !apps.some((a) => a.includes("3A 隨機抽問")), `${apps.length} apps`);
  await page.getByTestId("custom-app").filter({ hasText: "代數概念閃卡" }).getByRole("button").click();
  const f = page.frameLocator('[data-testid="custom-app-frame"]');
  await f.locator("#next").click();
  check("teacher app runs in sandbox", /2 \/ 4/.test(await f.locator("#n").innerText()));

  for (const p of ["/s", "/ai", "/s/tutors", "/s/studio", "/s/essay", "/s/library", "/s/assignments", "/s/classes", "/s/wrongbook", "/s/progress", "/s/progress/gaps"]) {
    check(`${STUDENT} ${p} 200`, (await status(page, p)) === 200);
  }
}

// ---- Exam lock: P6 practice / animate / AI are closed during an AI-locked exam ----------------------------
{
  const LOCK_USER = "s126";
  const uid = sql(`select id from users where username='${LOCK_USER}'`);
  const asg = sql(`select a.id from assignments a join classes c on c.id=a.class_id join class_members m on m.class_id=c.id where m.user_id='${uid}' and a.lock_ai=1 and a.status='active' and a.due_at > ${Date.now() + 3600_000} and a.id not in (select assignment_id from attempts where student_id='${uid}') limit 1`);
  if (!asg) check("exam-lock fixture available", false, "no lockable assignment for " + LOCK_USER);
  else {
    const attId = "p6smoke" + Date.now().toString(36);
    sql(`insert into attempts (id, assignment_id, student_id, status, started_at) values ('${attId}', '${asg}', '${uid}', 'in_progress', ${Date.now()})`);
    try {
      const { page } = await session(browser, LOCK_USER);
      for (const p of ["/s/practice", "/s/practice/animate?topic=x"]) {
        await page.goto(`${BASE}${p}`);
        check(`exam lock blocks ${p}`, (await page.getByTestId("exam-locked").count()) === 1);
      }
    } finally {
      sql(`delete from attempts where id='${attId}'`);
    }
  }
}

await browser.close();
// Leave demo data tidy: remove the smoke video + app (the practice run and code project stay as history).
sql("delete from videos where title like '煙測短片%'");
sql("delete from app_listings where title like '煙測應用%'");
console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
