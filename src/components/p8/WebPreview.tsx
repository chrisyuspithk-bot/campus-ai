"use client";
import { useLayoutEffect, useMemo, useRef } from "react";
import { RUN_TIMEOUT_MS, sandboxDoc, type RunLine, type RunResult } from "@/lib/p6/sandbox";

export type WebRun = { status: RunResult["status"] | "running"; ms: number; lines: RunLine[] };

/**
 * P8 live preview of a stitched multi-file project: the same sandboxed iframe (opaque origin, CSP connect-src
 * 'none') plus the page runtime's console/error bridge. Reports console lines, uncaught errors and loop-guard
 * timeouts; if the page never finishes loading within the time limit it is torn down (status "timeout").
 */
export function WebPreview({ html, runId, onRun, title, testId, className = "" }: {
  html: string;
  runId: number;
  onRun: (r: WebRun) => void;
  title: string;
  testId: string;
  className?: string;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const report = useRef(onRun);
  report.current = onRun;
  const doc = useMemo(() => sandboxDoc(html, { bridge: true }), [html]);

  useLayoutEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    const t0 = performance.now();
    const st: WebRun = { status: "running", ms: 0, lines: [] };
    let loaded = false;
    const emit = () => report.current({ ...st, lines: [...st.lines], ms: Math.round(performance.now() - t0) });
    function onMsg(e: MessageEvent) {
      if (e.source !== frame!.contentWindow || !e.data || e.data.__campus !== 1) return;
      const d = e.data as { t: string; kind?: RunLine["kind"]; text?: string };
      if (d.t === "line") st.lines.push({ kind: d.kind ?? "log", text: String(d.text ?? "") });
      else if (d.t === "error" || d.t === "timeout") {
        st.lines.push({ kind: "error", text: String(d.text ?? "Error") });
        if (st.status !== "timeout") st.status = d.t;
      } else if (d.t === "done") {
        loaded = true;
        if (st.status === "running") st.status = "ok";
      } else return;
      if (st.lines.length > 300) st.lines.splice(0, st.lines.length - 300);
      emit();
    }
    addEventListener("message", onMsg);
    // Watchdog: a page that never reaches "loaded" (e.g. stuck before the loop guard can fire) is removed.
    const dog = setTimeout(() => {
      if (loaded) return;
      st.status = "timeout";
      st.lines.push({ kind: "error", text: `⏱ 超過 ${RUN_TIMEOUT_MS / 1000} 秒仍未載入，已停止 / page did not finish within ${RUN_TIMEOUT_MS / 1000}s` });
      frame.srcdoc = "<!doctype html><meta charset=utf-8><p style='font:14px system-ui;color:#be123c;padding:12px'>⏱ stopped</p>";
      emit();
    }, RUN_TIMEOUT_MS + 1500);
    emit();
    return () => {
      removeEventListener("message", onMsg);
      clearTimeout(dog);
    };
  }, [doc, runId]);

  return <iframe key={runId} ref={ref} sandbox="allow-scripts" srcDoc={doc} title={title} className={`min-h-0 bg-white ${className}`} data-testid={testId} />;
}
