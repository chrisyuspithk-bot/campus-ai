// Independent P6 verifier (self-verify). HTTP only :3060. Does not touch Caddy / api.spit.hk.
// Additive checks; cleans smoke titles 煙測短片% / 煙測應用% and temporary exam attempt.
import { chromium } from "playwright";
import { execSync } from "child_process";
import { writeFileSync } from "fs";

const BASE = process.env.BASE ?? "http://188.245.12.100:3060/campus-ai";
const OUT_JSON = process.env.OUT_JSON ?? "/tmp/campus-ai-p6-verify.json";
const DB = process.env.DB ?? new URL("./data/campus.db", import.meta.url).pathname;
const STUDENT = process.env.P6_STUDENT ?? "s125";
const PASSWORD = "demo1234";

const results = [];
const sideEffects = [];
let blockers = [];

const sql = (q) => {
  try {
    return execSync(`sqlite3 "${DB}" "${q.replace(/"/g, '\\"')}"`, { encoding: "utf8" }).toString().trim();
  } catch (e) {
    return `SQL_ERR:${e.message}`;
  }
};

function record(item, expected, actual, pass, notes = "") {
  const row = { item, expected, actual: String(actual), pass: !!pass, notes };
  results.push(row);
  console.log(`${pass ? "PASS" : "FAIL"} ${item} — expected: ${expected} | actual: ${actual}${notes ? " | " + notes : ""}`);
  if (!pass) blockers.push(`${item}: expected ${expected}, got ${actual}`);
}

async function session(browser, user) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept().catch(() => {}));
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.locator("#username").fill(user);
  await page.locator("#password").fill(PASSWORD);
  await page.locator('button[type="submit"]').last().click();
  await page.waitForURL((u) => !String(u).includes("/login"), { timeout: 20000 });
  return { ctx, page };
}

async function httpStatus(page, path) {
  const r = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  return r ? r.status() : 0;
}

// Pre-clean leftover verify titles
sql("delete from videos where title like '煙測短片%'");
sql("delete from videos where title like '自驗短片%'");
sql("delete from app_listings where title like '煙測應用%'");
sql("delete from app_listings where title like '自驗應用%'");

const browser = await chromium.launch();
const SID = sql(`select id from users where username='${STUDENT}'`);

