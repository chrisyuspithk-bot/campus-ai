import "server-only";
import type { CurrentUser } from "@/lib/auth/dal";
import { runStructured } from "@/lib/ai/run";
import { FILE_CAPS, isWeb, normalizeBlocks, stitch, type BlockRule, type ProjectFiles } from "@/lib/p8/files";

// P7 (G9) natural-language "vibe" coding, P8 multi-file: describe → AI rewrites html/css/js/data.json and the
// 簡易邏輯編排 blocks → it runs ONLY in the existing browser sandboxes (code lab console: worker in an opaque-origin
// iframe, 3 s timeout, network stubbed; web pages / apps: sandboxed iframe with connect-src 'none' + loop guard).
// Nothing generated here is executed on the server. `error` = P8 V2 "用 AI 修": fix what the sandbox reported.

/** files = the full updated project; code = script.js (code lab) or the stitched HTML (app builder). */
export type VibeOut = { reply: string; files: ProjectFiles; code: string };

const NETWORK_RE = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|navigator\.sendBeacon)\b/g;
const FILE_KEYS = ["html", "css", "js", "data"] as const;
const unfence = (s: string) => s.replace(/^\s*```[a-z]*\n?|```\s*$/g, "");

function normalize(current: ProjectFiles, legacyKey: "js" | "html") {
  return (raw: unknown): ProjectFiles & { reply: string } | null => {
    const o = raw as { reply?: unknown; code?: unknown; files?: Record<string, unknown>; blocks?: unknown };
    if (!o || typeof o !== "object") return null;
    const next: ProjectFiles = { ...current, blocks: [...current.blocks] };
    let changed = false;
    const f = o.files && typeof o.files === "object" ? o.files : {};
    for (const k of FILE_KEYS) {
      const v = f[k] ?? f[{ html: "index.html", css: "style.css", js: "script.js", data: "data.json" }[k]];
      if (typeof v === "string") { next[k] = unfence(v).slice(0, FILE_CAPS[k]); changed = true; }
      else if (k === "data" && v && typeof v === "object") { next.data = JSON.stringify(v, null, 2).slice(0, FILE_CAPS.data); changed = true; }
    }
    if (typeof o.code === "string" && o.code.trim()) { next[legacyKey] = unfence(o.code).slice(0, FILE_CAPS[legacyKey]); changed = true; } // P7 shape
    if (Array.isArray(o.blocks)) { next.blocks = normalizeBlocks(o.blocks); changed = true; }
    if (!changed || !(next.js.trim() || next.html.trim())) return null;
    return { ...next, reply: typeof o.reply === "string" ? o.reply.slice(0, 600) : "" };
  };
}

const zh = (s: string) => /[㐀-鿿]/.test(s);

// ---- demo-mode (no OpenRouter key) generators --------------------------------------------------------

const CARD_CSS = `body { font-family: system-ui, "Noto Sans HK", sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; background: #f1f5f9; }
.card { background: #fff; padding: 24px 32px; border-radius: 16px; box-shadow: 0 4px 20px #0001; text-align: center; min-width: 260px; }
button { font: inherit; font-size: 17px; padding: 8px 18px; margin: 4px; border-radius: 999px; border: 0; background: #4f46e5; color: #fff; cursor: pointer; }
.big { font-size: 48px; font-weight: 700; margin: 12px 0; }
input { font: inherit; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 8px; }
.bar { height: 14px; background: #a5b4fc; border-radius: 6px; margin: 2px 0 8px; transition: width .3s; }`;

