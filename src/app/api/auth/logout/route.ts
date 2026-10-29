import { NextResponse, type NextRequest } from "next/server";
import { lt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { publicUrl, secureCookies } from "@/lib/app-url";

async function logout(req: NextRequest) {
  // Revoke this session server-side so a copied/replayed cookie stops working too.
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) {
    db.delete(schema.revokedSessions).where(lt(schema.revokedSessions.expiresAt, new Date())).run();
    db.insert(schema.revokedSessions)
      .values({ jti: session.jti, expiresAt: new Date(session.exp * 1000) })
      .onConflictDoNothing()
      .run();
  }

  const reason = req.nextUrl.searchParams.get("reason");
  // Absolute public URL: a relative Location would be resolved against the bind address (0.0.0.0).
  const dest = publicUrl("/login" + (reason ? `?error=${encodeURIComponent(reason)}` : ""), req.nextUrl.origin);
  const res = NextResponse.redirect(dest, 303);
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: secureCookies(), path: "/", maxAge: 0 });
  return res;
}

// GET is used by the data-access layer when a session becomes invalid; POST by logout buttons.
export const GET = logout;
export const POST = logout;
