import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export type ClassRow = typeof schema.classes.$inferSelect;

/** Class ids a student belongs to. */
export function studentClassIds(userId: string) {
  return db.select({ id: schema.classMembers.classId }).from(schema.classMembers).where(eq(schema.classMembers.userId, userId)).all().map((r) => r.id);
}

export function memberIds(classId: string) {
  return db.select({ id: schema.classMembers.userId }).from(schema.classMembers).where(eq(schema.classMembers.classId, classId)).all().map((r) => r.id);
}

export function listMembers(classId: string) {
  const u = schema.users;
  return db
    .select({ id: u.id, username: u.username, displayName: u.displayName, avatar: u.avatar, lastLoginAt: u.lastLoginAt, status: u.status })
    .from(schema.classMembers)
    .innerJoin(u, eq(u.id, schema.classMembers.userId))
    .where(eq(schema.classMembers.classId, classId))
    .orderBy(asc(u.username))
    .all();
}

/** Teacher's classes with headline numbers for the cards. Admins see all classes. */
export function listClassesFor(teacherId: string | null) {
  const rows = db
    .select()
    .from(schema.classes)
    .where(teacherId ? eq(schema.classes.teacherId, teacherId) : undefined)
    .orderBy(asc(schema.classes.name), asc(schema.classes.subject))
    .all();
  return rows.map((c) => {
    const members = memberIds(c.id);
    const active = db
      .select()
      .from(schema.assignments)
      .where(and(eq(schema.assignments.classId, c.id), eq(schema.assignments.status, "active")))
      .all()
      .filter((a) => a.dueAt.getTime() > Date.now());
    let missing = 0;
    let inProgress = 0;
    for (const a of active) {
      const att = db.select().from(schema.attempts).where(eq(schema.attempts.assignmentId, a.id)).all();
      missing += members.length - att.filter((x) => x.status === "submitted").length;
      inProgress += att.filter((x) => x.status === "in_progress").length;
    }
    return { ...c, memberCount: members.length, activeCount: active.length, missing, inProgress };
  });
}

export function getClass(id: string) {
  return db.select().from(schema.classes).where(eq(schema.classes.id, id)).get();
}

/** Classes for a student, with teacher names. */
export function listStudentClasses(userId: string) {
  const ids = studentClassIds(userId);
  if (!ids.length) return [];
  const rows = db.select().from(schema.classes).where(inArray(schema.classes.id, ids)).orderBy(asc(schema.classes.subject)).all();
  return rows.map((c) => {
    const teacher = c.teacherId ? db.select({ displayName: schema.users.displayName, avatar: schema.users.avatar }).from(schema.users).where(eq(schema.users.id, c.teacherId)).get() : undefined;
    const recent = db.select().from(schema.assignments).where(eq(schema.assignments.classId, c.id)).orderBy(desc(schema.assignments.dueAt)).limit(3).all();
    return { ...c, teacher, memberCount: memberIds(c.id).length, recent };
  });
}

export function canManageClass(user: { id: string; role: string }, c: ClassRow | undefined): c is ClassRow {
  return !!c && (user.role === "admin" || c.teacherId === user.id);
}
