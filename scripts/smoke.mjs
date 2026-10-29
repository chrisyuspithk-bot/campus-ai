// End-to-end smoke test against a running server.
// Usage: BASE_URL=http://localhost:3000 npm run test:smoke   (SHOTS=dir to save screenshots)
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const ROLES = [
  { user: "s123", home: "/s", name: "阿明", routes: ["/s", "/s/tutors", "/ai", "/me", "/search?q=數學", "/s/studio"] },
  { user: "t09", home: "/t", name: "陳老師", routes: ["/t", "/t/drafts", "/t/tutors", "/ai", "/me"] },
  { user: "admin", home: "/a", name: "IT 管理員", routes: ["/a", "/a/features", "/a/models", "/a/users", "/ai", "/me"] },
];

let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "✓" : "✗"} ${msg}`);
  if (!ok) failures++;
};

const browser = await chromium.launch();
try {
  for (const r of ROLES) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto(`${BASE}/login`);
    await page.fill("#username", r.user);
    await page.fill("#password", "demo1234");
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE}${r.home}`, { timeout: 30_000 }).catch(() => {});
    check(new URL(page.url()).pathname === r.home, `${r.user}: login redirects to ${r.home} (got ${new URL(page.url()).pathname})`);
    const name = await page.locator('[data-testid="topbar-name"]').textContent().catch(() => "");
    check(name === r.name, `${r.user}: top bar shows ${r.name}`);

    for (const route of r.routes) {
      const res = await page.goto(`${BASE}${route}`);
      const body = await page.locator("body").innerText();
      check(res?.status() === 200, `${r.user}: GET ${route} → ${res?.status()}`);
      check(!/open\s?webui/i.test(body + (await page.content())), `${r.user}: ${route} has no OpenWebUI branding`);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${r.user}${route.replace(/[/?=]/g, "_")}.png`, fullPage: false });
    }

    // Wrong-role prefix redirects home.
    const other = r.home === "/s" ? "/a" : "/s";
    await page.goto(`${BASE}${other}`);
    check(new URL(page.url()).pathname === r.home, `${r.user}: ${other} redirects to own home`);
    check(errors.length === 0, `${r.user}: no client errors ${errors.join("; ")}`);
    await ctx.close();
  }

  // Student: tutor chat streams, persists, and is reachable at /ai/c/:id
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.fill("#username", "s123");
    await page.fill("#password", "demo1234");
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE}/s`);
    await page.goto(`${BASE}/ai?tutor=math`);
    check((await page.locator('[data-testid="chat-title"]').textContent())?.includes("數學導師"), "tutor deep link locks persona title");
    await page.fill("textarea", "點樣解 x^2 - 5x + 6 = 0？");
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/ai\/c\/[a-z0-9]+/, { timeout: 30_000 });
    await page.locator('[data-role="assistant"] .katex').first().waitFor({ timeout: 30_000 });
    check(true, "assistant reply streamed with KaTeX math");
    await page.waitForTimeout(1500);
    const url = page.url();
    await page.reload();
    const count = await page.locator('[data-role="assistant"]').count();
    check(count >= 1 && page.url() === url, `conversation persisted at ${new URL(url).pathname}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/chat-tutor.png` });

    // Side panel
    await page.goto(`${BASE}/s`);
    await page.click('button[title="AI 面板"]');
    check(await page.locator('aside[aria-label="AI 助手"]').isVisible(), "AI panel opens from top bar");
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/panel.png` });
    await ctx.close();
  }

  // Bad password shows a generic error
  {
    const page = await browser.newPage();
    await page.goto(`${BASE}/login`);
    await page.fill("#username", "s123");
    await page.fill("#password", "wrong-password");
    await page.click('button[type="submit"]');
    await page.locator('p[role="alert"]').waitFor({ timeout: 15_000 });
    check((await page.locator('p[role="alert"]').textContent())?.includes("帳號或密碼錯誤"), "wrong password shows generic error");
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll smoke checks passed");
process.exit(failures ? 1 : 0);
