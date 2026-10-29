import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireApiUser } from "@/lib/auth/dal";
import { canEditTutor } from "@/lib/tutors";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/tutor-files/[id]">) {
  const user = await requireApiUser(["teacher", "admin"]);
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const file = db.select().from(schema.tutorFiles).where(eq(schema.tutorFiles.id, id)).get();
  const tutor = file && db.select().from(schema.tutors).where(eq(schema.tutors.id, file.tutorId)).get();
  if (!file || !tutor || !canEditTutor(user, tutor)) return Response.json({ error: "not_found" }, { status: 404 });
  db.delete(schema.tutorFiles).where(eq(schema.tutorFiles.id, id)).run();
  return Response.json({ ok: true });
}