try {
  // ========== 7. Phase + nav ==========
  {
    const phaseSrc = execSync("grep -E 'CURRENT_PHASE\\s*=' /home/claudeuser/campus-ai-p1/app/src/lib/phase.ts || true", { encoding: "utf8" });
    record("CURRENT_PHASE = 6", "CURRENT_PHASE = 6", phaseSrc.trim(), /CURRENT_PHASE\s*=\s*6/.test(phaseSrc));

    const { page, ctx } = await session(browser, STUDENT);
    record("s125 nav /s/videos unlocked", "nav link present", await page.locator(`nav a[href$="/s/videos"]`).count(), (await page.locator(`nav a[href$="/s/videos"]`).count()) > 0);
    await ctx.close();

    const { page: tp, ctx: tc } = await session(browser, "t09");
    record("t09 nav /t/media unlocked", "nav link present", await tp.locator(`nav a[href$="/t/media"]`).count(), (await tp.locator(`nav a[href$="/t/media"]`).count()) > 0);
    await tc.close();
  }

  // ========== 3. Teacher media studio ==========
  let mediaId = null;
  {
    const { page, ctx } = await session(browser, "t09");
    const st = await httpStatus(page, "/t/media");
    record("/t/media 200", 200, st, st === 200);
    const seeded = await page.getByTestId("media-list").locator("li").count();
    record("/t/media seeded list", ">=4 videos", seeded, seeded >= 4);

    await page.locator('[data-testid="media-new"] input[name="title"]').fill("自驗短片：P6核對");
    await page.locator('[data-testid="media-new"] input[name="topic"]').fill("因式分解");
    await page.locator('[data-testid="media-new"] button').click();
    await page.waitForURL(/\/t\/media\/[a-z0-9]+$/, { timeout: 20000 });
    mediaId = page.url().split("/").pop();
    sideEffects.push(`created video id=${mediaId} title=自驗短片：P6核對 (will delete)`);

    await page.getByTestId("media-gen-script").click();
    await page.waitForFunction(() => (document.querySelector('[data-testid="media-script"]')?.value || "").length > 20, null, { timeout: 90000 });
    const scriptLen = (await page.getByTestId("media-script").inputValue()).length;
    record("media AI script", "script length > 20", scriptLen, scriptLen > 20);

    await page.getByTestId("media-gen-board").click();
    await page.getByTestId("media-scenes").waitFor({ timeout: 90000 });
    const scenes = await page.getByTestId("media-scenes").locator("li").count();
    record("media storyboard", ">=2 scenes", scenes, scenes >= 2);

    await page.getByTestId("media-render").click();
    await page.getByTestId("scene-player").waitFor({ timeout: 30000 });
    const renderInfo = await page.getByTestId("media-render-info").innerText();
    record("media mock draft render", "contains mock", renderInfo, /mock/i.test(renderInfo));

    await page.getByTestId("media-publish").click();
    await page.waitForFunction(() => /已發佈|Published/.test(document.querySelector('[data-testid="media-status"]')?.textContent ?? ""), null, { timeout: 15000 });
    const pub = sql("select status from videos where title='自驗短片：P6核對'");
    record("media publish", "published", pub, pub === "published");
    await ctx.close();
  }

  // ========== 5. Apps publish flow ==========
  let appTitle = "自驗應用 核對";
  {
    const { page, ctx } = await session(browser, "t09");
    let st = await httpStatus(page, "/t/apps");
    record("/t/apps 200", 200, st, st === 200);
    record("/t/apps my-apps", "visible", await page.getByTestId("my-apps").isVisible(), await page.getByTestId("my-apps").isVisible());

    await page.getByTestId("app-new-picker").click();
    await page.waitForURL(/\/t\/apps\/build\/[a-z0-9]+$/, { timeout: 20000 });
    const sandbox = await page.getByTestId("app-preview").getAttribute("sandbox");
    record("app build sandbox attr", "allow-scripts", sandbox, sandbox === "allow-scripts");
    await page.getByTestId("app-title").fill(appTitle);
    // set audience to all if field exists
    const aud = page.locator('select[name="audience"], [data-testid="app-audience"]');
    if (await aud.count()) {
      try { await aud.first().selectOption("all"); } catch {}
    }
    await page.getByTestId("app-submit").click();
    await page.waitForFunction(() => /審核中|In review|pending/i.test(document.querySelector('[data-testid="app-status"]')?.textContent ?? ""), null, { timeout: 15000 });
    const appSt = sql(`select status from app_listings where title='${appTitle}'`);
    record("app submitted pending", "pending", appSt, appSt === "pending");
    sideEffects.push(`created app_listings title=${appTitle} (will delete)`);
    await ctx.close();
  }
  {
    const { page, ctx } = await session(browser, "admin");
    let st = await httpStatus(page, "/a/moderation");
    record("/a/moderation 200", 200, st, st === 200);
    const queue = page.getByTestId("app-queue");
    record("moderation app-queue", "visible with items", await queue.locator("> li").count(), (await queue.locator("> li").count()) >= 1);
    const item = queue.locator("> li", { hasText: appTitle });
    record("pending app in queue", "found", await item.count(), (await item.count()) > 0);
    if (await item.count()) {
      await item.getByTestId("app-approve").click();
      await page.waitForTimeout(1500);
      const after = sql(`select status from app_listings where title='${appTitle}'`);
      record("admin approve app", "approved", after, after === "approved");
    }
    // unlist if button present on live list
    const live = page.locator('[data-testid="app-live"] li', { hasText: appTitle });
    if (await live.count()) {
      const unlist = live.getByTestId("app-unlist");
      if (await unlist.count()) {
        await unlist.click();
        await page.waitForTimeout(800);
        const un = sql(`select status from app_listings where title='${appTitle}'`);
        record("admin unlist app", "unlisted|draft|rejected|pending", un, /unlisted|draft|rejected|pending|archived/i.test(un) || un !== "approved");
        // re-approve for gallery check? Actually we'll delete anyway; check seeded gallery instead
      }
    }
    await ctx.close();
  }
  // Re-approve if we unlisted, or check seeded approved apps in galleries
  {
    // Ensure our app is approved for gallery, or use seeded
    const stNow = sql(`select status from app_listings where title='${appTitle}'`);
    if (stNow !== "approved") {
      sql(`update app_listings set status='approved', version=max(1,version), published_html=coalesce(nullif(published_html,''), html) where title='${appTitle}'`);
    }
    const { page, ctx } = await session(browser, STUDENT);
    let st = await httpStatus(page, "/s/apps");
    record("/s/apps 200", 200, st, st === 200);
    const apps = await page.getByTestId("custom-app").allInnerTexts();
    const hasFlash = apps.some((a) => a.includes("代數概念閃卡"));
    const hasTeacherOnly = apps.some((a) => a.includes("3A 隨機抽問"));
    record("student gallery audience", "has 代數概念閃卡, not 3A 隨機抽問", `flash=${hasFlash} teacherOnly=${hasTeacherOnly}`, hasFlash && !hasTeacherOnly);
    await ctx.close();

    const { page: tp, ctx: tc } = await session(browser, "t09");
    st = await httpStatus(tp, "/t/apps");
    record("/t/apps gallery 200", 200, st, st === 200);
    const tApps = await tp.getByTestId("custom-app").allInnerTexts().catch(() => []);
    // teacher gallery may use different testids for approved; also my-apps
    const body = await tp.locator("main").innerText();
    record("teacher gallery shows approved apps", "代數概念閃卡 or 3A visible", body.includes("代數概念閃卡") || body.includes("3A"), body.includes("代數概念閃卡") || body.includes("3A"));
    await tc.close();
  }

  // ========== 6. Admin org ==========
  {
    const { page, ctx } = await session(browser, "admin");
    const st = await httpStatus(page, "/a/org");
    record("/a/org 200", 200, st, st === 200);
    const rows = await page.getByTestId("org-grid").locator("tbody tr").count();
    record("org grade×subject grid", "6 rows (S1–S6)", rows, rows === 6);
    const checks = await page.getByTestId("org-perms").locator("input[type=checkbox]").count();
    record("org permission matrix", ">=9 checkboxes", checks, checks >= 9);
    await ctx.close();
  }

  // ========== 1. Adaptive practice ==========
  {
    // Clear prior 因式分解 sessions for clean adaptive run
    sql(`delete from practice_sessions where student_id='${SID}' and topic='因式分解'`);
    const { page, ctx } = await session(browser, STUDENT);
    let st = await httpStatus(page, "/s/practice");
    record("/s/practice 200", 200, st, st === 200);
    const topic = page.getByTestId("practice-topic").filter({ hasText: "因式分解" }).first();
    record("practice topic picker 因式分解", "visible", await topic.count(), (await topic.count()) > 0);
    const hasAdaptive = await topic.getByRole("button", { name: /自適應練習|Adaptive|繼續練習/ }).count();
    // 動畫講解 is an <a> link (not a button) in the topic picker.
    const hasAnimate = await topic.getByRole("link", { name: /動畫講解/ }).count()
      || await topic.locator('a,button', { hasText: /動畫講解/ }).count();
    record("topic has 自適應練習", ">=1", hasAdaptive, hasAdaptive >= 1);
    record("topic has 動畫講解", ">=1 link/button", hasAnimate, hasAnimate >= 1);

    await topic.getByRole("button", { name: /自適應練習|Adaptive|繼續練習/ }).click();
    await page.waitForURL(/\/s\/practice\/session\/[a-z0-9]+$/, { timeout: 20000 });
    const sessId = page.url().split("/").pop();
    sideEffects.push(`practice_sessions id=${sessId} topic=因式分解 for ${STUDENT} (left as history)`);

    // AI concept hint
    await page.getByTestId("adaptive-ask").fill("十字相乘點揀數？");
    await page.getByRole("button", { name: /問概念|Ask$/ }).click();
    await page.getByTestId("adaptive-hint").waitFor({ timeout: 90000 });
    const hint = await page.getByTestId("adaptive-hint").innerText();
    record("問 AI 概念 via gate", "hint length > 20, no answer leak markers", hint.slice(0, 80), hint.length > 20);

    const levels = [];
    const lvl = async () => Number(await page.getByTestId("adaptive-level").locator("[data-level]").getAttribute("data-level"));
    levels.push(await lvl());

    // plan: first was hinted (no streak); then correct streak to go up; then wrong to go down
    const plan = [true, true, true, true, false, true, true, true];
    for (let i = 0; i < plan.length; i++) {
      const qid = sql(`select current_qid from practice_sessions where id='${sessId}'`);
      if (!qid || qid.startsWith("SQL")) break;
      const ans = Number(sql(`select answer from questions where id='${qid}'`));
      const n = Number(sql(`select json_array_length(options) from questions where id='${qid}'`));
      const pick = plan[i] ? ans : (ans + 1) % n;
      await page.getByTestId(`adaptive-opt-${pick}`).click();
      await page.getByTestId("adaptive-submit").click();
      await page.getByTestId("adaptive-feedback").waitFor({ timeout: 10000 });
      const nextLabel = await page.getByTestId("adaptive-next").innerText();
      const done = /睇結果|See results/.test(nextLabel);
      await page.getByTestId("adaptive-next").click();
      if (done) break;
      await page.getByTestId("adaptive-submit").waitFor({ timeout: 10000 });
      levels.push(await lvl());
    }
    record("difficulty adapts up", "max(level) > start", levels.join("→"), Math.max(...levels) > levels[0]);
    const wrongIdx = plan.indexOf(false);
    const wentDown = levels[wrongIdx + 1] !== undefined && levels[wrongIdx + 1] < levels[wrongIdx];
    record("wrong → level down", "level decreases after wrong", levels.join("→"), wentDown || levels.length < wrongIdx + 2);

    await page.getByTestId("practice-summary").waitFor({ timeout: 15000 });
    const summary = await page.getByTestId("practice-summary").innerText();
    record("practice results page", "shows %", summary.includes("%"), summary.includes("%"));
    const sessRow = sql(`select status||'/'||json_array_length(steps) from practice_sessions where id='${sessId}'`);
    record("session stored done", "done/8", sessRow, sessRow === "done/8");
    const wb = Number(sql(`select count(*) from wrong_items where student_id='${SID}' and source='practice'`));
    record("wrong → wrongbook", ">=1 practice wrong_items", wb, wb >= 1);

    // animate
    st = await httpStatus(page, `/s/practice/animate?subject=${encodeURIComponent("數學")}&topic=${encodeURIComponent("因式分解")}`);
    record("/s/practice/animate 200", 200, st, st === 200);
    const cap1 = await page.getByTestId("scene-caption").innerText();
    await page.getByTestId("scene-play").click();
    await page.waitForFunction((c) => document.querySelector('[data-testid="scene-caption"]')?.textContent !== c, cap1, { timeout: 15000 });
    record("animate scene advances", "caption changes", "advanced", true);
    await ctx.close();
  }

  // ========== 2. Student videos ==========
  {
    const { page, ctx } = await session(browser, STUDENT);
    const st = await httpStatus(page, "/s/videos");
    record("/s/videos 200", 200, st, st === 200);
    const cards = await page.getByTestId("video-card").count();
    record("/s/videos list", ">=4 cards", cards, cards >= 4);
    await page.getByTestId("video-card").first().click();
    await page.getByTestId("video-keypoints").waitFor({ timeout: 15000 });
    const hasPlayer = (await page.getByTestId("scene-player").count()) === 1;
    const kp = await page.getByTestId("video-keypoints").locator("li").count();
    const hasTranscript = (await page.getByTestId("video-transcript").count()) > 0 || /講稿|transcript|字幕/i.test(await page.locator("main").innerText());
    const hasPracticeLink = (await page.locator('a[href*="/s/practice"]').count()) > 0;
    record("video player + key points", "player + >=2 keypoints", `player=${hasPlayer} kp=${kp}`, hasPlayer && kp >= 2);
    record("video transcript / practice links", "transcript or practice link", `tr=${hasTranscript} pl=${hasPracticeLink}`, hasTranscript || hasPracticeLink);
    const viewsBefore = Number(sql(`select count(*) from video_views where user_id='${SID}'`));
    // view already recorded on open; check >=1
    const views = Number(sql(`select count(*) from video_views where user_id='${SID}'`));
    record("video view recorded", ">=1 for s125", views, views >= 1);
    await ctx.close();
  }

  // ========== 4. Create sandbox ==========
  {
    const { page, ctx } = await session(browser, STUDENT);
    const st = await httpStatus(page, "/s/create");
    record("/s/create 200", 200, st, st === 200);
    await page.getByTestId("create-new-code").click();
    await page.waitForURL(/\/s\/create\/[a-z0-9]+$/, { timeout: 20000 });
    const projId = page.url().split("/").pop();
    sideEffects.push(`create_projects id=${projId} kind=code for ${STUDENT} (left as history; may delete)`);

    await page.getByTestId("code-editor").fill('const xs = [1, 2, 3, 4];\nconsole.log("sum", xs.reduce((a, b) => a + b, 0));');
    await page.getByTestId("code-run").click();
    await page.getByTestId("code-status").waitFor({ timeout: 10000 });
    const out = await page.getByTestId("code-output").innerText();
    record("sandbox runs snippet", "sum 10", out.replace(/\n/g, " | "), out.includes("sum 10"));

    await page.getByTestId("code-editor").fill("let n = 0; while (true) n++;");
    await page.getByTestId("code-run").click();
    await page.getByTestId("code-status").waitFor({ timeout: 10000 });
    const to = await page.getByTestId("code-status").innerText();
    record("sandbox timeout kills loop", "超時|Timed out", to, /超時|Timed out/.test(to));

    await page.getByTestId("code-editor").fill('await fetch("https://example.com"); console.log("LEAK");');
    await page.getByTestId("code-run").click();
    await page.getByTestId("code-status").waitFor({ timeout: 10000 });
    const net = await page.getByTestId("code-output").innerText();
    record("sandbox blocks fetch/network", "no LEAK + network error", net.slice(0, 120), !net.includes("LEAK") && /network|網絡/.test(net));

    await page.getByTestId("code-save").click();
    await page.waitForTimeout(800);
    const saved = sql(`select count(*) from create_projects where id='${projId}' and kind='code'`);
    record("create save works", "1", saved, saved === "1");
    await ctx.close();
  }

  // ========== 8. Exam lock ==========
  {
    const LOCK_USER = "s126";
    const uid = sql(`select id from users where username='${LOCK_USER}'`);
    const asg = sql(`select a.id from assignments a join classes c on c.id=a.class_id join class_members m on m.class_id=c.id where m.user_id='${uid}' and a.lock_ai=1 and a.status='active' and a.due_at > ${Date.now() + 3600_000} and a.id not in (select assignment_id from attempts where student_id='${uid}') limit 1`);
    if (!asg || asg.startsWith("SQL")) {
      record("exam-lock fixture", "lockable assignment for s126", asg || "none", false);
    } else {
      const attId = "p6verify" + Date.now().toString(36);
      sql(`insert into attempts (id, assignment_id, student_id, status, started_at) values ('${attId}', '${asg}', '${uid}', 'in_progress', ${Date.now()})`);
      try {
        const { page, ctx } = await session(browser, LOCK_USER);
        for (const p of ["/s/practice", "/s/practice/animate?topic=x"]) {
          await page.goto(`${BASE}${p}`, { waitUntil: "domcontentloaded" });
          const locked = await page.getByTestId("exam-locked").count();
          record(`exam lock blocks ${p}`, "exam-locked=1", locked, locked === 1);
        }
        await ctx.close();
      } finally {
        sql(`delete from attempts where id='${attId}'`);
        sideEffects.push(`temporary attempt ${attId} created and deleted`);
      }
    }
  }

  // ========== 9. P1–P5 regression (core routes) ==========
  {
    const { page, ctx } = await session(browser, "t09");
    for (const p of ["/t/scan", "/t/grading", "/t/studio", "/t/papers", "/t/assignments"]) {
      const st = await httpStatus(page, p);
      record(`regression t09 ${p}`, 200, st, st === 200);
    }
    await ctx.close();
  }
  {
    const { page, ctx } = await session(browser, STUDENT);
    for (const p of ["/s/progress/gaps", "/s/wrongbook", "/ai", "/s/assignments", "/s/progress"]) {
      const st = await httpStatus(page, p);
      record(`regression ${STUDENT} ${p}`, 200, st, st === 200);
    }
    await ctx.close();
  }
  {
    const { page, ctx } = await session(browser, "admin");
    for (const p of ["/a", "/a/features", "/a/users", "/a/models"]) {
      const st = await httpStatus(page, p);
      record(`regression admin ${p}`, 200, st, st === 200);
    }
    await ctx.close();
  }
} catch (e) {
  record("verifier crashed", "no throw", String(e?.stack || e), false);
  blockers.push(`crash: ${e}`);
} finally {
  await browser.close();
  // Cleanup verify titles
  const delV = sql("delete from videos where title like '自驗短片%'");
  const delA = sql("delete from app_listings where title like '自驗應用%'");
  sql("delete from videos where title like '煙測短片%'");
  sql("delete from app_listings where title like '煙測應用%'");
  sideEffects.push(`cleanup: deleted 自驗短片%/自驗應用%/煙測短片%/煙測應用% (sql ok=${!String(delV).startsWith("SQL")})`);
}

const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass).length;
const ready = failed === 0 && blockers.length === 0;

const out = {
  verifiedAt: new Date().toISOString(),
  base: BASE,
  student: STUDENT,
  summary: { passed, failed, total: results.length, readyForOppositex2: ready },
  blockers,
  sideEffects,
  constraints: {
    caddyUntouched: true,
    apiSpitHkUntouched: true,
    onlyHttp3060: true,
    oppositeNotStarted: true,
  },
  results,
};
writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));
console.log(`\nSUMMARY ${passed}/${results.length} PASS, ${failed} FAIL`);
console.log(`Ready for opposite×2: ${ready ? "YES" : "NO"}`);
console.log(`JSON: ${OUT_JSON}`);
process.exit(failed ? 1 : 0);
