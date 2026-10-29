// P8 (V1/V3/V4) multi-file vibe projects. Plain module (no server-only / client-only) so the server actions,
// the browser editors, the seed script and the schema types can all share it.
//
// A project = html + css + js (+ optional data.json for the in-sandbox campus.mock store) + a short list of
// 簡易邏輯編排 blocks that compile to plain JS. Nothing here executes code: stitching just builds strings that
// the browser later runs inside the existing sandboxed iframe / worker.

export type BlockAction =
  | { type: "setText"; target: string; text: string }
  | { type: "count"; target: string; by: number }
  | { type: "toggle"; target: string }
  | { type: "random"; target: string; options: string }
  | { type: "color"; target: string; color: string }
  | { type: "save"; from: string; key: string; target: string };

/** One rule: WHEN (button clicked / page opens) → DO actions. 2 triggers + 6 actions = 8 block types. */
export type BlockRule = { on: "click" | "load"; source: string; actions: BlockAction[] };

export type ProjectFiles = { html: string; css: string; js: string; data: string; blocks: BlockRule[] };

export const ACTION_TYPES = ["setText", "count", "toggle", "random", "color", "save"] as const;
export const MAX_RULES = 20;
export const MAX_ACTIONS = 10;
export const FILE_CAPS = { html: 60_000, css: 30_000, js: 50_000, data: 20_000 } as const;

export const emptyFiles = (js = ""): ProjectFiles => ({ html: "", css: "", js, data: "", blocks: [] });

/** Web mode = there is a page to render; otherwise the project is a console program (worker, no DOM). */
export const isWeb = (f: ProjectFiles) => f.html.trim().length > 0 || f.blocks.length > 0;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const safeId = (v: unknown) => str(v, 40).replace(/[^A-Za-z0-9_-]/g, "");
const safeColor = (v: unknown) => (/^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20})$/.test(String(v ?? "").trim()) ? String(v).trim() : "#2563eb");

function normalizeAction(raw: unknown): BlockAction | null {
  const a = raw as Record<string, unknown>;
  const target = safeId(a?.target);
  switch (a?.type) {
    case "setText": return target ? { type: "setText", target, text: str(a.text, 300) } : null;
    case "count": { const by = Number(a.by); return target ? { type: "count", target, by: Number.isFinite(by) ? Math.max(-1000, Math.min(1000, Math.trunc(by))) || 1 : 1 } : null; }
    case "toggle": return target ? { type: "toggle", target } : null;
    case "random": return target ? { type: "random", target, options: str(a.options, 600) } : null;
    case "color": return target ? { type: "color", target, color: safeColor(a.color) } : null;
    case "save": { const key = str(a.key, 40).replace(/[^\w㐀-鿿-]/g, "") || "list"; return target ? { type: "save", from: safeId(a.from), key, target } : null; }
    default: return null;
  }
}

export function normalizeBlocks(raw: unknown): BlockRule[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_RULES).flatMap((r) => {
    const o = r as Record<string, unknown>;
    const on = o?.on === "load" ? "load" : "click";
    const source = safeId(o?.source);
    if (on === "click" && !source) return [];
    const actions = (Array.isArray(o?.actions) ? o.actions : []).slice(0, MAX_ACTIONS).map(normalizeAction).filter((x): x is BlockAction => !!x);
    return [{ on, source: on === "load" ? "" : source, actions }];
  });
}

/** Validate anything (DB JSON, client payload, model output) into ProjectFiles, with size caps. */
export function normalizeFiles(raw: unknown, fallbackJs = ""): ProjectFiles {
  const o = (raw ?? {}) as Record<string, unknown>;
  if (typeof raw !== "object" || raw === null) return emptyFiles(fallbackJs.slice(0, FILE_CAPS.js));
  return {
    html: str(o.html, FILE_CAPS.html),
    css: str(o.css, FILE_CAPS.css),
    js: typeof o.js === "string" ? o.js.slice(0, FILE_CAPS.js) : fallbackJs.slice(0, FILE_CAPS.js),
    data: str(o.data, FILE_CAPS.data),
    blocks: normalizeBlocks(o.blocks),
  };
}

