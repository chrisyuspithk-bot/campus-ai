// P7 smoke against the live demo (tender gap close): distinct chat models (≥2 provider ids actually used),
// cross-subject + HKDSE bank, step partial credit in the workbench and on the student result, photo practice
// (vision OCR → guided reply → wrongbook), 6D literacy labels + movement, badged image tool, research / web
// search, document drafts, NL → code in the sandbox (still isolated), high-risk auto-report (audit + notice,
// masked list + CSV), exam lock on the new entry points, and P1–P6 routes still 200.
// Cleans up what it creates. Usage: node scripts/p7-smoke.mjs
import { chromium } from "playwright";
import { execSync } from "child_process";
import { createCanvas } from "@napi-rs/canvas";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://188.245.12.100:3060/campus-ai";
const DB = new URL("../data/campus.db", import.meta.url).pathname;
const sql = (q) => execSync(`sqlite3 "${DB}" "${q.replace(/"/g, '\\"')}"`).toString().trim();
const STUDENT = process.env.P7_STUDENT ?? "s125";
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
/** One /api/chat completion; returns status, provider id header and the text. */
async function chat(page, body) {
  const r = await page.request.post(`${BASE}/api/chat`, { data: body, timeout: 120000 });
  return { status: r.status(), orId: r.headers()["x-openrouter-id"], imgMock: r.headers()["x-image-mock"], conv: r.headers()["x-conversation-id"], text: await r.text() };
}
async function literacy(page) {
  await page.goto(`${BASE}/s/progress`);
  return page.evaluate(() => {
    const out = {};
    for (const tr of document.querySelectorAll("details table tr")) {
      const td = tr.querySelectorAll("td,th");
      if (td.length >= 2) out[td[0].textContent.trim()] = Number(td[1].textContent.trim());
    }
    return out;
  });
}

// A printed maths question as a photo fixture.
const PHOTO = "/tmp/p7-smoke-question.png";
{
  const c = createCanvas(900, 360);
  const g = c.getContext("2d");
  g.fillStyle = "#fffef8";
  g.fillRect(0, 0, 900, 360);
  g.fillStyle = "#111";
  g.font = "bold 38px sans-serif";
  g.fillText("Question 5", 40, 80);
  g.font = "40px sans-serif";
  g.fillText("Solve  x² − 7x + 12 = 0", 40, 170);
  g.font = "30px sans-serif";
  g.fillText("Show your working.  (3 marks)", 40, 250);
  fs.writeFileSync(PHOTO, c.toBuffer("image/png"));
}

const SID = sql(`select id from users where username='${STUDENT}'`);
const STARTED = Date.now();
const ADMIN = sql("select id from users where username='admin'");
sql("delete from drafts where title like '%煙測%'");
sql("delete from app_listings where title like '煙測應用%'");
const wbBefore = sql("select marks from grades where attempt_id='9d414e6948c743c8'");

const browser = await chromium.launch();

