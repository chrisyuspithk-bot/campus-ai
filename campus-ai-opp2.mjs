import { chromium } from "playwright";
const BASE = "http://188.245.12.100:3060/campus-ai";
const log = (k, v) => console.log(k, typeof v === "string" ? v : JSON.stringify(v));
const browser = await chromium.launch({ headless: true });

async function login(page, user, pass = "demo1234") {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator("#username").fill(user);
  await page.locator("#password").fill(pass);
  await Promise.all([
    page.waitForURL((u) => !String(u).includes("/login"), { timeout: 20000 }).catch(() => null),
    page.locator('button[type="submit"]').last().click(),
  ]);
  await page.waitForTimeout(800);
}

// R2 opposite
const ctx = await browser.newContext();
const page = await ctx.newPage();

// empty login
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.locator('button[type="submit"]').last().click();
await page.waitForTimeout(800);
log("R2_empty", { url: page.url(), msg: await page.getByText(/請輸入用戶名及密碼|帳號或密碼錯誤/).count() });

// sql-ish
await login(page, "admin' OR '1'='1", "x");
log("R2_sqli", page.url());
const stillLogin = page.url().includes("/login");
log("R2_sqli_stays_login", stillLogin);

await login(page, "s123");
// deep teacher draft URL
await page.goto(`${BASE}/t/drafts/89300c4c5c42428c`, { waitUntil: "domcontentloaded" });
log("R2_student_deep_draft", page.url());
// admin safety as student
await page.goto(`${BASE}/a/safety`, { waitUntil: "domcontentloaded" });
log("R2_student_safety", page.url());
// P3 locked
await page.goto(`${BASE}/s/practice`, { waitUntil: "domcontentloaded" });
const p3 = await page.getByText(/將於 P3 開放|將於 P2 開放|搵唔到/).count();
log("R2_p3_practice", { url: page.url(), hints: p3 });
await page.goto(`${BASE}/s/classes`, { waitUntil: "domcontentloaded" });
log("R2_p3_classes", { url: page.url(), text: await page.locator("main").innerText().then(t=>t.slice(0,120)).catch(()=>"") });

// chat path: listen
const chatReq = [];
page.on("request", (r) => {
  if (r.url().includes("/api/chat")) chatReq.push(r.url());
});
await page.goto(`${BASE}/ai`, { waitUntil: "networkidle" });
const box = page.locator("textarea, [contenteditable=true]").first();
if (await box.count()) {
  await box.fill("hello opposite test");
  const send = page.getByRole("button", { name: /送出|發送|Send/i }).first();
  if (await send.count()) {
    await send.click();
    await page.waitForTimeout(2500);
  }
}
log("R2_chat_urls", chatReq);

// logout then replay cookie attempt: capture cookie before logout
const cookiesBefore = await page.context().cookies();
await page.goto(`${BASE}/me`, { waitUntil: "domcontentloaded" });
const logout = page.getByRole("button", { name: /^登出$/ }).first();
if (await logout.count()) {
  await logout.click();
  await page.waitForTimeout(1200);
}
log("R2_logout", page.url());
// new context with old cookie
const ctx2 = await browser.newContext();
await ctx2.addCookies(cookiesBefore);
const p2 = await ctx2.newPage();
const r = await p2.goto(`${BASE}/s`, { waitUntil: "domcontentloaded" });
log("R2_replay_old_cookie", { status: r?.status(), url: p2.url() });
await ctx2.close();
await ctx.close();

// teacher cannot open admin policies
const ctx3 = await browser.newContext();
const p3p = await ctx3.newPage();
await login(p3p, "t09");
await p3p.goto(`${BASE}/a/policies`, { waitUntil: "domcontentloaded" });
log("R2_teacher_policies", p3p.url());
await ctx3.close();

await browser.close();
console.log("DONE");
