import { chromium } from "playwright";

const HOST = "http://188.245.12.100:3060";
const BASE = `${HOST}/campus-ai`;
function log(k, v) {
  console.log(k, typeof v === "string" ? v : JSON.stringify(v));
}

const browser = await chromium.launch({ headless: true });

async function withUser(user, fn) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator("#username").fill(user);
  await page.locator("#password").fill("demo1234");
  await Promise.all([
    page.waitForURL((u) => !String(u).includes("/login"), { timeout: 20000 }).catch(() => null),
    page.locator('button[type="submit"]').last().click(),
  ]);
  await page.waitForTimeout(1200);
  await fn(page, ctx);
  await ctx.close();
}

await withUser("s123", async (page) => {
  log("SV_s123_url", page.url());
  const cookies = await page.context().cookies();
  const sess = cookies.find((c) => c.name === "campus_session");
  log("SV_cookie", { present: !!sess, secure: sess?.secure, domain: sess?.domain });
  const home = await page.goto(`${BASE}/s`, { waitUntil: "domcontentloaded" });
  log("SV_home_s", { status: home?.status(), url: page.url() });
  for (const u of ["/ai", "/s/tutors", "/s/studio", "/s/essay", "/s/create", "/s/library"]) {
    const r = await page.goto(`${BASE}${u}`, { waitUntil: "domcontentloaded" });
    const lock = await page.getByText("將於 P2 開放").count();
    log(`SV_${u}`, { status: r?.status(), url: page.url(), lock });
  }
  await page.goto(`${BASE}/t`, { waitUntil: "domcontentloaded" });
  log("OPP1_student_t", page.url());
  await page.goto(`${BASE}/a`, { waitUntil: "domcontentloaded" });
  log("OPP1_student_a", page.url());
  // wrong password in new context covered separately
  await page.goto(`${BASE}/me`, { waitUntil: "domcontentloaded" });
  const btn = page.getByRole("button", { name: /^登出$/ }).first();
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(1500);
  }
  log("SV_logout", page.url());
  await page.goto(`${BASE}/s`, { waitUntil: "domcontentloaded" });
  log("SV_revisit", page.url());
});

await withUser("t09", async (page) => {
  log("SV_t09_url", page.url());
  for (const u of ["/t", "/t/drafts", "/t/tutors", "/t/studio", "/t/grading/essay"]) {
    const r = await page.goto(`${BASE}${u}`, { waitUntil: "domcontentloaded" });
    log(`SV_t_${u}`, { status: r?.status(), url: page.url() });
  }
  await page.goto(`${BASE}/a`, { waitUntil: "domcontentloaded" });
  log("OPP1_teacher_a", page.url());
});

await withUser("admin", async (page) => {
  log("SV_admin_url", page.url());
  for (const u of ["/a", "/a/features", "/a/models", "/a/users", "/a/safety", "/a/policies", "/a/logs"]) {
    const r = await page.goto(`${BASE}${u}`, { waitUntil: "domcontentloaded" });
    log(`SV_a_${u}`, { status: r?.status(), url: page.url() });
  }
});

// opposite round bits: bad login
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator("#username").fill("admin");
  await page.locator("#password").fill("wrong");
  await page.locator('button[type="submit"]').last().click();
  await page.waitForTimeout(1200);
  log("OPP1_bad_pw_url", page.url());
  const alert = await page.getByText(/帳號或密碼錯誤/).count();
  log("OPP1_bad_pw_msg", alert);
  const bare = await page.goto(`${HOST}/login?next=%2Ft%2Fdrafts%2F89300c4c5c42428c`, {
    waitUntil: "domcontentloaded",
  });
  log("OPP1_bare_login", bare?.status());
  await ctx.close();
}

await browser.close();
console.log("DONE");
