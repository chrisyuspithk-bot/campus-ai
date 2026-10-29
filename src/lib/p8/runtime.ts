// P8 sandbox runtime pieces (plain strings; nothing here runs in our page):
//  • campus.mock — V5 in-memory "backend" (get/set/push…) seeded from data.json. Memory only, no network,
//    cleared on every run/reload. 示範用記憶體資料層，非真實伺服器.
//  • page runtime — injected by sandboxDoc() right after the CSP meta: stubs network APIs (CSP connect-src 'none'
//    still blocks them), defines the loop guard, campus.mock and, for editor previews, a console/error bridge.
//  • instrumentLoops — CodePen-style loop protection: every for/while/do-while header calls __campusLoop(),
//    which throws once one task has been busy for > 3 s, so an infinite loop in a page can't hang the tab.

export const LOOP_LIMIT_MS = 3000;
export const TIMEOUT_MARK = "⏱";
const TIMEOUT_MSG = `${TIMEOUT_MARK} 迴圈超過 ${LOOP_LIMIT_MS / 1000} 秒，已停止 / loop stopped after ${LOOP_LIMIT_MS / 1000}s`;

/** campus.mock source. `seedExpr` is a JS expression that evaluates (lazily) to the data.json text or null. */
export function mockSource(seedExpr: string) {
  return `(() => {
  let store = null;
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const load = () => {
    if (store) return store;
    store = new Map();
    try { const raw = ${seedExpr}; if (raw && String(raw).trim()) for (const [k, v] of Object.entries(JSON.parse(raw))) store.set(k, v); }
    catch (e) { console.warn("data.json 唔係有效 JSON / data.json is not valid JSON"); }
    return store;
  };
  const mock = Object.freeze({
    get(k, d) { const s = load(); k = String(k); return s.has(k) ? clone(s.get(k)) : d; },
    set(k, v) { load().set(String(k), clone(v)); return clone(v); },
    push(k, v) { const s = load(); k = String(k); const a = Array.isArray(s.get(k)) ? s.get(k) : []; a.push(clone(v)); s.set(k, a); return a.length; },
    remove(k) { return load().delete(String(k)); },
    keys() { return [...load().keys()]; },
    all() { return Object.fromEntries([...load()].map(([k, v]) => [k, clone(v)])); },
    reset() { store = new Map(); },
    note: "示範用記憶體資料層，非真實伺服器 / demo in-memory data layer, not a real server",
  });
  try { Object.defineProperty(self, "campus", { value: Object.freeze({ mock }), writable: false, configurable: false }); } catch (e) {}
})();`;
}

const NETWORK_STUBS = `(() => {
  const blocked = (n) => function () { throw new Error(n + "：沙盒已停用網絡，請改用 campus.mock / network is disabled in the sandbox — use campus.mock"); };
  for (const n of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "WebTransport"]) { try { Object.defineProperty(self, n, { value: blocked(n), writable: false, configurable: false }); } catch (e) {} }
  try { Object.defineProperty(Navigator.prototype, "sendBeacon", { value: blocked("sendBeacon"), writable: false, configurable: false }); } catch (e) {}
})();`;

const LOOP_GUARD = `(() => {
  let t0 = 0;
  Object.defineProperty(self, "__campusLoop", { writable: false, configurable: false, value: () => {
    const n = performance.now();
    if (!t0) { t0 = n; setTimeout(() => { t0 = 0; }, 0); }
    else if (n - t0 > ${LOOP_LIMIT_MS}) { t0 = 0; throw new Error(${JSON.stringify(TIMEOUT_MSG)}); }
  } });
})();`;

// Editor previews only: forward console output, uncaught errors and "loaded" to the parent editor.
// __FILEMAP__ = [[file, firstDocLine, lastDocLine], …] so doc line numbers become script.js line numbers.
const BRIDGE = `(() => {
  const map = __FILEMAP__;
  const post = (m) => { try { parent.postMessage(Object.assign({ __campus: 1 }, m), "*"); } catch (e) {} };
  const where = (ln) => { for (const [f, a, b] of map) if (ln >= a && ln <= b) return " (" + f + " 第 " + (ln - a + 1) + " 行 / line " + (ln - a + 1) + ")"; return ""; };
  const fmt = (v) => { if (typeof v === "string") return v; try { return JSON.stringify(v) ?? String(v); } catch (e) { return String(v); } };
  let lines = 0;
  for (const k of ["log", "info", "debug", "warn", "error", "table"]) {
    const orig = console[k];
    console[k] = (...a) => { if (++lines <= 200) post({ t: "line", kind: k === "warn" || k === "error" ? k : "log", text: a.map(fmt).join(" ").slice(0, 2000) }); try { orig.apply(console, a); } catch (e) {} };
  }
  const kind = (m) => (m.includes(${JSON.stringify(TIMEOUT_MARK)}) ? "timeout" : "error");
  addEventListener("error", (e) => { const m = String(e.message || "Error"); post({ t: kind(m), text: m + where(e.lineno) }); });
  addEventListener("unhandledrejection", (e) => { const r = e.reason; const m = String((r && r.message) || r); post({ t: kind(m), text: "Uncaught (in promise) " + m }); });
  addEventListener("load", () => setTimeout(() => post({ t: "done" }), 30));
})();`;

const oneLine = (s: string) => s.replace(/\n\s*/g, " ");

/** Script injected at the top of every sandboxed page. Single line so document line numbers don't shift. */
export function pageRuntime(bridge: boolean) {
  return oneLine([NETWORK_STUBS, LOOP_GUARD, mockSource('(document.getElementById("campus-mock-data") || {}).textContent'), bridge ? BRIDGE : ""].join(" "));
}

