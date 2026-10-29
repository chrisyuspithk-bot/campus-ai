// P8 smoke against the live demo (tender 9.1 vibe coding deepen): multi-file Code Lab + App Builder (html/css/js
// tabs, persisted JSON), NL vibe on files, 「用 AI 修」 after sandbox error / timeout, 簡易邏輯編排 blocks → JS in the
// preview, campus.mock demo data layer (page + worker), network still blocked, loop guard, ZIP / .html / .js
// export, submit → moderation (stays pending, not live), plus P1–P7 regressions. Cleans up what it creates.
// Usage: node scripts/p8-smoke.mjs
import { chromium } from "playwright";
import { execSync } from "child_process";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://188.245.12.100:3060/campus-ai";
const DB = new URL("../data/campus.db", import.meta.url).pathname;
const sql = (q) => execSync(`sqlite3 "${DB}" "${q.replace(/"/g, '\\"')}"`).toString().trim();
const STUDENT = process.env.P8_STUDENT ?? "s125";
let failed = 0;
let total = 0;
const check = (name, cond, detail = "") => {
  total++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failed++;
};

async function session(browser, user) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator("#username").fill(user);
  await page.locator("#password").fill("demo1234");
  await page.locator('button[type="submit"]').last().click();
  await page.waitForURL((u) => !String(u).includes("/login"), { timeout: 20000 });
  return { ctx, page };
}
const status = async (page, path) => (await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" })).status();
const statusText = (page, id) => page.getByTestId(id).innerText().catch(() => "");
async function waitStatus(page, id, re, timeout = 15000) {
  await page.waitForFunction(([i, r]) => new RegExp(r).test(document.querySelector(`[data-testid="${i}"]`)?.textContent ?? ""), [id, re.source], { timeout }).catch(() => {});
  return re.test(await statusText(page, id));
}
/** Entry names of a stored ZIP (reads the central directory). */
function zipNames(buf) {
  const names = [];
  for (let i = 0; i < buf.length - 46; i++) {
    if (buf.readUInt32LE(i) === 0x02014b50) {
      const n = buf.readUInt16LE(i + 28);
      names.push(buf.subarray(i + 46, i + 46 + n).toString("utf8"));
      i += 45 + n;
    }
  }
  return names;
}
async function download(page, testId) {
  const dl = page.waitForEvent("download", { timeout: 15000 });
  await page.getByTestId(testId).click();
  const d = await dl;
  const p = await d.path();
  return { name: d.suggestedFilename(), buf: fs.readFileSync(p) };
}
async function vibe(page, text) {
  await page.getByTestId("vibe-input").fill(text);
  await page.getByTestId("vibe-go").click();
  await page.getByTestId("vibe-msg").waitFor({ timeout: 150000 });
  return page.getByTestId("vibe-msg").innerText();
}
async function fixWithAi(page) {
  await page.getByTestId("vibe-fix").click();
  await page.getByTestId("vibe-msg").waitFor({ timeout: 150000 });
  return page.getByTestId("vibe-msg").innerText();
}

const SID = sql(`select id from users where username='${STUDENT}'`);
const browser = await chromium.launch();

// ---- s125: Code Lab ------------------------------------------------------------------------------------
let projectId = "";
{
  const { page } = await session(browser, STUDENT);
  check("/s/create 200 + P8 flow copy", (await status(page, "/s/create")) === 200 && /多檔案|HTML \+ CSS/.test(await page.getByTestId("create-flow").innerText()));
  check("seeded multi-file demo project (idempotent seed)", Number(sql(`select count(*) from create_projects where owner_id='${SID}' and title like 'P8 示範%' and files is not null`)) === 1);

  await page.getByTestId("create-new-code").click();
  await page.waitForURL(/\/s\/create\/[a-z0-9]+$/);
  projectId = page.url().match(/\/s\/create\/([a-z0-9]+)$/)[1];
  check("flow line 描述 → 編輯／積木 → 預覽 → 修錯 → 導出", /描述[\s\S]*編輯／積木[\s\S]*預覽[\s\S]*修錯[\s\S]*導出/.test(await page.getByTestId("p8-flow").innerText()));
  check("file tabs html/css/js/data/積木", (await page.getByTestId("file-tabs").innerText()).replace(/\s/g, "").includes("index.htmlstyle.cssscript.js●data.json🧩積木"));
  check("new project starts in console mode", /console/.test(await page.getByTestId("code-mode").innerText()));

  // P7 regression: NL → console code → worker.
  await vibe(page, "印出 1 至 9 的乘數表（九九乘法表）");
  check("NL → console code → ran in worker", (await waitStatus(page, "code-status", /完成|Done/, 20000)) && /81/.test(await page.getByTestId("code-output").innerText()));

  // V5 in the worker.
  await page.getByTestId("tab-data").click();
  check("data.json tab shows mock tip", /示範用記憶體資料層，非真實伺服器/.test(await page.getByTestId("mock-tip").innerText()));
  await page.getByTestId("file-data").fill('{"base": 40}');
  await page.getByTestId("tab-js").click();
  await page.getByTestId("code-editor").fill('campus.mock.set("x", campus.mock.get("base") + 2); console.log("mock", campus.mock.get("x"), typeof document);');
  await page.getByTestId("code-run").click();
  check("campus.mock get/set in worker (seeded from data.json), still no DOM", (await waitStatus(page, "code-status", /完成|Done/)) && /mock 42 undefined/.test(await page.getByTestId("code-output").innerText()));

  // V2: timeout → 用 AI 修.
  await page.getByTestId("code-editor").fill("// 數到 10\nlet n = 0;\nwhile (true) {\n  n++;\n}\nconsole.log(n);");
  await page.getByTestId("code-run").click();
  check("console timeout still enforced", await waitStatus(page, "code-status", /超時|Timed out/));
  check("「用 AI 修」 offered after timeout", await page.getByTestId("vibe-fix").isVisible());
  const fixMsg = await fixWithAi(page);
  const fixedOk = await waitStatus(page, "code-status", /完成|Done/, 20000);
  check("用 AI 修 → fixed code runs (no infinite loop)", fixedOk && !/while\s*\(\s*true\s*\)/.test(await page.getByTestId("code-editor").inputValue()), fixMsg.slice(0, 80));

  // V1: web mode with html + css + js files.
  await page.getByTestId("to-web").click();
  check("switch to web mode", /網頁模式|Web mode/.test(await page.getByTestId("code-mode").innerText()));
  await page.getByTestId("file-html").fill('<main><h1 id="h">Hi</h1><button id="go">Go</button><p id="out">0</p><p id="m"></p></main>');
  await page.getByTestId("tab-css").click();
  await page.getByTestId("file-css").fill("#h { color: rgb(255, 0, 0); }");
  await page.getByTestId("tab-js").click();
  await page.getByTestId("code-editor").fill('let n = 0;\ndocument.getElementById("go").onclick = () => { n++; document.getElementById("out").textContent = n; };\ndocument.getElementById("m").textContent = "mock:" + (campus.mock.get("base") + 2);\nconsole.log("page ready");');
  await page.getByTestId("code-run").click();
  check("web preview ran (console bridge)", (await waitStatus(page, "code-status", /完成|Done/)) && /page ready/.test(await page.getByTestId("code-output").innerText()));
  check("preview iframe still sandbox=allow-scripts", (await page.getByTestId("code-preview").getAttribute("sandbox")) === "allow-scripts");
  const frame = page.frameLocator('[data-testid="code-preview"]');
  await frame.locator("#go").click();
  await frame.locator("#go").click();
  check("stitched html+css+js works in preview", (await frame.locator("#out").innerText()) === "2" && (await frame.locator("#h").evaluate((e) => getComputedStyle(e).color)) === "rgb(255, 0, 0)");
  check("campus.mock in page seeded from data.json", (await frame.locator("#m").innerText()) === "mock:42");
  await page.getByTestId("code-save").click();
  await page.waitForFunction(() => /已儲存|Saved/.test(document.querySelector('[data-testid="code-save"]')?.textContent ?? ""), null, { timeout: 10000 });
  const saved = JSON.parse(sql(`select files from create_projects where id='${projectId}'`) || "{}");
  check("multi-file project persisted (html/css/js/data)", saved.html?.includes('id="go"') && saved.css?.includes("#h") && saved.js?.includes("onclick") && saved.data?.includes("base"));

  // V3: blocks.
  await page.getByTestId("tab-blocks").click();
  await page.getByTestId("block-add").click();
  const rule = page.getByTestId("block-rule").first();
  await rule.locator('input[list="p8-ids"]').first().fill("go");
  await rule.getByTestId("block-action").locator('input[list="p8-ids"]').fill("h");
  await rule.getByTestId("block-action").locator('input[placeholder="文字"]').fill("積木OK");
  await page.locator("summary", { hasText: "生成" }).click();
  check("blocks compile to JS (簡易邏輯編排)", /簡易邏輯編排[\s\S]*addEventListener\("click"[\s\S]*積木OK/.test(await page.getByTestId("blocks-js").innerText()));
  await page.getByTestId("code-run").click();
  await waitStatus(page, "code-status", /完成|Done/);
  await page.frameLocator('[data-testid="code-preview"]').locator("#go").click();
  check("block runs in preview alongside script.js", (await page.frameLocator('[data-testid="code-preview"]').locator("#h").innerText()) === "積木OK" && (await page.frameLocator('[data-testid="code-preview"]').locator("#out").innerText()) === "1");

  // V4: export.
  const z = await download(page, "code-zip");
  const names = zipNames(z.buf);
  check("ZIP export (index.html/style.css/script.js/blocks.js/data.json/campus-mock.js)", z.name.endsWith(".zip") && z.buf.readUInt32LE(0) === 0x04034b50 && ["index.html", "style.css", "script.js", "blocks.js", "data.json", "campus-mock.js", "README.txt"].every((n) => names.includes(n)), names.join(","));
  const zipText = z.buf.toString("utf8");
  check("exported index.html links files + mock runtime is honest", /<script src="campus-mock\.js"><\/script>/.test(zipText) && zipText.includes("非真實伺服器"));
  const h = await download(page, "code-html-export");
  check(".html single-file export", h.name.endsWith(".html") && h.buf.toString().includes("data-file=\"blocks.js\""));
  const j = await download(page, "code-export");
  check(".js download kept", j.name.endsWith(".js"));

  // Network still blocked in the web preview; error → 用 AI 修.
  await page.getByTestId("tab-js").click();
  await page.getByTestId("code-editor").fill('fetch("https://example.com").then(() => console.log("LEAK"));\nconsole.log(typeof XMLHttpRequest);');
  await page.getByTestId("code-run").click();
  const netErr = await waitStatus(page, "code-status", /錯誤|Error/);
  await page.waitForTimeout(800);
  check("web preview blocks network (error, no LEAK)", netErr && !(await page.getByTestId("code-output").innerText()).includes("LEAK"));

  await page.getByTestId("code-editor").fill('document.getElementById("go").onclick = () => { document.getElementById("out").textContent = total + 1; };\ndocument.getElementById("out").textContent = scoer;');
  await page.getByTestId("code-run").click();
  const refErr = await waitStatus(page, "code-status", /錯誤|Error/);
  check("web runtime error reported with file/line", refErr && /not defined[\s\S]*script\.js/.test(await page.getByTestId("code-output").innerText()), (await page.getByTestId("code-output").innerText()).slice(0, 100));
  check("「用 AI 修」 offered after web error", await page.getByTestId("vibe-fix").isVisible());
  const fix2 = await fixWithAi(page);
  check("用 AI 修 (web) → preview runs clean", await waitStatus(page, "code-status", /完成|Done/, 20000), fix2.slice(0, 80));

  // Loop guard in the page preview.
  await page.getByTestId("code-editor").fill("let i = 0;\nwhile (true) { i++; }");
  await page.getByTestId("code-run").click();
  check("web preview loop guard → 超時 (tab stays responsive)", await waitStatus(page, "code-status", /超時|Timed out/, 12000));

  // NL edit of a multi-file project.
  const before = JSON.parse(sql(`select files from create_projects where id='${projectId}'`));
  const m = await vibe(page, "幫我改：做一個有「撳我」按鈕嘅計數器網頁，按鈕用綠色");
  const after = JSON.parse(sql(`select files from create_projects where id='${projectId}'`));
  check("NL edit updates the multi-file project", after.html.trim().length > 0 && JSON.stringify(after) !== JSON.stringify(before), m.slice(0, 80));
  check("NL result previews in sandbox", (await waitStatus(page, "code-status", /完成|Done|錯誤|Error/, 20000)) && (await page.getByTestId("code-preview").getAttribute("sandbox")) === "allow-scripts");

  // P1–P7 regressions (student).
  const c = await page.request.post(`${BASE}/api/chat`, { data: { modelId: "campus-fast", content: "用一句話解釋乜嘢係質數。" }, timeout: 120000 });
  check(`${STUDENT} chat still works`, c.status() === 200 && (await c.text()).length > 5);
  for (const p of ["/s", "/ai", "/s/practice", "/s/practice/photo", "/s/assignments", "/s/wrongbook", "/s/progress", "/s/library", "/s/apps", "/research"]) check(`${STUDENT} ${p} 200`, (await status(page, p)) === 200);
  await page.context().close();
}

// ---- t09: App Builder ------------------------------------------------------------------------------------
let appId = "";
{
  const { page } = await session(browser, "t09");
  await page.goto(`${BASE}/t/apps`);
  await page.getByTestId("app-new-picker").click();
  await page.waitForURL(/\/t\/apps\/build\/[a-z0-9]+$/);
  appId = page.url().match(/\/build\/([a-z0-9]+)$/)[1];
  const files = JSON.parse(sql(`select files from app_listings where id='${appId}'`) || "{}");
  check("new app stored as html + css + js files", files.html?.includes('id="go"') && files.css?.includes("body") && files.js?.includes("pool"));
  const frame = () => page.frameLocator('[data-testid="app-preview"]');
  await frame().locator("#go").click();
  check("P6 template still runs in preview", /剩餘/.test(await frame().locator("#left").innerText()));
  await page.getByTestId("app-title").fill("煙測應用 P8 積木");

  // Blocks via the editor.
  await page.getByTestId("tab-blocks").click();
  await page.getByTestId("block-add").click();
  const rule = page.getByTestId("block-rule").first();
  await rule.locator('input[list="p8-ids"]').first().fill("reset");
  await rule.getByTestId("block-action").locator("select").selectOption("random");
  await rule.getByTestId("block-action").locator('input[list="p8-ids"]').fill("out");
  await rule.getByTestId("block-action").locator('input[placeholder="選項（逗號分隔）"]').fill("積木A,積木B");
  await page.waitForTimeout(1200); // debounced live preview
  await frame().locator("#reset").click();
  check("teacher blocks → preview (random pick)", /積木[AB]/.test(await frame().locator("#out").innerText()));
  await page.getByTestId("app-save").click();
  await page.waitForTimeout(1500);
  const row = sql(`select status || '|' || (instr(html, '簡易邏輯編排') > 0) || '|' || json_array_length(json_extract(files, '$.blocks')) from app_listings where id='${appId}'`);
  check("blocks saved; stitched html contains generated JS; draft", row === "draft|1|1", row);

  // NL on files + 積木 (model decides the exact files).
  const nl = await vibe(page, "加積木：撳 #go 嗰陣將 #left 改做「已抽」，並且將抽到嘅名改做紅色");
  check("app NL edit → still draft + sandboxed", sql(`select status from app_listings where id='${appId}'`) === "draft" && (await page.getByTestId("app-preview").getAttribute("sandbox")) === "allow-scripts", nl.slice(0, 80));
  const nlBlocks = Number(sql(`select json_array_length(json_extract(files, '$.blocks')) from app_listings where id='${appId}'`) || 0);
  console.log(`info  NL blocks after edit: ${nlBlocks}`);

  // Error → 用 AI 修 in the app builder.
  await page.getByTestId("tab-js").click();
  await page.getByTestId("app-js").fill(`${await page.getByTestId("app-js").inputValue()}\nshowWinner();`);
  await page.getByTestId("app-reload").click();
  check("app preview error shown", await waitStatus(page, "app-run-status", /錯誤|Error/));
  check("「用 AI 修」 in app builder", await page.getByTestId("vibe-fix").isVisible());
  const fx = await fixWithAi(page);
  check("app 用 AI 修 → preview clean, still draft", (await waitStatus(page, "app-run-status", /完成|Done/, 20000)) && sql(`select status from app_listings where id='${appId}'`) === "draft", fx.slice(0, 80));

  const az = await download(page, "app-zip");
  check("app ZIP export", az.name.endsWith(".zip") && zipNames(az.buf).includes("index.html"));

  // 上架 = moderation path only.
  check("publish copy says not a cloud deploy", (await page.getByTestId("app-builder").innerText()).includes("唔係雲端正式部署"));
  await page.getByTestId("app-submit").click();
  await page.waitForFunction(() => /審核中|In review/.test(document.querySelector('[data-testid="app-status"]')?.textContent ?? ""), null, { timeout: 15000 });
  check("submit → pending review, not live", sql(`select status || '|' || length(published_html) from app_listings where id='${appId}'`) === "pending|0");
  for (const p of ["/t", "/t/grading", "/t/bank", "/t/apps", "/t/drafts"]) check(`t09 ${p} 200`, (await status(page, p)) === 200);
  await page.context().close();
}

// ---- admin: moderation queue -------------------------------------------------------------------------------
{
  const { page } = await session(browser, "admin");
  check("admin /a/moderation lists the P8 app", (await status(page, "/a/moderation")) === 200 && (await page.getByTestId("app-queue").innerText()).includes("煙測應用 P8 積木"));
  await page.context().close();
}

await browser.close();
if (projectId) sql(`delete from create_projects where id='${projectId}'`);
sql("delete from app_listings where title like '煙測應用%'");
console.log(`\n${failed ? `FAILED ${failed}/${total}` : `ALL ${total} PASS`}`);
process.exit(failed ? 1 : 0);
