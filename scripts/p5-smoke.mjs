// P5 smoke against the live demo: scan batch create → upload (photos + PDF) → QR/order/manual matching → OCR queue →
// handwriting grading (recognise, pen/stamp/text annotations, save, score writeback) → student gaps + annotated script;
// P6 still locked; P1–P4 routes still 200. Usage: node scripts/p5-smoke.mjs
import { chromium } from "playwright";
import { execSync } from "child_process";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://188.245.12.100:3060/campus-ai";
const DB = new URL("../data/campus.db", import.meta.url).pathname;
const sql = (q) => execSync(`sqlite3 "${DB}" "${q.replace(/"/g, '\\"')}"`).toString().trim();
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

const ASG = sql("select id from assignments where title='因式分解紙本測驗（掃描）'");
const PAPER = sql(`select paper_id from assignments where id='${ASG}'`);
// Fixtures: s131 as two photos (QR p1 + plain p2) + a loose smudged page; s132 as a 2-page PDF.
const FX = "/tmp/campus-p5-smoke";
fs.rmSync(FX, { recursive: true, force: true });
execSync(`npx tsx scripts/make-scan-fixtures.ts ${FX}/a ${PAPER} s131 && npx tsx scripts/make-scan-fixtures.ts ${FX}/b ${PAPER} s132`, { stdio: "ignore" });
// Clean previous smoke runs (attempts for s131/s132 on the paper test, smoke batches).
sql(`delete from attempts where assignment_id='${ASG}' and student_id in (select id from users where username in ('s131','s132'))`);
sql("delete from scan_batches where title like '煙測批次%'");

const browser = await chromium.launch();
{
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  const img = (f) => `data:image/jpeg;base64,${fs.readFileSync(f).toString("base64")}`;
  await p.setContent(`<style>@page{size:A4;margin:0}body{margin:0}img{width:210mm;height:297mm;display:block;page-break-after:always}</style><img src="${img(`${FX}/b/scan_a.jpg`)}"><img src="${img(`${FX}/b/scan_b.jpg`)}">`);
  await p.pdf({ path: `${FX}/s132.pdf`, format: "A4", printBackground: true });
  await ctx.close();
}