/** campus-mock.js for the ZIP export (data.json baked in so index.html also works from file://). */
export function exportRuntime(data: string) {
  return [
    "// campus.mock — 示範用記憶體資料層，非真實伺服器 / demo in-memory data layer, not a real server.",
    "// 由 Campus AI 導出；重新整理頁面就會清空。Exported from Campus AI; cleared on reload.",
    NETWORK_STUBS,
    LOOP_GUARD,
    mockSource(JSON.stringify(data.trim() || "{}")),
    "",
  ].join("\n");
}

// ---- loop instrumentation -----------------------------------------------------------------------------

const ID = /[A-Za-z0-9_$]/;
const REGEX_PREV = new Set(["", "(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^"]);

/** Index just past the string / template / comment / regex that starts at i, or -1 if none starts there. */
function skipLiteral(src: string, i: number, prev: string): number {
  const c = src[i];
  if (c === "/" && src[i + 1] === "/") { const e = src.indexOf("\n", i); return e < 0 ? src.length : e; }
  if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); return e < 0 ? src.length : e + 2; }
  if (c === '"' || c === "'" || c === "`") {
    let j = i + 1;
    while (j < src.length && src[j] !== c) {
      if (src[j] === "\\") j++;
      else if (c !== "`" && src[j] === "\n") break;
      else if (c === "`" && src[j] === "$" && src[j + 1] === "{") j = skipBalanced(src, j + 1, "{", "}") - 1;
      j++;
    }
    return j + 1;
  }
  if (c === "/" && REGEX_PREV.has(prev)) {
    let j = i + 1;
    let cls = false;
    while (j < src.length && src[j] !== "\n") {
      if (src[j] === "\\") j++;
      else if (src[j] === "[") cls = true;
      else if (src[j] === "]") cls = false;
      else if (src[j] === "/" && !cls) break;
      j++;
    }
    return j + 1;
  }
  return -1;
}

/** From an opening bracket at i, return the index just past its match. */
function skipBalanced(src: string, i: number, open: string, close: string): number {
  let depth = 0;
  let prev = "";
  for (let j = i; j < src.length; ) {
    const k = skipLiteral(src, j, prev);
    if (k >= 0) { j = k; continue; }
    const c = src[j];
    if (c === open) depth++;
    else if (c === close && --depth === 0) return j + 1;
    if (!/\s/.test(c)) prev = c;
    j++;
  }
  return src.length;
}

/** Insert `__campusLoop()` into every for(;;) test and while(...) condition (do-while tails included). */
export function instrumentLoops(src: string): string {
  const inserts: [number, string][] = [];
  let prev = "";
  for (let i = 0; i < src.length; ) {
    const k = skipLiteral(src, i, prev);
    if (k >= 0) { i = k; prev = ")"; continue; }
    if (ID.test(src[i]) && (i === 0 || !ID.test(src[i - 1]))) {
      let j = i;
      while (j < src.length && ID.test(src[j])) j++;
      const word = src.slice(i, j);
      if ((word === "for" || word === "while") && prev !== ".") {
        let p = j;
        while (/\s/.test(src[p] ?? "")) p++;
        if (src[p] === "(") {
          const end = skipBalanced(src, p, "(", ")");
          if (word === "while") inserts.push([p + 1, "__campusLoop(), "]);
          else {
            // Classic for: guard the test (between the two top-level semicolons). for-in / for-of are left alone.
            let depth = 0;
            let pv = "";
            for (let q = p + 1; q < end - 1; ) {
              const s = skipLiteral(src, q, pv);
              if (s >= 0) { q = s; continue; }
              const c = src[q];
              if ("([{".includes(c)) depth++;
              else if (")]}".includes(c)) depth--;
              else if (c === ";" && depth === 0) {
                let r = q + 1;
                while (/\s/.test(src[r] ?? "")) r++;
                inserts.push(src[r] === ";" ? [q + 1, " (__campusLoop(), true)"] : [q + 1, " __campusLoop(), "]);
                break;
              }
              if (!/\s/.test(c)) pv = c;
              q++;
            }
          }
        }
      }
      prev = word === "return" || word === "typeof" || word === "case" ? "(" : "a";
      i = j;
      continue;
    }
    if (!/\s/.test(src[i])) prev = src[i];
    i++;
  }
  let out = src;
  for (const [pos, text] of inserts.sort((a, b) => b[0] - a[0])) out = out.slice(0, pos) + text + out.slice(pos);
  return out;
}

/** True if `code` compiles as a classic script. Compile only — the function is never called. */
function compiles(code: string) {
  try {
    new Function(code);
    return true;
  } catch (e) {
    return !(e instanceof SyntaxError);
  }
}

/** Instrument the loops of every inline classic script in an HTML document. Falls back to the original if needed. */
export function instrumentHtml(html: string): string {
  return html.replace(/(<script(?![^>]*\bsrc=)([^>]*)>)([\s\S]*?)(<\/script>)/gi, (m, open: string, attrs: string, body: string, close: string) => {
    if (/type\s*=\s*["']?(?!text\/javascript|application\/javascript)[^"'\s>]+/i.test(attrs)) return m; // JSON data, modules, templates
    const inst = instrumentLoops(body);
    if (inst === body) return m;
    return open + (compiles(inst) || !compiles(body) ? inst : body) + close;
  });
}

/** [[file, firstDocLine, lastDocLine]] for <script data-file="…"> blocks (doc lines are 1-based). */
export function fileLineMap(doc: string): [string, number, number][] {
  const out: [string, number, number][] = [];
  for (const m of doc.matchAll(/<script data-file="([\w.-]+)">\n([\s\S]*?)\n<\/script>/g)) {
    const tagLine = doc.slice(0, m.index).split("\n").length;
    out.push([m[1], tagLine + 1, tagLine + m[2].split("\n").length]);
  }
  return out;
}
