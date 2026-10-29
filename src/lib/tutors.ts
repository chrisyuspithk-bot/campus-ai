import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/dal";

type TutorRow = typeof schema.tutors.$inferSelect;

/** Subject teachers edit their own tutors or those of their subject; admins edit all. */
export function canEditTutor(user: Pick<CurrentUser, "id" | "role" | "group">, tutor: TutorRow) {
  if (user.role === "admin") return true;
  if (user.role !== "teacher") return false;
  return tutor.ownerId === user.id || (!!user.group && tutor.subject === user.group);
}

export function listTutorsWithFileCounts() {
  const counts = db
    .select({ tutorId: schema.tutorFiles.tutorId, n: sql<number>`count(*)` })
    .from(schema.tutorFiles)
    .where(eq(schema.tutorFiles.status, "ready"))
    .groupBy(schema.tutorFiles.tutorId)
    .all();
  const map = new Map(counts.map((c) => [c.tutorId, c.n]));
  return db
    .select()
    .from(schema.tutors)
    .orderBy(asc(schema.tutors.createdAt))
    .all()
    .map((t) => ({ ...t, fileCount: map.get(t.id) ?? 0 }));
}

export function splitLines(s: string) {
  return s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}
