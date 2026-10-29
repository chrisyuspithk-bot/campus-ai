import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { newId } from "@/lib/ids";
import { audit } from "@/lib/audit";
import { studentClassIds } from "@/lib/p3/classes";

// P7 (G11) high-risk auto-report: every HIGH safety case writes an audit row and an in-app notice to all admins,
// plus the class teachers of the student. Notices carry only the masked login id and the category — never the
// student's text or full name (the admin-only detail view in /a/safety keeps that).

export const maskUser = (u: string | null | undefined) => (u ? `${u.slice(0, 1)}***` : "—");

export function notifyHighRisk(c: { id: string; userId: string | null; category: string; source: string; blocked: boolean }) {
  try {
    const u = c.userId ? db.select({ username: schema.users.username, role: schema.users.role }).from(schema.users).where(eq(schema.users.id, c.userId)).get() : undefined;
    const who = maskUser(u?.username);
    audit(null, "safety.auto_high", `${who} · ${c.category}`, `case ${c.id} · ${c.source}${c.blocked ? " · blocked" : ""}`);
    const admins = db.select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.role, "admin"), eq(schema.users.status, "active"))).all().map((r) => r.id);
    const classIds = c.userId && u?.role === "student" ? studentClassIds(c.userId) : [];
    const teachers = classIds.length
      ? [...new Set(db.select({ t: schema.classes.teacherId }).from(schema.classes).where(inArray(schema.classes.id, classIds)).all().map((r) => r.t).filter((x): x is string => Boolean(x)))]
      : [];
    const title = `⚠️ 高風險個案（${c.category}）`;
    const body = `${who} · ${c.source}${c.blocked ? " · 已攔截" : ""}`;
    const rows = [
      ...admins.map((userId) => ({ id: newId(), userId, kind: "safety_high", title, body, href: `/a/safety?status=open&id=${c.id}` })),
      ...teachers.filter((x) => !admins.includes(x)).map((userId) => ({ id: newId(), userId, kind: "safety_high", title, body: `${body} · 請按校本程序跟進`, href: "/t/alerts" })),
    ];
    if (rows.length) db.insert(schema.notifications).values(rows).run();
  } catch (e) {
    console.error("[notify] high-risk notice failed", e); // never break the chat path
  }
}

export function unreadNotices(userId: string, limit = 10) {
  const n = schema.notifications;
  return db.select().from(n).where(and(eq(n.userId, userId), isNull(n.readAt))).orderBy(desc(n.createdAt)).limit(limit).all();
}

export function markNoticesRead(userId: string) {
  db.update(schema.notifications).set({ readAt: new Date() }).where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt))).run();
}