// ---- Teacher t09 ---------------------------------------------------------------------------
let attemptId = "";
{
  const { page } = await session(browser, "t09");
  check("t09 /t/scan 200", (await status(page, "/t/scan")) === 200);
  const nav = await page.locator("nav").first().innerText();
  check("nav: 掃描上載 unlocked", (await page.locator(`nav a[href$="/t/scan"]`).count()) > 0, nav.includes("掃描上載") ? "掃描上載 in nav" : "");
  const chips = (await page.getByTestId("scan-status").allInnerTexts()).join(" | ");
  check("seeded batches with chips 上載中／對名／待批", /上載中/.test(chips) && /對名 \d+\/\d+/.test(chips) && /待批/.test(chips), chips);

  // Create a batch linked to the paper test
  await page.goto(`${BASE}/t/scan?new=1`);
  await page.getByTestId("scan-title").fill(`煙測批次 ${Date.now() % 100000}`);
  await page.getByTestId("scan-assignment").selectOption(ASG);
  await page.getByRole("button", { name: /建立並上載/ }).click();
  await page.waitForURL(/\/t\/scan\/[a-z0-9]{16}/, { timeout: 20000 });
  const batchId = page.url().split("/t/scan/")[1].split("?")[0];
  check("new batch → /t/scan/:batchId (上載中)", /上載中/.test(await page.getByTestId("scan-status").innerText()), batchId);

  // Upload: photos (s131 QR p1, plain p2, loose page) + PDF (s132, 2 pages)
  await page.getByTestId("scan-file").setInputFiles([`${FX}/a/scan_a.jpg`, `${FX}/a/scan_b.jpg`, `${FX}/a/scan_c.jpg`, `${FX}/s132.pdf`]);
  await page.waitForFunction(() => /\/5$/.test(document.querySelector('[data-testid="scan-matched"]')?.textContent ?? ""), null, { timeout: 90000 });
  await page.waitForTimeout(1000);
  const rows = sql(`select p.seq||':'||p.match||':'||coalesce(u.username,'-')||':'||p.page_no from scan_pages p left join users u on u.id=p.student_id where p.batch_id='${batchId}' order by p.seq`).split("\n");
  check("upload: 5 pages (3 photos + PDF split into 2)", rows.length === 5, rows.join(" "));
  check("QR match s131 p1, page-order match p2", rows[0] === "1:qr:s131:1" && rows[1] === "2:order:s131:2", rows.slice(0, 2).join(" "));
  check("loose page → failed", rows[2] === "3:failed:-:1", rows[2]);
  check("PDF split: QR s132 p1 + p2 by file name / order", rows[3] === "4:qr:s132:1" && /^5:(name|order):s132:2$/.test(rows[4]), rows.slice(3).join(" "));
  await page.getByRole("button", { name: /完成上載/ }).click();
  await page.waitForURL(new RegExp(`/t/scan/${batchId}`));
  await page.waitForTimeout(500);
  check("status → 對名 4/5", /對名 4\/5/.test(await page.getByTestId("scan-status").innerText()), await page.getByTestId("scan-status").innerText());
  check("failed matches listed for manual remap", (await page.getByTestId("scan-page-failed").count()) === 1);

  // Manual remap by drag-and-drop onto the roster (fallback: menu)
  await page.getByTestId("scan-page-failed").first().dragTo(page.getByTestId("roster-s133"));
  await page.waitForTimeout(2500);
  let manual = sql(`select coalesce(u.username,'-')||':'||p.match from scan_pages p left join users u on u.id=p.student_id where p.batch_id='${batchId}' and p.seq=3`);
  if (manual !== "s133:manual") {
    await page.getByTestId("scan-page-failed").first().getByTestId("scan-assign").selectOption({ value: sql("select id from users where username='s133'") });
    await page.waitForTimeout(2500);
    manual = sql(`select coalesce(u.username,'-')||':'||p.match from scan_pages p left join users u on u.id=p.student_id where p.batch_id='${batchId}' and p.seq=3`) + " (via menu)";
  }
  check("manual remap → s133 (manual)", manual.startsWith("s133:manual"), manual);
  await page.reload();
  check("all pages matched", await page.getByTestId("scan-all-matched").isVisible());

  // Enqueue OCR / split → progress → ready
  await page.getByRole("button", { name: /佇列 OCR／分割/ }).click();
  await page.waitForURL(new RegExp(`/t/scan/${batchId}`));
  check("OCR progress bar shown", await page.getByTestId("ocr-progress").waitFor({ timeout: 5000 }).then(() => true, () => page.getByTestId("scan-ready").isVisible()));
  await page.getByTestId("scan-ready").waitFor({ timeout: 30000 });
  check("OCR done → 待批, grading links", /待批/.test(await page.getByTestId("scan-status").innerText()) && (await page.getByTestId("scan-grade-link").count()) === 3);
  const atts = sql(`select u.username||':'||t.status||':'||t.needs_marking from attempts t join users u on u.id=t.student_id where t.assignment_id='${ASG}' and u.username in ('s131','s132','s133') order by u.username`);
  check("attempts created in grading queue", atts.split("\n").length === 3 && !atts.includes(":0"), atts.replace(/\n/g, " "));

  // Handwriting grading for s131
  attemptId = sql(`select t.id from attempts t join users u on u.id=t.student_id where t.assignment_id='${ASG}' and u.username='s131'`);
  await page.goto(`${BASE}/t/grading?assignment=${ASG}`);
  check("queue shows 手寫 badge", (await page.getByTestId("hw-badge").count()) > 0);
  await page.goto(`${BASE}/t/grading/${attemptId}`);
  check("handwriting mode: canvas + pages", (await page.getByTestId("hw-mode").isVisible()) && (await page.getByTestId("hw-canvas").isVisible()) && /第 1\/2 頁/.test(await page.getByTestId("hw-page").innerText()));
  await page.getByRole("button", { name: /手寫辨識＋AI 初評/ }).click();
  await page.waitForURL(/hw=1|err=/, { timeout: 120000 });
  check("handwriting recognise → AI draft", page.url().includes("hw=1"), page.url().split("?")[1]);
  const ocr = sql(`select json_extract(marks, '$') from grades where attempt_id='${attemptId}'`);
  check("recognised text stored (ocr)", /"ocr":/.test(ocr), sql(`select ai_total||' mock='||ai_mock from grades where attempt_id='${attemptId}'`));

  // Annotate: pen stroke, stamp, text on page 1; stamp on page 2
  const box = await page.getByTestId("hw-canvas").boundingBox();
  await page.getByTestId("hw-tool-pen").click();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.down();
  for (let k = 1; k <= 10; k++) await page.mouse.move(box.x + box.width * (0.3 + k * 0.02), box.y + box.height * (0.3 + (k % 2) * 0.01));
  await page.mouse.up();
  await page.getByTestId("hw-tool-stamp").click();
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.2);
  await page.getByTestId("hw-tool-text").click();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.getByTestId("hw-text-input").fill("煙測：步驟清楚");
  await page.getByTestId("hw-text-input").press("Enter");
  await page.getByTestId("hw-next").click();
  await page.getByTestId("hw-tool-stamp").click();
  const box2 = await page.getByTestId("hw-canvas").boundingBox();
  await page.mouse.click(box2.x + box2.width * 0.8, box2.y + box2.height * 0.8);
  check("4 annotations on canvas (unsaved)", /4/.test(await page.getByTestId("hw-count").innerText()), await page.getByTestId("hw-count").innerText());
  const nQ = await page.locator('[data-testid^="wb-score-"]').count();
  await page.getByTestId(`wb-score-${nQ - 1}`).fill("5");
  await page.getByTestId("wb-save").click();
  await page.waitForURL(/saved=1/, { timeout: 20000 });
  const inkRow = sql(`select (select count(*) from json_each(ink, '$.' || p.id)) from grades g, scan_pages p where g.attempt_id='${attemptId}' and p.student_id=(select student_id from attempts where id='${attemptId}') and p.batch_id='${batchId}' order by p.page_no`);
  check("annotation layer persisted (page1 3, page2 1)", inkRow.replace(/\n/g, ",") === "3,1", inkRow.replace(/\n/g, ","));
  await page.goto(`${BASE}/t/grading/${attemptId}`);
  check("annotations reload from DB", /4/.test(await page.getByTestId("hw-count").innerText()) && (await page.locator('[data-testid="hw-canvas"] path, [data-testid="hw-canvas"] text').count()) >= 3);
  await page.getByTestId("wb-comment").fill("煙測：手寫批改。");
  await page.getByTestId("wb-done").click();
  await page.waitForURL((u) => !String(u).includes(attemptId), { timeout: 20000 });
  const row = sql(`select t.needs_marking, t.score, t.max_score, g.status from attempts t join grades g on g.attempt_id=t.id where t.id='${attemptId}'`);
  const longQ = sql(`select q.id from questions q where q.type='long' and q.id in (select qq.value from papers p, json_each(p.sections) s, json_each(s.value, '$.questionIds') qq where p.id='${PAPER}')`);
  const longScore = sql(`select json_extract(marks, '$."${longQ}".score') from grades where attempt_id='${attemptId}'`);
  check("score writeback same as digital (needs_marking=0, done, long=5)", /^0\|\d+\|17\|done/.test(row) && longScore === "5", `${row} long=${longScore}`);

  // Seeded handwritten attempt (s123, batch 1) opens in handwriting mode
  const s123att = sql(`select t.id from attempts t join users u on u.id=t.student_id where t.assignment_id='${ASG}' and u.username='s123'`);
  await page.goto(`${BASE}/t/grading/${s123att}`);
  check("seeded s123 handwritten script → handwriting mode", await page.getByTestId("hw-pane").isVisible());

  // Printed papers carry QR
  await page.goto(`${BASE}/t/papers/${PAPER}`);
  const classLink = page.getByTestId("paper-qr-print").locator("a").filter({ hasText: "3A" }).first();
  await classLink.click();
  await page.waitForURL(/class=/);
  check("paper print: per-student copies with QR", (await page.getByTestId("paper-qr").count()) >= 10, `${await page.getByTestId("paper-qr").count()} QR copies`);

  // P6 still locked; P1–P4 regressions
  check("P6 /t/media locked", /P6/.test(await (await page.goto(`${BASE}/t/media`)).text()));
  check("nav: 影音 still locked", (await page.locator(`nav a[href$="/t/media"]`).count()) === 0);
  for (const p of ["/t", "/t/classes", "/t/assignments", "/t/bank", "/t/papers", "/t/grading", "/t/grading/essay", "/t/reports", "/t/studio", "/t/drafts", "/t/tutors", "/ai"]) {
    check(`t09 ${p} 200`, (await status(page, p)) === 200);
  }
}

