import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, homeFor, verifySession } from "@/lib/auth/session";
import { publicUrl } from "@/lib/app-url";

const PUBLIC = ["/login", "/api/auth/logout"];
const ROLE_PREFIX = { "/s": "student", "/t": "teacher", "/a": "admin" } as const;

/** Absolute, basePath-prefixed redirect. `path` is app-relative (req.nextUrl.pathname has basePath stripped). */
function to(req: NextRequest, path: string) {
  return NextResponse.redirect(publicUrl(path, req.nextUrl.origin));
}

/** Coarse gate: valid JWT + role prefix. The data-access layer re-checks user status on every request. */
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (!session) {
    if (isPublic) return NextResponse.next();
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return to(req, pathname === "/" ? "/login" : `/login?next=${encodeURIComponent(pathname + search)}`);
  }

  if (pathname === "/login" || pathname === "/") {
    return to(req, homeFor(session.role));
  }

  for (const [prefix, role] of Object.entries(ROLE_PREFIX)) {
    if ((pathname === prefix || pathname.startsWith(prefix + "/")) && session.role !== role) {
      return to(req, homeFor(session.role));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|ico|webp|woff2?)$).*)"],
};