// ---- t09: models, bank, step credit, drafts, research, image, app vibe --------------------------------
{
  const { page } = await session(browser, "t09");
  check("/ai 200", (await status(page, "/ai")) === 200);
  const opts = await page.locator("#model option").allTextContents();
  check("model picker lists ≥4 enabled models", opts.length >= 4, opts.join(" | "));
  check("model hint shown", await page.getByTestId("model-hint").isVisible());
  const ids = new Set();
  for (const m of ["campus-fast", "campus-light", "campus-strong"]) {
    const r = await chat(page, { modelId: m, content: "用一句說明甚麼是質數。" });
    ids.add(r.orId);
    check(`t09 completion via ${m}`, r.status === 200 && r.text.length > 5 && !r.text.includes("⚠️"), `${r.orId} · ${r.text.slice(0, 40).replace(/\n/g, " ")}`);
  }
  check("t09: ≥3 distinct provider model ids used", ids.size >= 3, [...ids].join(", "));

  // UI switch: pick Qwen in the picker and send through the composer — the request carries the new model.
  await page.goto(`${BASE}/ai`);
  await page.locator("#model").selectOption("campus-light");
  const respP = page.waitForResponse((r) => r.url().endsWith("/api/chat") && r.request().method() === "POST", { timeout: 120000 });
  await page.locator("textarea").first().fill("用一句介紹畢氏定理。");
  await page.locator("textarea").first().press("Enter");
  const resp = await respP;
  check("UI picker → request uses Qwen", resp.headers()["x-openrouter-id"] === "qwen/qwen3.8-flash" && JSON.parse(resp.request().postData()).modelId === "campus-light", resp.headers()["x-openrouter-id"]);

  // Image tool → badged demo (every image model 403s on this key).
  const img = await chat(page, { content: "畫一個三角形", tools: { image: true } });
  check("image tool: 200 + badged demo image", img.status === 200 && img.text.includes("示範圖") && img.imgMock === "1", img.text.slice(0, 60));

  // Web search in chat (teacher feature on) — cited or gracefully degraded, never 5xx.
  const ws = await chat(page, { modelId: "campus-fast", content: "HKDSE 考試由哪個機構主辦？請附來源。", tools: { search: true } });
  check("chat web_search: 200 with sources (or degraded note)", ws.status === 200 && (/來源|Sources|http/.test(ws.text) || ws.text.includes("網上搜尋暫時用唔到")), ws.text.slice(-120).replace(/\n/g, " "));

  // Research entry.
  check("/research 200", (await status(page, "/research")) === 200);
  await page.locator('[data-testid="research-form"] input[name="q"]').fill("香港中學文憑試數學科考甚麼？");
  await page.locator('[data-testid="research-form"] button').click();
  await page.waitForURL(/\/research\?c=/, { timeout: 120000 });
  const ans = await page.getByTestId("research-answer").innerText();
  check("research answer with sources (or degraded)", ans.length > 80 && (/來源|Sources/.test(ans) || ans.includes("未經網上查證")), ans.slice(-100).replace(/\n/g, " "));

  // Bank: new subjects + HKDSE.
  for (const s of ["企業會計與財務概論", "資訊及通訊科技", "生物", "化學", "物理", "數學"]) {
    await page.goto(`${BASE}/t/bank?subject=${encodeURIComponent(s)}`);
    const n = await page.getByTestId("bank-list").locator("li").count();
    check(`/t/bank ${s} ≥ 8 questions`, n >= 8, `${n}`);
  }
  await page.goto(`${BASE}/t/bank?tag=hkdse`);
  const dse = await page.getByTestId("bank-list").locator("li").count();
  check("/t/bank HKDSE filter ≥5", dse >= 5 && (await page.getByTestId("bank-list").innerText()).includes("HKDSE"), `${dse}`);
  const qid = sql("select id from questions where subject='化學' and type='mc' limit 1");
  check("variants page 200 (化學)", (await status(page, `/t/bank/${qid}/variants`)) === 200);
  const paper = sql("select id from papers where title like '生物 · 細胞與酶%' limit 1");
  check("non-math paper exists + opens", Boolean(paper) && (await status(page, `/t/papers/${paper}`)) === 200);

  // Step partial credit (seeded on s126's 因式分解測驗（上週）).
  await page.goto(`${BASE}/t/grading/9d414e6948c743c8`);
  const steps = page.locator('[data-testid^="wb-steps-"]');
  check("workbench shows step rows", (await steps.count()) >= 1 && (await page.getByTestId("wb-step").count()) >= 3, `${await page.getByTestId("wb-step").count()} steps`);
  const n = (await steps.first().getAttribute("data-testid")).split("-").pop();
  const before = await page.getByTestId("wb-total").innerText();
  await page.getByTestId(`wb-step-${n}-2`).fill("3");
  const after = await page.getByTestId("wb-total").innerText();
  check("editing a step updates the total", before !== after, `${before.replace(/\n/g, "")} → ${after.replace(/\n/g, "")}`);
  await page.getByTestId("wb-save").click();
  await page.getByTestId("grade-saved").waitFor({ timeout: 15000 });
  const saved = JSON.parse(sql("select json_extract(marks,'$.1079bba942e84c24') from grades where attempt_id='9d414e6948c743c8'"));
  check("steps written back; score = step sum", Array.isArray(saved.steps) && saved.score === saved.steps.reduce((s, x) => s + x.marksAwarded, 0) && saved.score === 6, JSON.stringify(saved.steps?.map((s) => s.marksAwarded)));
  // Handwriting-mode script with seeded AI steps.
  await page.goto(`${BASE}/t/grading/b61242388ade41b9`);
  check("handwriting workbench shows steps", (await page.getByTestId("hw-mode").count()) === 1 && (await page.getByTestId("wb-step").count()) >= 3);

  // Document drafts.
  await page.goto(`${BASE}/t/drafts`);
  const typeOpts = await page.locator('select[name="type"]').first().locator("option").allTextContents();
  check("draft type filter has 成績單/通知信/進度報告", ["成績單", "通知信", "進度報告"].every((x) => typeOpts.includes(x)));
  await page.getByTestId("doc-drafts").locator("summary").click();
  const cls = await page.getByTestId("doc-drafts").locator('select[name="classId"] option').nth(1).getAttribute("value");
  await page.getByTestId("doc-drafts").locator('select[name="type"]').selectOption("notice");
  await page.getByTestId("doc-drafts").locator('select[name="classId"]').selectOption(cls);
  await page.getByTestId("doc-drafts").locator('input[name="topic"]').fill("煙測 家長日安排");
  await page.getByTestId("doc-drafts").locator("button").click();
  await page.waitForURL(/\/t\/drafts\/[a-z0-9]+/, { timeout: 120000 });
  const draftId = page.url().match(/\/t\/drafts\/([a-z0-9]+)/)[1];
  const d = sql(`select type || '|' || length(content) from drafts where id='${draftId}'`);
  sql(`delete from drafts where id='${draftId}'`); // AI picks its own title, so clean up by id
  check("AI 通知信 draft created", d.startsWith("notice|") && Number(d.split("|")[1]) > 100, d);

  // App builder: NL → HTML, preview in the sandbox, stays a draft until moderation.
  await page.goto(`${BASE}/t/apps`);
  await page.getByTestId("app-new-picker").click();
  await page.waitForURL(/\/t\/apps\/build\/[a-z0-9]+$/);
  await page.getByTestId("app-title").fill("煙測應用 NL");
  await page.getByTestId("app-save").click();
  await page.getByTestId("vibe-input").fill("做一個按鈕，每撳一次顯示一個 1 到 6 的隨機數字");
  await page.getByTestId("vibe-go").click();
  await page.getByTestId("vibe-msg").waitFor({ timeout: 120000 });
  check("app NL edit → preview still sandboxed, status draft", (await page.getByTestId("app-preview").getAttribute("sandbox")) === "allow-scripts" && sql("select status from app_listings where title='煙測應用 NL'") === "draft", (await page.getByTestId("vibe-msg").innerText()).slice(0, 60));

  for (const p of ["/t", "/t/drafts", "/t/studio", "/t/tutors", "/t/media", "/t/bank", "/t/papers", "/t/classes", "/t/assignments", "/t/alerts", "/t/grading", "/t/scan", "/t/reports", "/t/community", "/t/apps"]) {
    check(`t09 ${p} 200`, (await status(page, p)) === 200);
  }
}

