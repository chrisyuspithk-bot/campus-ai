// Client helpers shared by the P2 tools (studio, library, create lab).
import { withBase } from "@/lib/base-path";
import type { DictKey } from "@/lib/i18n/dict";

const ERRORS: Record<string, DictKey> = {
  quota: "p2.err.quota",
  blocked: "p2.err.blocked",
  no_model: "p2.err.no_model",
  feature_off: "p2.err.feature_off",
  exam_locked: "p3.err.examLocked",
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: DictKey };

/** POST/PATCH/DELETE JSON to an app API route (basePath added) and map known errors to dict keys. */
export async function api<T>(path: string, body?: unknown, method = "POST"): Promise<ApiResult<T>> {
  try {
    const res = await fetch(withBase(path), {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: ERRORS[data.error] ?? "p2.err.generic" };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "p2.err.generic" };
  }
}
