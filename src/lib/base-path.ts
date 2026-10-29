/** Must match `basePath` in next.config.ts. Next prefixes <Link> automatically, but not fetch(), <a href> or <form action>; server-side redirects should use appRedirect() from app-url.ts. */
export const BASE_PATH = "/campus-ai";

/** Prefix an app-relative URL (e.g. "/api/chat") with the base path for raw fetch/href/action use. */
export function withBase(path: string) {
  return `${BASE_PATH}${path}`;
}
