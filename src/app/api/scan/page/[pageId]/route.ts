import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireApiUser } from "@/lib/auth/dal";
import { batchAssignment, canManageBatch, getBatch, pagePath } from "@/lib/p5/scan";
import { studentMarks } from "@/lib/p4/grading";
import { findAttempt } from "@/lib/p3/exam";

/** A scanned page image. Staff who manage the batch; the student themself once marks are released and review is allowed. */
export async function GET(_req: Request, ctx: RouteContext<"/api/scan/page/[pageId]">) {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  const { pageId } = await ctx.params;
  const page = db.select().from(schema.scanPages).where(eq(schema.scanPages.id, pageId)).get();
  const b = page ? getBatch(page.batchId) : undefined;
  if (!page || !b) return Response.json({ error: "not_found" }, { status: 404 });
  let ok = user.role !== "student" && canManageBatch(user, b);
  if (user.role === "student" && page.studentId === user.id) {
    const a = batchAssignment(b);
    const att = a && findAttempt(a.id, user.id);
    ok = !!a && !!att && a.allowReview && studentMarks(a, att).released;
  }
  if (!ok) return Response.json({ error: "not_found" }, { status: 404 });
  try {
    const buf = await fs.readFile(pagePath(page));
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": "image/jpeg", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
}
