// Public, basePath-aware absolute URLs for server-side redirects.
//
// Why absolute: Next adds basePath to render-time redirect() but NOT to the 303 Location of a
// no-JS (MPA) server-action post, and route handlers resolve relative Locations against the bind
// address (e.g. http://0.0.0.0:3060). An absolute URL is passed through unchanged everywhere.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BASE_PATH } from "./base-path";

/** Origin of APP_URL (e.g. "http://188.245.12.100:3060"); any path in APP_URL is ignored. */
export function configuredOrigin(): string | null {
  try {
    return process.env.APP_URL ? new URL(process.env.APP_URL).origin : null;
  } catch {
    return null;
  }
}

/** Only mark cookies Secure when the public URL is https — browsers drop Secure cookies on plain HTTP. */
export function secureCookies() {
  return configuredOrigin()?.startsWith("https:") ?? false;
}

/** `${origin}${BASE_PATH}${path}`, preferring APP_URL over the request-derived origin. */
export function publicUrl(path: string, requestOrigin: string) {
  return `${configuredOrigin() ?? requestOrigin}${BASE_PATH}${path}`;
}

/** Same as publicUrl() for server components / actions, deriving the fallback origin from request headers. */
export async function absoluteUrl(path: string) {
  if (configuredOrigin()) return publicUrl(path, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return publicUrl(path, `${proto}://${host}`);
}

/** basePath-safe replacement for redirect() — use with app-relative paths like "/s" or "/login". */
export async function appRedirect(path: string): Promise<never> {
  redirect(await absoluteUrl(path));
}