// ---- Students ------------------------------------------------------------------------------
for (const u of ["s125", "s123"]) {
  const { page } = await session(browser, u);
  check(`${u} /s/progress/gaps 200`, (await status(page, "/s/progress/gaps")) === 200);
  const n = await page.getByTestId("gap-item").count();
  const txt = n ? (await page.getByTestId("gap-item").first().innerText()).replace(/\s+/g, " ").slice(0, 120) : "";
  check(`${u} gaps list non-empty with links`, n > 0 && (await page.getByTestId("gap-practice").count()) > 0, `${n} gaps · ${txt}`);
  check(`${u} nav: 概念缺口 unlocked`, (await page.locator(`nav a[href$="/s/progress/gaps"]`).count()) > 0);
  if (u === "s125") {
    check("s125 gaps show teacher defect tags", /步驟不完整|計算失誤|概念混淆/.test(await page.getByTestId("gaps-list").innerText()));
    check("s125 annotated paper script", (await status(page, `/s/assignments/${ASG}/script`)) === 200 && (await page.getByTestId("script-pages").isVisible()) && (await page.locator('[data-testid="script-pages"] svg text').count()) > 0);
    const redo = page.getByTestId("gap-redo").first();
    if (await redo.count()) {
      await page.goto(`${BASE}/s/progress/gaps`);
      await page.getByTestId("gap-redo").first().click();
      await page.waitForURL(/wrongbook\/redo/);
      check("gap → wrongbook redo", page.url().includes("topic="));
    }
  }
  check(`${u} P6 /s/videos locked`, /P6/.test(await (await page.goto(`${BASE}/s/videos`)).text()));
  for (const p of ["/s", "/s/assignments", "/s/wrongbook", "/s/progress", "/s/practice", "/s/studio", "/s/essay", "/s/tutors", "/s/library", "/s/classes", "/ai"]) {
    check(`${u} ${p} 200`, (await status(page, p)) === 200);
  }
}

// ---- Admin ----------------------------------------------------------------------------------
{
  const { page } = await session(browser, "admin");
  for (const p of ["/a", "/a/features", "/a/models", "/a/users", "/a/logs", "/a/analytics"]) check(`admin ${p} 200`, (await status(page, p)) === 200);
  await page.goto(`${BASE}/t/scan`);
  check("admin kept on /a (role prefix)", /\/a$/.test(new URL(page.url()).pathname));
  const logs = sql("select count(*) from audit_logs where action like 'scan.%' or action='grade.handwriting'");
  check("audit log has scan / handwriting actions", Number(logs) >= 2, `${logs} rows`);
}

await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