function webTemplate(instruction: string, z: boolean): { files: Omit<ProjectFiles, "blocks">; blocks: BlockRule[]; reply: string } {
  const title = instruction.replace(/[<>&"]/g, "").slice(0, 30) || "Mini app";
  if (/積木|block|編排/i.test(instruction)) {
    return {
      files: {
        html: `<main class="card">\n  <h2 id="title">🎲 積木小遊戲</h2>\n  <p class="big" id="dice">?</p>\n  <button id="roll">擲骰</button>\n  <button id="add">得分 +1</button>\n  <p>分數：<b id="score">0</b></p>\n  <button id="tip">提示</button>\n  <p id="help" hidden>擲到 6 就幫自己加一分！</p>\n</main>`,
        css: CARD_CSS,
        js: "// 主要邏輯由「積木」分頁（簡易邏輯編排）生成；你亦可以喺度加自己嘅代碼。\nconsole.log(\"積木已載入\");",
        data: "",
      },
      blocks: [
        { on: "load", source: "", actions: [{ type: "setText", target: "title", text: z ? "🎲 積木小遊戲" : "🎲 Block game" }] },
        { on: "click", source: "roll", actions: [{ type: "random", target: "dice", options: "1,2,3,4,5,6" }] },
        { on: "click", source: "add", actions: [{ type: "count", target: "score", by: 1 }, { type: "color", target: "score", color: "#16a34a" }] },
        { on: "click", source: "tip", actions: [{ type: "toggle", target: "help" }] },
      ],
      reply: z ? "（示範模式）用「簡易邏輯編排」積木整咗擲骰、計分同顯示／隱藏提示，可以喺「積木」分頁改。" : "(Demo mode) Built dice, score and show/hide with logic blocks — edit them in the Blocks tab.",
    };
  }
  if (/投票|vote|留言|後端|backend|資料|數據|data|mock|前後端/i.test(instruction)) {
    return {
      files: {
        html: `<main class="card">\n  <h2>🗳️ ${z ? "班會投票" : "Class vote"}</h2>\n  <div id="options"></div>\n  <div id="result" style="text-align:left"></div>\n  <p style="font-size:12px;color:#64748b">campus.mock：示範用記憶體資料層，非真實伺服器</p>\n</main>`,
        css: CARD_CSS,
        js: `// 「前端」：畫面同按鈕；「後端」：campus.mock（示範用記憶體資料層，重新整理就清空）\nconst options = campus.mock.get("options", []);\n\nfunction render() {\n  const votes = campus.mock.get("votes", {});\n  const total = Object.values(votes).reduce((a, b) => a + b, 0) || 1;\n  document.getElementById("result").innerHTML = options\n    .map((o) => \`<div>\${o}：\${votes[o] || 0} 票</div><div class="bar" style="width:\${((votes[o] || 0) / total) * 100}%"></div>\`)\n    .join("");\n}\n\nfor (const o of options) {\n  const b = document.createElement("button");\n  b.textContent = o;\n  b.onclick = () => {\n    const votes = campus.mock.get("votes", {});\n    votes[o] = (votes[o] || 0) + 1;   // 寫入資料層\n    campus.mock.set("votes", votes);\n    render();\n  };\n  document.getElementById("options").append(b);\n}\nrender();\nconsole.log("資料層 keys:", campus.mock.keys());`,
        data: JSON.stringify({ options: z ? ["行山", "燒烤", "電影"] : ["Hiking", "BBQ", "Movie"], votes: {} }, null, 2),
      },
      blocks: [],
      reply: z ? "（示範模式）整咗一個投票頁：前端係按鈕同結果條，「後端」用 campus.mock 記憶體資料層（data.json 係初始資料），唔係真實伺服器。" : "(Demo mode) A voting page: buttons + result bars, with campus.mock as the demo in-memory data layer (seeded from data.json) — not a real server.",
    };
  }
  if (/隨機|抽|random|dice|骰|pick/i.test(instruction)) {
    return {
      files: {
        html: `<main class="card">\n  <h2>${title}</h2>\n  <p class="big" id="out">?</p>\n  <button id="go">${z ? "撳我" : "Roll"}</button>\n  <p id="hist" style="color:#64748b"></p>\n</main>`,
        css: CARD_CSS,
        js: `// 每撳一次產生 1–6 嘅隨機數字，並記低最近 10 次\nconst hist = [];\ndocument.getElementById("go").onclick = () => {\n  const n = Math.floor(Math.random() * 6) + 1;\n  document.getElementById("out").textContent = n;\n  hist.unshift(n);\n  document.getElementById("hist").textContent = hist.slice(0, 10).join(" ");\n};`,
        data: "",
      },
      blocks: [],
      reply: z ? "（示範模式）整好一個隨機數字頁：html 放畫面、css 管樣式、js 處理撳掣。" : "(Demo mode) A random-number page: html for layout, css for style, js for the click.",
    };
  }
  return {
    files: {
      html: `<main class="card">\n  <h2>${title}</h2>\n  <div class="big" id="out">0</div>\n  <button id="b">${z ? "撳我" : "Click"}</button>\n</main>`,
      css: CARD_CSS,
      js: `// 每撳一次加 1\nlet n = 0;\ndocument.getElementById("b").onclick = () => {\n  n++;\n  document.getElementById("out").textContent = n;\n};`,
      data: "",
    },
    blocks: [],
    reply: z ? "（示範模式）整咗一個簡單互動頁面（html + css + js）作起點，可以再描述要改咩。" : "(Demo mode) A simple interactive page (html + css + js) as a starting point — describe what to change next.",
  };
}

function consoleJs(instruction: string, current: string, z: boolean) {
  if (/乘數|乘法表|times table/i.test(instruction)) return `// 乘數表\nfor (let i = 1; i <= 9; i++) {\n  let row = "";\n  for (let j = 1; j <= 9; j++) row += String(i * j).padStart(4);\n  console.log(row);\n}`;
  if (/質數|prime/i.test(instruction)) return `// 100 以內嘅質數\nconst primes = [];\nfor (let n = 2; n <= 100; n++) {\n  if (primes.every((p) => n % p !== 0)) primes.push(n);\n}\nconsole.log(primes.join(", "));\nconsole.log("共", primes.length, "個");`;
  if (/抽|隨機|random|dice|骰/i.test(instruction)) return `// 擲骰 600 次，睇吓每個點數出現幾多次\nconst count = [0, 0, 0, 0, 0, 0];\nfor (let i = 0; i < 600; i++) count[Math.floor(Math.random() * 6)]++;\ncount.forEach((c, i) => console.log(i + 1, "點：", "█".repeat(Math.round(c / 5)), c));`;
  if (/平均|mean|統計|stat/i.test(instruction)) return `// 計平均數、中位數、標準差\nconst data = [56, 72, 88, 64, 91, 77, 69];\nconst mean = data.reduce((a, b) => a + b, 0) / data.length;\nconst s = [...data].sort((a, b) => a - b);\nconst median = s[Math.floor(s.length / 2)];\nconst sd = Math.sqrt(data.reduce((a, x) => a + (x - mean) ** 2, 0) / data.length);\nconsole.log({ mean: mean.toFixed(2), median, sd: sd.toFixed(2) });`;
  return `${current.trim() ? current.trim() + "\n\n" : ""}// ${instruction.slice(0, 60).replace(/\n/g, " ")}\nconsole.log(${JSON.stringify(z ? "（示範模式）請描述得具體啲，例如「印出乘數表」「搵 100 以內嘅質數」「做一個有按鈕嘅網頁」" : "(Demo mode) Try e.g. \"print a times table\", \"primes under 100\" or \"a web page with a button\"")});`;
}

const WEB_RE = /網頁|頁面|按鈕|按掣|撳|介面|畫面|page|button|html|\bui\b|計數器|counter|投票|vote|留言|後端|backend|前後端|mock|積木|block|編排/i;
const COLOR_RE = /顏色|色|colou?r|樣式|style|css/i;

function mockProject(instruction: string, files: ProjectFiles, alwaysWeb: boolean): ProjectFiles & { reply: string } {
  const z = zh(instruction);
  if (isWeb(files) && COLOR_RE.test(instruction) && !/積木|block/i.test(instruction)) {
    const css = /#4f46e5/.test(files.css) ? files.css.replace(/#4f46e5/g, "#0d9488") : `${files.css}\n\n/* ${instruction.slice(0, 40).replace(/\*\//g, "")} */\nbutton { background: #0d9488; color: #fff; }\nbody { background: #ecfeff; }`;
    return { ...files, css, reply: z ? "（示範模式）已改 style.css：按鈕同背景轉咗新顏色。" : "(Demo mode) Updated style.css with new button / background colours." };
  }
  if (alwaysWeb || WEB_RE.test(instruction)) {
    const t = webTemplate(instruction, z);
    return { ...t.files, blocks: t.blocks, reply: t.reply };
  }
  return { ...files, js: consoleJs(instruction, files.js, z), reply: z ? "（示範模式）已按你嘅描述寫好代碼，撳「執行」喺沙盒入面試吓。" : "(Demo mode) Code written from your description — press Run to try it in the sandbox." };
}

/** Demo-mode "用 AI 修": a few classroom-typical repairs keyed off the sandbox error. */
function mockFix(files: ProjectFiles, error: string, en: boolean): ProjectFiles & { reply: string } {
  const f = { ...files };
  const say = (zhs: string, ens: string) => `（示範模式）${en ? ens : zhs}`;
  if (/⏱|超過|timed? ?out|stopped after/i.test(error)) {
    f.js = f.js.replace(/while\s*\(\s*(true|1)\s*\)/g, "for (let step = 0; step < 1000; step++) /* AI 修：限制最多 1000 次，避免無限迴圈 */").replace(/for\s*\(\s*;\s*;\s*\)/g, "for (let step = 0; step < 1000; step++) /* AI 修：加咗上限 */");
    if (f.js === files.js) f.js = `// AI 修：程式超時。檢查迴圈嘅結束條件有冇機會變成 false。\n${f.js}`;
    return { ...f, reply: say("程式超過 3 秒：原因係無限迴圈（條件永遠成立）。已改成最多行 1000 次，記得迴圈一定要有結束條件。", "It ran past 3 s because the loop never ends. I capped it at 1000 steps — every loop needs a way to stop.") };
  }
  if (/network|網絡|fetch|XMLHttpRequest|WebSocket/i.test(error)) {
    f.js = f.js.replace(/(await\s+)?fetch\s*\([^)]*\)(\s*\.then\([^)]*\))*/g, 'campus.mock.get("data", []) /* AI 修：沙盒冇網絡，改用 campus.mock 示範資料層 */');
    if (!f.data.trim()) f.data = JSON.stringify({ data: [1, 2, 3] }, null, 2);
    return { ...f, reply: say("沙盒唔可以上網，所以 fetch 會失敗。已改用 campus.mock（示範用記憶體資料層），初始資料放喺 data.json。", "The sandbox has no network, so fetch fails. Switched to campus.mock (demo in-memory data) seeded from data.json.") };
  }
  const undef = error.match(/([A-Za-z_$][\w$]*) is not defined/);
  if (undef) {
    f.js = `let ${undef[1]} = 0; // AI 修：「${undef[1]}」未宣告就用咗，喺度先宣告\n${f.js}`;
    return { ...f, reply: say(`「${undef[1]}」未宣告就用咗（ReferenceError）。已喺最頂宣告 let ${undef[1]} = 0，亦要檢查係咪打錯名。`, `"${undef[1]}" was used before it was declared. Declared it at the top — also check for a typo.`) };
  }
  if (/null|undefined \(reading|Cannot set propert/i.test(error)) {
    const ids = [...f.js.matchAll(/getElementById\(\s*["'`]([\w-]+)["'`]\s*\)/g)].map((m) => m[1]).filter((id) => !new RegExp(`id=["']?${id}\\b`).test(f.html));
    if (ids.length) {
      const add = [...new Set(ids)].map((id) => `<div id="${id}"></div>`).join("\n");
      f.html = /<\/body>/i.test(f.html) ? f.html.replace(/<\/body>/i, () => `${add}\n</body>`) : `${f.html}\n${add}`;
      return { ...f, reply: say(`script.js 搵唔到元素 #${ids.join("、#")}，所以係 null。已喺 index.html 補返。`, `script.js looked for #${ids.join(", #")} which wasn't in index.html, so it was null. Added it.`) };
    }
  }
  if (/SyntaxError|Unexpected|missing|Invalid or unexpected/i.test(error)) {
    const count = (re: RegExp) => (f.js.match(re) ?? []).length;
    const fix = ")".repeat(Math.max(0, count(/\(/g) - count(/\)/g))) + "\n" + "}".repeat(Math.max(0, count(/\{/g) - count(/\}/g)));
    if (fix.trim()) {
      f.js = `${f.js}${fix} // AI 修：補返漏咗嘅括號`;
      return { ...f, reply: say("語法錯誤：括號未配對好。已喺尾補返漏咗嘅括號，記住每個 ( { 都要有對應嘅 ) }。", "Syntax error: unbalanced brackets. Added the missing ones at the end — every ( { needs a matching ) }.") };
    }
  }
  f.js = `try {\n${f.js}\n} catch (err) {\n  console.error("AI 修：捉到錯誤 →", err.message); // 示範模式未能自動判斷原因\n}`;
  return { ...f, reply: say(`未能自動判斷原因（${error.slice(0, 80)}），已用 try/catch 包住並印出錯誤，方便你逐步檢查。`, `Couldn't pin down the cause (${error.slice(0, 80)}); wrapped the code in try/catch and log the error so you can debug step by step.`) };
}

// ---- prompts -------------------------------------------------------------------------------------------

const SANDBOX_RULES = [
  "Sandbox rules: NO network (fetch/XHR/WebSocket are blocked), no external scripts/fonts/images/CDNs, no localStorage/cookies, no forms that submit, about 3 seconds per task (no infinite loops).",
  "For any 'backend' / saved data use campus.mock — a demo in-memory data layer (NOT a real server, cleared on reload) seeded from data.json:",
  "campus.mock.get(key, default), campus.mock.set(key, value), campus.mock.push(key, item), campus.mock.keys(), campus.mock.all().",
  "簡易邏輯編排 blocks (optional, JSON array): [{\"on\":\"click\"|\"load\",\"source\":\"buttonElementId\",\"actions\":[ {\"type\":\"setText\",\"target\":id,\"text\":s} | {\"type\":\"count\",\"target\":id,\"by\":n} | {\"type\":\"toggle\",\"target\":id} | {\"type\":\"random\",\"target\":id,\"options\":\"a,b,c\"} | {\"type\":\"color\",\"target\":id,\"color\":\"#hex\"} | {\"type\":\"save\",\"from\":inputId,\"key\":k,\"target\":id} ]}].",
  "Only return \"blocks\" when the request is about blocks/積木 or existing blocks must change (they compile to JS that runs after script.js, element ids must exist in index.html).",
  'JSON shape: {"reply":string,"files":{"html"?:string,"css"?:string,"js"?:string,"data"?:string},"blocks"?:array}. Include ONLY the files you changed, each with its FULL new content.',
  "index.html is the page body/markup only (style.css and script.js are linked in automatically — don't inline them again).",
];

function dump(f: ProjectFiles, cap: number) {
  const part = (name: string, s: string) => `--- ${name} ---\n${s.slice(0, cap) || "(empty)"}`;
  return [part("index.html", f.html), part("style.css", f.css), part("script.js", f.js), part("data.json", f.data), `--- blocks ---\n${f.blocks.length ? JSON.stringify(f.blocks) : "(none)"}`].join("\n\n");
}

function fixPrompt(error: string, en: boolean) {
  return `\n\nThe project FAILED in the sandbox with:\n${error.slice(0, 2000)}\n\nFind the cause and fix it with minimal changes (keep the student's intent). reply: 1–3 sentences in ${en ? "English" : "Traditional Chinese (Hong Kong)"} explaining what was wrong and how it was fixed, as a teacher would.`;
}

/** Code Lab (student): console program, or a small web page once index.html has content. */
export async function vibeCode(user: CurrentUser, instruction: string, files: ProjectFiles, refId: string, error?: string) {
  const en = user.language === "en";
  const res = await runStructured({
    user,
    source: "create",
    refId,
    input: error ? `${instruction}\n${error.slice(0, 500)}` : instruction,
    system: [
      "You help a student with a small project in the Campus AI Code Lab. Files: index.html, style.css, script.js, data.json (+ optional blocks).",
      "Console mode (index.html empty and no blocks): script.js runs in a Web Worker — NO DOM, output only through console.log / console.error.",
      "Web mode (index.html has markup): the files are stitched into one page inside a sandboxed iframe; console.log still shows in the output panel.",
      "Stay in console mode unless the student asks for a page, buttons or other UI.",
      ...SANDBOX_RULES,
      "Keep each file under ~100 lines with short comments in the student's language (Traditional Chinese — Hong Kong — or English) that teach what each part does.",
    ].join("\n"),
    prompt: `${dump(files, 12_000)}\n\nStudent request: ${instruction}${error ? fixPrompt(error, en) : ""}`,
    normalize: normalize(files, "js"),
    mock: () => (error ? mockFix(files, error, en) : mockProject(instruction, files, false)),
  });
  if (!res.ok) return res;
  const { reply, ...next } = res.value;
  next.js = next.js.replace(NETWORK_RE, (m) => `/* blocked: ${m} */ undefined`);
  return { ...res, value: { reply, files: next, code: next.js } satisfies VibeOut };
}

/** Teacher app builder: html/css/js/data + blocks, stitched into one self-contained HTML document. */
export async function vibeApp(user: CurrentUser, instruction: string, files: ProjectFiles, refId: string, error?: string) {
  const en = user.language === "en";
  const res = await runStructured({
    user,
    source: "create",
    refId,
    input: error ? `${instruction}\n${error.slice(0, 500)}` : instruction,
    system: [
      "You build small classroom mini-apps for a teacher. Files: index.html (markup), style.css, script.js, data.json (+ optional blocks). They are stitched into ONE page that runs in a sandboxed iframe.",
      ...SANDBOX_RULES,
      "Keep it simple, friendly and readable for students; Traditional Chinese (Hong Kong) UI text unless the teacher writes in English.",
    ].join("\n"),
    prompt: `${dump(files, 30_000)}\n\nTeacher request: ${instruction}${error ? fixPrompt(error, en) : ""}`,
    normalize: normalize(files, "html"),
    mock: () => (error ? mockFix(files, error, en) : mockProject(instruction, files, true)),
  });
  if (!res.ok) return res;
  const { reply, ...next } = res.value;
  return { ...res, value: { reply, files: next, code: stitch(next) } satisfies VibeOut };
}