/** Legacy single-file app → files: pull the first inline <style> and the last inline <script> out of the HTML. */
export function splitHtml(html: string): ProjectFiles {
  let rest = html;
  let css = "";
  let js = "";
  const style = rest.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  if (style) {
    css = style[1].replace(/^\n|\s+$/g, "");
    rest = rest.replace(style[0], "");
  }
  const scripts = [...rest.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type=["']?application\/json)[^>]*>([\s\S]*?)<\/script>/gi)];
  const last = scripts.at(-1);
  if (last) {
    js = last[1].replace(/^\n|\s+$/g, "");
    rest = rest.slice(0, last.index) + rest.slice(last.index! + last[0].length);
  }
  return { html: rest.replace(/\n{3,}/g, "\n\n"), css, js, data: "", blocks: [] };
}

// ---- blocks → JS -------------------------------------------------------------------------------------

/** JSON literal that is also safe inside an inline <script>. */
const lit = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

function actionJs(a: BlockAction): string {
  const el = `$(${lit(a.target)})`;
  switch (a.type) {
    case "setText": return `    { const el = ${el}; if (el) el.textContent = ${lit(a.text)}; }`;
    case "count": return `    { const el = ${el}; const k = ${lit(a.target)}; counters[k] = (counters[k] ?? (parseFloat(el?.textContent ?? "") || 0)) + ${a.by}; if (el) el.textContent = counters[k]; }`;
    case "toggle": return `    { const el = ${el}; if (el) el.hidden = !el.hidden; }`;
    case "random": {
      const opts = a.options.split(/[\n,，、]/).map((s) => s.trim()).filter(Boolean);
      return `    { const el = ${el}; const opts = ${lit(opts.length ? opts : ["1", "2", "3", "4", "5", "6"])}; if (el) el.textContent = opts[Math.floor(Math.random() * opts.length)]; }`;
    }
    case "color": return `    { const el = ${el}; if (el) el.style.color = ${lit(a.color)}; }`;
    case "save": return `    { const src = $(${lit(a.from)}); const v = String(src?.value ?? src?.textContent ?? "").trim(); if (v) { campus.mock.push(${lit(a.key)}, v); if (src && "value" in src) src.value = ""; } const el = ${el}; if (el) el.textContent = campus.mock.get(${lit(a.key)}, []).join("、"); }`;
  }
}

export function compileBlocks(blocks: BlockRule[]): string {
  if (!blocks.length) return "";
  const out = ["// ==== 簡易邏輯編排（由積木自動生成；請喺「積木」分頁修改）====", "(() => {", "  const $ = (id) => document.getElementById(id);", "  const counters = {};"];
  blocks.forEach((b, i) => {
    const body = b.actions.map(actionJs).join("\n") || "    // （未加動作）";
    if (b.on === "load") out.push(`  // 規則 ${i + 1}：開始時`, `  (() => {\n${body}\n  })();`);
    else out.push(`  // 規則 ${i + 1}：當撳 #${b.source}`, `  $(${lit(b.source)})?.addEventListener("click", () => {\n${body}\n  });`);
  });
  out.push("})();");
  return out.join("\n");
}

// ---- stitching ---------------------------------------------------------------------------------------

const scriptSafe = (s: string) => s.replace(/<\/script/gi, "<\\/script");
const styleSafe = (s: string) => s.replace(/<\/style/gi, "<\\/style");

/** Combine the files into ONE HTML document (no runtime/CSP — sandboxDoc adds those when it is rendered). */
export function stitch(f: ProjectFiles): string {
  const head = [
    f.css.trim() ? `<style data-file="style.css">\n${styleSafe(f.css)}\n</style>` : "",
    f.data.trim() ? `<script type="application/json" id="campus-mock-data">${scriptSafe(f.data)}</script>` : "",
  ].filter(Boolean).join("\n");
  const blocks = compileBlocks(f.blocks);
  const tail = [
    f.js.trim() ? `<script data-file="script.js">\n${scriptSafe(f.js)}\n</script>` : "",
    blocks ? `<script data-file="blocks.js">\n${scriptSafe(blocks)}\n</script>` : "",
  ].filter(Boolean).join("\n");
  let html = f.html.trim() ? f.html : "<!doctype html>\n<html><head><meta charset=\"utf-8\"></head>\n<body>\n</body></html>";
  if (!/<html[\s>]/i.test(html)) html = `<!doctype html>\n<html><head><meta charset="utf-8"></head>\n<body>\n${html}\n</body></html>`;
  if (head) html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, () => `${head}\n</head>`) : html.replace(/<body[^>]*>/i, (m) => `${head}\n${m}`);
  if (tail) html = /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, () => `${tail}\n</body>`) : `${html}\n${tail}`;
  return html;
}

/** Files for the ZIP export: a static site that also runs offline (campus-mock.js = the same demo data layer). */
export function exportEntries(f: ProjectFiles, title: string, mockRuntime: string): { name: string; content: string }[] {
  const web = isWeb(f);
  const blocks = compileBlocks(f.blocks);
  const out: { name: string; content: string }[] = [];
  if (web) {
    let html = f.html.trim() ? f.html : `<!doctype html>\n<html><head><meta charset="utf-8"><title>${title.replace(/[<&]/g, "")}</title></head>\n<body>\n</body></html>`;
    if (!/<html[\s>]/i.test(html)) html = `<!doctype html>\n<html><head><meta charset="utf-8"></head>\n<body>\n${html}\n</body></html>`;
    const head = [`<script src="campus-mock.js"></script>`, f.css.trim() ? `<link rel="stylesheet" href="style.css">` : ""].filter(Boolean).join("\n");
    const tail = [f.js.trim() ? `<script src="script.js"></script>` : "", blocks ? `<script src="blocks.js"></script>` : ""].filter(Boolean).join("\n");
    html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, () => `${head}\n</head>`) : html.replace(/<body[^>]*>/i, (m) => `${head}\n${m}`);
    if (tail) html = /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, () => `${tail}\n</body>`) : `${html}\n${tail}`;
    out.push({ name: "index.html", content: html });
    out.push({ name: "style.css", content: f.css });
  }
  out.push({ name: "script.js", content: f.js });
  if (blocks) out.push({ name: "blocks.js", content: blocks });
  out.push({ name: "data.json", content: f.data.trim() || "{}" });
  out.push({ name: "campus-mock.js", content: mockRuntime });
  out.push({ name: "project.json", content: JSON.stringify({ title, files: f }, null, 2) });
  out.push({
    name: "README.txt",
    content: [
      `${title} — Campus AI 導出 / export`,
      "",
      web ? "打開 index.html 即可喺瀏覽器運行。" : "script.js 係一個 console 程式（用 Node.js 或瀏覽器 console 執行）。",
      "campus.mock 係示範用記憶體資料層（重新整理就清空），唔係真實伺服器或資料庫；data.json 係初始資料。",
      "campus.mock is a demo in-memory data layer (cleared on reload) — not a real server or database.",
      "簡易邏輯編排積木已編譯成 blocks.js；project.json 保留原始檔案同積木。",
    ].join("\n"),
  });
  return out;
}