// ---- s125: models, literacy, photo practice, vibe code, result steps ----------------------------------
{
  const { page } = await session(browser, STUDENT);
  const lit0 = await literacy(page);
  const dims = ["學習目的", "提示詞精準度", "迭代對話", "批判性判斷", "戰術性學習應用", "負責任的使用"];
  check("/s/progress shows tender 6D labels", dims.every((d) => d in lit0), JSON.stringify(lit0));
  check("progress literacy caption says 估算", (await page.locator("main").innerText()).includes("非正式／估算"));

  const a = await chat(page, { modelId: "campus-fast", content: "我想知道點樣用十字相乘因式分解 x^2+5x+6？請一步步解釋。" });
  const b = await chat(page, { conversationId: a.conv, modelId: "campus-light", content: "點解要搵兩個數相乘等於 6？可唔可以再舉一個例子驗證？" });
  check(`${STUDENT} two completions on two models`, a.status === 200 && b.status === 200 && a.orId !== b.orId, `${a.orId} / ${b.orId}`);
  check("messages record the model used", Number(sql(`select count(distinct model_id) from messages where conversation_id='${a.conv}' and role='assistant'`)) === 2);
  const lit1 = await literacy(page);
  const moved = dims.filter((d) => lit1[d] !== lit0[d]);
  check("literacy dims move after chatting", moved.length >= 2, moved.map((d) => `${d} ${lit0[d]}→${lit1[d]}`).join(", "));

  // Photo practice.
  check("/s/practice has photo entry", (await status(page, "/s/practice")) === 200 && (await page.getByTestId("photo-practice-link").count()) === 1);
  check("/s/practice/photo 200", (await status(page, "/s/practice/photo")) === 200);
  await page.getByTestId("photo-file").setInputFiles(PHOTO);
  await page.getByTestId("photo-submit").click();
  await page.getByTestId("photo-reply").waitFor({ timeout: 150000 });
  const ocr = await page.getByTestId("photo-ocr").innerText();
  const reply = await page.getByTestId("photo-reply").innerText();
  check("photo OCR read the question", /12|7x|7 x/.test(ocr.replace(/\s/g, " ")), ocr.replace(/\n/g, " ").slice(0, 80));
  check("guided reply without the final answer", reply.length > 40 && !/x\s*=\s*3\s*(或|or|,|，)\s*x\s*=\s*4/.test(reply) && !/x\s*=\s*4\s*(或|or|,|，)\s*x\s*=\s*3/.test(reply), reply.replace(/\n/g, " ").slice(0, 100));
  const row = sql(`select mock || '|' || (conversation_id is not null) from photo_practice where student_id='${SID}' order by created_at desc limit 1`);
  check("photo practice stored (live vision, tutor thread)", row === "0|1", row);
  await page.getByTestId("photo-continue").click();
  await page.waitForURL(/\/ai\/c\//);
  check("continue opens the tutor conversation", (await page.locator("main").innerText()).includes("📷"));
  await page.goto(`${BASE}/s/practice/photo`);
  await page.getByTestId("photo-recent").locator("button").first().click();
  await page.getByTestId("photo-wrong-added").waitFor({ timeout: 15000 });
  check("photo question → wrongbook", Number(sql(`select count(*) from wrong_items where student_id='${SID}' and stem like '📷%'`)) >= 1);

  // Student result shows released step feedback (s125, 因式分解測驗（上週）).
  const asg = sql("select assignment_id from attempts where id='767306cce01c4c2a'");
  await page.goto(`${BASE}/s/assignments/${asg}/result`);
  check("student result shows step feedback", (await page.getByTestId("result-steps").count()) >= 1);

  // NL → code in the sandbox; isolation unchanged.
  check("/s/create 200 + NL flow copy", (await status(page, "/s/create")) === 200 && (await page.getByTestId("create-flow").count()) === 1);
  await page.getByTestId("create-new-code").click();
  await page.waitForURL(/\/s\/create\/[a-z0-9]+$/);
  await page.getByTestId("vibe-input").fill("印出 1 至 9 的乘數表（九九乘法表）");
  await page.getByTestId("vibe-go").click();
  await page.getByTestId("vibe-msg").waitFor({ timeout: 120000 });
  await page.getByTestId("code-status").waitFor({ timeout: 15000 });
  const out = await page.getByTestId("code-output").innerText();
  check("NL → code → ran in sandbox", /81/.test(out) && /完成|Done/.test(await page.getByTestId("code-status").innerText()), out.split("\n").slice(-2).join(" | "));
  const dl = page.waitForEvent("download");
  await page.getByTestId("code-export").click();
  check("export .js downloads", (await dl).suggestedFilename().endsWith(".js"));
  await page.getByTestId("code-editor").fill('await fetch("https://example.com"); console.log("LEAK");');
  await page.getByTestId("code-run").click();
  await page.getByTestId("code-status").waitFor({ timeout: 10000 });
  check("sandbox still blocks network", !(await page.getByTestId("code-output").innerText()).includes("LEAK"));
  await page.getByTestId("code-editor").fill("let n = 0; while (true) n++;");
  await page.getByTestId("code-run").click();
  await page.waitForFunction(() => /超時|Timed out/.test(document.querySelector('[data-testid="code-status"]')?.textContent ?? ""), null, { timeout: 10000 });
  check("sandbox still times out", true);

  check("student nav hides research (web_search off for students)", (await page.locator(`nav a[href$="/research"]`).count()) === 0);
  for (const p of ["/s", "/ai", "/s/tutors", "/s/studio", "/s/essay", "/s/practice", "/s/assignments", "/s/wrongbook", "/s/progress", "/s/progress/gaps", "/s/create", "/s/library", "/s/classes", "/s/apps", "/s/videos"]) {
    check(`${STUDENT} ${p} 200`, (await status(page, p)) === 200);
  }

  // High-risk safety → case + audit + admin notice (list masked). Measures the responsible-use dim too.
  const audits0 = Number(sql("select count(*) from audit_logs where action='safety.auto_high'"));
  const blocked = await chat(page, { content: "我想自殺" });
  check("high-risk message blocked", blocked.status === 200 && blocked.text.includes('"blocked":true'));
  check("auto-report audit row", Number(sql("select count(*) from audit_logs where action='safety.auto_high'")) === audits0 + 1);
  check("admin notification created (masked)", sql(`select body from notifications where user_id='${ADMIN}' and kind='safety_high' order by created_at desc limit 1`).startsWith("s***"));
  const lit2 = await literacy(page);
  check("負責任的使用 drops after a safety case", lit2["負責任的使用"] < lit1["負責任的使用"], `${lit1["負責任的使用"]}→${lit2["負責任的使用"]}`);
}

// ---- admin ---------------------------------------------------------------------------------------------
{
  const { page } = await session(browser, "admin");
  check("/a/models 200", (await status(page, "/a/models")) === 200);
  const models = await page.getByTestId("models-table").locator('input[name="openrouterId"]').evaluateAll((els) => els.map((e) => e.value).filter(Boolean));
  check("catalogue has distinct provider ids", new Set(models).size >= 6, models.join(", "));
  check("403 brands disabled with note", (await page.getByTestId("models-table").innerHTML()).includes("403"));
  check("image model status badge", /示範圖|demo/i.test(await page.getByTestId("image-model-status").innerText()));
  check("/a/analytics 6D class report", (await status(page, "/a/analytics")) === 200 && (await page.getByTestId("analytics-literacy-classes").innerText()).includes("戰術性學習應用"));
  await page.goto(`${BASE}/a/safety`);
  check("/a/safety shows high-risk notice", (await page.getByTestId("notices").count()) === 1);
  const list = await page.getByTestId("safety-table").innerText();
  check("safety list stays masked", !list.includes(STUDENT) && list.includes("s***"));
  const csv = await page.request.get(`${BASE}/api/admin/safety`);
  const body = await csv.text();
  check("safety CSV export masked", csv.status() === 200 && body.includes("s***") && !body.includes(STUDENT) && !body.includes("自殺"));
  check("/research 200 for admin", (await status(page, "/research")) === 200);
  for (const p of ["/a", "/a/features", "/a/users", "/a/policies", "/a/logs", "/a/org", "/a/moderation"]) {
    check(`admin ${p} 200`, (await status(page, p)) === 200);
  }
}

// ---- Exam lock on the new P7 entry points ---------------------------------------------------------------
{
  const LOCK_USER = "s126";
  const uid = sql(`select id from users where username='${LOCK_USER}'`);
  const asg = sql(`select a.id from assignments a join classes c on c.id=a.class_id join class_members m on m.class_id=c.id where m.user_id='${uid}' and a.lock_ai=1 and a.status='active' and a.due_at > ${Date.now() + 3600_000} and a.id not in (select assignment_id from attempts where student_id='${uid}') limit 1`);
  if (!asg) check("exam-lock fixture available", false, "no lockable assignment for " + LOCK_USER);
  else {
    const attId = "p7smoke" + Date.now().toString(36);
    sql(`insert into attempts (id, assignment_id, student_id, status, started_at) values ('${attId}', '${asg}', '${uid}', 'in_progress', ${Date.now()})`);
    try {
      const { page } = await session(browser, LOCK_USER);
      for (const p of ["/s/practice/photo", "/research", "/ai"]) {
        await page.goto(`${BASE}${p}`);
        check(`exam lock blocks ${p}`, (await page.getByTestId("exam-locked").count()) === 1);
      }
      const r = await page.request.post(`${BASE}/api/practice/photo`, { multipart: { text: "解 x^2=4", subject: "數學" } });
      check("exam lock: photo API 423", r.status() === 423);
      const c = await chat(page, { content: "hi" });
      check("exam lock: chat API 423", c.status === 423);
    } finally {
      sql(`delete from attempts where id='${attId}'`);
    }
  }
}

await browser.close();
// Tidy: smoke draft/app, the smoke safety case + its notices, restore the seeded workbench grade.
sql("delete from drafts where title like '%煙測%'");
sql("delete from app_listings where title like '煙測應用%'");
const cases = sql(`select id from safety_cases where user_id='${SID}' and excerpt='我想自殺' and created_at > ${STARTED}`).split("\n").filter(Boolean);
for (const c of cases) {
  sql(`delete from notifications where href like '%${c}%'`);
  sql(`delete from safety_cases where id='${c}'`);
}
sql(`delete from notifications where kind='safety_high' and body like 's***%' and href='/t/alerts' and created_at > ${Date.now() - 3600_000}`);
fs.writeFileSync("/tmp/p7-wb.json", wbBefore);
execSync(`sqlite3 "${DB}" "update grades set marks=cast(readfile('/tmp/p7-wb.json') as text) where attempt_id='9d414e6948c743c8'"`);
console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
