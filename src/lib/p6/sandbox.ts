// Client-side sandbox helpers (no server-only). Code never runs on our server:
//  • apps / web pages → <iframe sandbox="allow-scripts"> (opaque origin: no cookies, no same-origin access)
//    + a CSP meta that blocks every network request;
//  • code snippets → a Web Worker started inside such an iframe, with network APIs stubbed out,
//    a hard timeout (the parent removes the iframe, which kills the worker) and an output cap.

import { fileLineMap, instrumentHtml, mockSource, pageRuntime } from "@/lib/p8/runtime";

export const SANDBOX_CSP =
  "default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'";

/**
 * Wrap untrusted HTML with the no-network CSP (inserted at the start of <head>). P8: also injects the page runtime
 * (network stubs, loop guard, campus.mock) and adds loop protection to inline scripts. `bridge` = editor preview:
 * console output / errors / "loaded" are posted to the parent (which must check event.source).
 */
export function sandboxDoc(html: string, opts: { bridge?: boolean } = {}) {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}"><meta charset="utf-8"><script>${pageRuntime(!!opts.bridge)}</script>`;
  const body = instrumentHtml(html);
  const doc = /<head[^>]*>/i.test(body) ? body.replace(/<head[^>]*>/i, (m) => `${m}${meta}`) : `<!doctype html><html><head>${meta}</head><body>${body}</body></html>`;
  return opts.bridge ? doc.replace("__FILEMAP__", () => JSON.stringify(fileLineMap(doc)).replace(/</g, "\\u003c")) : doc;
}

export const RUN_TIMEOUT_MS = 3000;
export const MAX_LINES = 200;

// Runs inside the worker before the student's code. Network/escape APIs are replaced on both the global
// object and the prototype, non-configurable, so they can't be restored. CSP (connect-src 'none') backs this up.
const PRELUDE = `
(() => {
  const blocked = (name) => function () { throw new Error(name + "：沙盒已停用網絡 / network is disabled in the sandbox"); };
  const names = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "Worker", "SharedWorker", "BroadcastChannel", "WebTransport"];
  const targets = [self, Object.getPrototypeOf(self), typeof WorkerGlobalScope !== "undefined" ? WorkerGlobalScope.prototype : null].filter(Boolean);
  for (const n of names) for (const t of targets) { try { Object.defineProperty(t, n, { value: blocked(n), writable: false, configurable: false }); } catch (e) {} }
  let lines = 0;
  const fmt = (v) => { if (typeof v === "string") return v; try { return typeof v === "function" ? String(v) : JSON.stringify(v, (k, x) => typeof x === "bigint" ? x + "n" : x) ?? String(v); } catch (e) { return String(v); } };
  const send = (kind) => (...args) => { if (++lines > ${MAX_LINES}) { if (lines === ${MAX_LINES} + 1) postMessage({ t: "line", kind: "warn", text: "…（輸出太多，已截斷 / output truncated）" }); return; } postMessage({ t: "line", kind, text: args.map(fmt).join(" ").slice(0, 2000) }); };
  const c = { log: send("log"), info: send("log"), debug: send("log"), warn: send("warn"), error: send("error"), table: send("log") };
  Object.defineProperty(self, "console", { value: c, writable: false, configurable: false });
  self.print = c.log;
})();
`;

// P8 (V5): campus.mock in the worker too, seeded from the project's data.json (__SEED__ is filled in per run).
const MOCK = mockSource("__SEED__");

// The iframe page: receives {code, data}, runs it in a worker, forwards lines/done/error to the parent.
const RUNNER = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}"></head><body><script>
addEventListener("message", (e) => {
  const code = String(e.data && e.data.code || "");
  const mock = ${JSON.stringify(MOCK)}.replace("__SEED__", () => JSON.stringify(String(e.data && e.data.data || "")));
  const src = ${JSON.stringify(PRELUDE)} + mock + "\\n(async () => {\\n" + code + "\\n})().then(() => postMessage({ t: 'done' }), (err) => postMessage({ t: 'error', text: String(err && err.stack || err) }));";
  let w;
  try { w = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" }))); }
  catch (err) { parent.postMessage({ t: "error", text: "Worker unavailable: " + err }, "*"); return; }
  w.onmessage = (m) => parent.postMessage(m.data, "*");
  w.onerror = (ev) => { ev.preventDefault(); parent.postMessage({ t: "error", text: ev.message || "Error" }, "*"); };
});
parent.postMessage({ t: "ready" }, "*");
<\/script></body></html>`;

export type RunLine = { kind: "log" | "warn" | "error" | "info"; text: string };
export type RunResult = { status: "ok" | "error" | "timeout"; ms: number; lines: RunLine[] };

/** Run a JavaScript snippet in the sandbox. Resolves after it finishes, throws or times out. */
export function runSandboxed(code: string, onLine?: (l: RunLine) => void, timeoutMs = RUN_TIMEOUT_MS, data = ""): Promise<RunResult> {
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-scripts");
    frame.style.display = "none";
    frame.srcdoc = RUNNER;
    const lines: RunLine[] = [];
    let t0 = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const finish = (status: RunResult["status"]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      removeEventListener("message", onMsg);
      frame.remove(); // kills the worker and anything it scheduled
      resolve({ status, ms: Math.round(performance.now() - (t0 || performance.now())), lines });
    };
    const push = (l: RunLine) => {
      lines.push(l);
      onLine?.(l);
    };
    function onMsg(e: MessageEvent) {
      if (e.source !== frame.contentWindow) return;
      const d = e.data ?? {};
      if (d.t === "ready") {
        t0 = performance.now();
        timer = setTimeout(() => {
          push({ kind: "error", text: `⏱ 超過 ${timeoutMs / 1000} 秒，已停止 / stopped after ${timeoutMs / 1000}s` });
          finish("timeout");
        }, timeoutMs);
        frame.contentWindow?.postMessage({ code, data }, "*");
      } else if (d.t === "line") push({ kind: d.kind, text: String(d.text) });
      else if (d.t === "error") {
        push({ kind: "error", text: String(d.text) });
        finish("error");
      } else if (d.t === "done") setTimeout(() => finish("ok"), 150); // let queued console output arrive
    }
    addEventListener("message", onMsg);
    document.body.appendChild(frame);
    // Safety net if the frame never reports ready.
    setTimeout(() => !t0 && (push({ kind: "error", text: "sandbox failed to start" }), finish("error")), timeoutMs + 3000);
  });
}
