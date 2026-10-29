import fs from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireApiUser } from "@/lib/auth/dal";
import { libraryFileDir } from "@/lib/library";
import { getAssignment, parseFileAnswer } from "@/lib/p3/exam";
import { getClass, studentClassIds } from "@/lib/p3/classes";

/**
 * Files attached to an assignment: the teacher's worksheet (`?item=` omitted) or a student's uploaded answer.
 * Access: class teacher / admin see everything; students see the worksheet and their own uploads.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/assignments/[id]/file">) {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const a = getAssignment(id);
  if (!a) return Response.json({ error: "not_found" }, { status: 404 });
  const c = getClass(a.classId);
  const isStaff = user.role === "admin" || (user.role === "teacher" && c?.teacherId === user.id);
  const isMember = user.role === "student" && studentClassIds(user.id).includes(a.classId);
  if (!isStaff && !isMember) return Response.json({ error: "forbidden" }, { status: 403 });

  const itemId = new URL(req.url).searchParams.get("item");
  let ownerId: string | null = null;
  let fileId: string | null = null;
  if (!itemId) {
    fileId = a.fileId;
    ownerId = a.teacherId;
  } else {
    // Must be referenced by an attempt of this assignment (and be the student's own, for students).
    const atts = db
      .select()
      .from(schema.attempts)
      .where(isStaff ? eq(schema.attempts.assignmentId, a.id) : and(eq(schema.attempts.assignmentId, a.id), eq(schema.attempts.studentId, user.id)))
      .all();
    const hit = atts.find((x) => Object.entries(x.answers).some(([k, v]) => k.endsWith(":file") && parseFileAnswer(v)?.id === itemId));
    if (hit) {
      fileId = itemId;
      ownerId = hit.studentId;
    }
  }
  if (!fileId || !ownerId) return Response.json({ error: "not_found" }, { status: 404 });
  const item = db.select().from(schema.libraryItems).where(and(eq(schema.libraryItems.id, fileId), eq(schema.libraryItems.ownerId, ownerId))).get();
  if (!item) return Response.json({ error: "not_found" }, { status: 404 });
  try {
    const buf = await fs.readFile(path.join(libraryFileDir(ownerId), item.id));
    const name = encodeURIComponent(item.filename ?? item.title);
    // Same rule as /api/library/:id/file: never serve HTML (or anything scriptable) inline.
    const inline = /^(image\/|application\/pdf|text\/plain)/.test(item.mime ?? "");
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": item.mime ?? "application/octet-stream",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${name}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
}
