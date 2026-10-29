/* P8 demo data (vibe coding deepen): one multi-file Code Lab project for s125 — html + css + js + data.json for
 * campus.mock (front end + demo in-memory data layer) + a couple of 簡易邏輯編排 blocks. Additive only.
 * Idempotent: inserted only when that student has no project with this title (p6-smoke wipes s125's code projects,
 * so a later seed restores it). Marker setting `p8SeedInit` records the first run. */
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import * as schema from "../src/lib/db/schema";
import type { ProjectFiles } from "../src/lib/p8/files";

type DB = BetterSQLite3Database<typeof schema>;
const id = () => randomUUID().replace(/-/g, "").slice(0, 16);

const DEMO: ProjectFiles = {
  html: `<main class="card">
  <h2 id="title">🗳️ 班會活動投票</h2>
  <div id="options"></div>
  <div id="result"></div>
  <p><input id="idea" placeholder="提議新活動"> <button id="add">提議</button></p>
  <p>提議：<span id="ideas">—</span></p>
  <button id="tip">點樣運作？</button>
  <p id="help" hidden>按鈕同結果條係「前端」；票數存喺 campus.mock（示範用記憶體資料層，非真實伺服器）。</p>
</main>`,
  css: `body { font-family: system-ui, "Noto Sans HK", sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; background: #f1f5f9; }
.card { background: #fff; padding: 24px 32px; border-radius: 16px; box-shadow: 0 4px 20px #0001; min-width: 300px; }
button { font: inherit; padding: 6px 16px; margin: 3px; border-radius: 999px; border: 0; background: #4f46e5; color: #fff; cursor: pointer; }
input { font: inherit; padding: 5px 8px; border: 1px solid #cbd5e1; border-radius: 8px; }
.bar { height: 12px; background: #a5b4fc; border-radius: 6px; margin: 2px 0 8px; }`,
  js: `// 前端：畫按鈕同結果；「後端」：campus.mock（重新整理就清空）
const options = campus.mock.get("options", []);

function render() {
  const votes = campus.mock.get("votes", {});
  const total = Object.values(votes).reduce((a, b) => a + b, 0) || 1;
  document.getElementById("result").innerHTML = options
    .map((o) => \`<div>\${o}：\${votes[o] || 0} 票</div><div class="bar" style="width:\${((votes[o] || 0) / total) * 100}%"></div>\`)
    .join("");
}

for (const o of options) {
  const b = document.createElement("button");
  b.textContent = o;
  b.onclick = () => {
    const votes = campus.mock.get("votes", {});
    votes[o] = (votes[o] || 0) + 1; // 寫入示範資料層
    campus.mock.set("votes", votes);
    render();
  };
  document.getElementById("options").append(b);
}
render();
console.log("資料層 keys:", campus.mock.keys());`,
  data: JSON.stringify({ options: ["行山", "燒烤", "睇電影"], votes: { 行山: 2 } }, null, 2),
  blocks: [
    { on: "click", source: "add", actions: [{ type: "save", from: "idea", key: "ideas", target: "ideas" }] },
    { on: "click", source: "tip", actions: [{ type: "toggle", target: "help" }] },
  ],
};

const TITLE = "P8 示範：班會投票（多檔案 + 示範資料層）";

export function seedP8(db: DB) {
  const owner = db.select().from(schema.users).where(eq(schema.users.username, "s125")).get() ?? db.select().from(schema.users).where(eq(schema.users.username, "s123")).get();
  const p = schema.createProjects;
  const exists = owner && db.select({ id: p.id }).from(p).where(and(eq(p.ownerId, owner.id), eq(p.title, TITLE))).get();
  if (owner && !exists) db.insert(p).values({ id: id(), ownerId: owner.id, kind: "code", title: TITLE, html: DEMO.js, files: DEMO }).run();
  db.insert(schema.settings).values({ key: "p8SeedInit", value: new Date().toISOString() }).onConflictDoNothing().run();
  console.log(`• P8 seed: multi-file Code Lab demo project ${!owner ? "skipped (no student)" : exists ? "already present" : `added for ${owner.username}`}`);
}
