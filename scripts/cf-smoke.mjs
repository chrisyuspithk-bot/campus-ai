// Live smoke of the Cloudflare deployment: login per role, main pages, DB write + read-back, mock AI chat.
// Usage: node scripts/cf-smoke.mjs   (BASE overrides the URL)
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "https://campus-ai.securepro-hk.workers.dev/campus-ai";
const PAGES = {
  s123: ["/s", "/s/practice", "/s/assignments", "/s/wrongbook", "/s/progress", "/s/library", "/s/create", "/s/essay", "/s/videos", "/s/tutors", "/s/apps", "/s/classes", "/s/studio", "/search", "/research", "/me"],
  t09: ["/t", "/t/bank", "/t/papers", "/t/assignments", "/t/grading", "/t/classes", "/t/alerts", "/t/media", "/t/scan", "/t/tutors", "/t/drafts", "/t/community", "/t/apps", "/t/reports", "/t/studio"],
  admin: ["/a", "/a/users", "/a/models", "/a/analytics", "/a/features", "/a/logs", "/a/moderation", "/a/org", "/a/policies", "/a/safety"],
};
let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
};

const browser = await chromium.launch();
for (const [user, paths] of Object.entries(PAGES)) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator("#username").fill(user);
  await page.locator("#password").fill("demo1234");
  await page.locator('button[type="submit"]').last().click();
  const loggedIn = await page.waitForURL((u) => !String(u).includes("/login"), { timeout: 30000 }).then(() => true, () => false);
  check(`login ${user}`, loggedIn, page.url());
  if (!loggedIn) continue;

  for (const p of paths) {
    const res = await page.goto(`${BASE}${p}`, { waitUntil: "domcontentloaded" }).catch(() => null);
    const body = res ? await page.locator("body").innerText().catch(() => "") : "";
    const bad = /Application error|Internal Server Error|Worker threw|Error 1\d\d\d/i.test(body);
    check(`${user} ${p}`, res?.status() === 200 && !bad, `${res?.status()}`);
  }

  if (user === "s123") {
    const text = `cf smoke ${Date.now()}`;
    const chat = await ctx.request.post(`${BASE}/api/chat`, { data: { content: text }, timeout: 60000 });
    const reply = await chat.text();
    check("chat responds", chat.status() === 200, `${chat.status()} ${reply.slice(0, 120).replace(/\s+/g, " ")}`);
    const list = await ctx.request.get(`${BASE}/api/conversations`);
    const listed = await list.text();
    check("conversation persisted", list.status() === 200 && listed.includes("cf smoke"), `${list.status()}`);
  }
  await ctx.close();
}
await browser.close();
console.log(failed ? `${failed} FAILED` : "ALL PASS");
process.exit(failed ? 1 : 0);
