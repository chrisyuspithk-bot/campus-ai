import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { gradeQuestions, studentMarks } from "@/lib/p4/grading";
import { listWrong } from "@/lib/p4/wrongbook";
import { topicStats } from "@/lib/p4/stats";

export type GapEvidence = { assignmentId: string; assignmentTitle: string; q: number; lost: number; marks: number; tags: string[] };
export type ConceptGap = {
  subject: string;
  topic: string;
  /** Topic accuracy from released marks (null when only wrongbook evidence) */
  pct: number | null;
  /** Teacher concept-defect tags with counts */
  tags: { tag: string; n: number }[];
  wrongOpen: number;
  wrongMastered: number;
  lostMarks: number;
  severity: number;
  level: "high" | "medium" | "low";
  evidence: GapEvidence[];
  /** Practice pool: school-bank MC questions on this topic */
  practice: number;
  tutorSlug: string | null;
};

/**
 * Weak concepts for a student: topics where released marks were lost, the teacher's concept-defect tags
 * on those questions, and open wrongbook items. Sorted by a simple severity score.
 */
export function conceptGaps(studentId: string): ConceptGap[] {
  const acc = new Map<string, ConceptGap>();
  const get = (subject: string, topic: string) => {
    const key = `${subject}|${topic}`;
    let g = acc.get(key);
    if (!g) {
      g = { subject, topic, pct: null, tags: [], wrongOpen: 0, wrongMastered: 0, lostMarks: 0, severity: 0, level: "low", evidence: [], practice: 0, tutorSlug: null };
      acc.set(key, g);
    }
    return g;
  };

  for (const s of topicStats(studentId)) get(s.subject, s.topic).pct = s.pct;

  const rows = db
    .select({ att: schema.attempts, a: schema.assignments, subject: schema.classes.subject })
    .from(schema.attempts)
    .innerJoin(schema.assignments, eq(schema.assignments.id, schema.attempts.assignmentId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.assignments.classId))
    .where(and(eq(schema.attempts.studentId, studentId), eq(schema.attempts.status, "submitted")))
    .all();
  for (const { att, a, subject } of rows) {
    if (!a.paperId) continue;
    const { marks, released } = studentMarks(a, att);
    if (!released) continue;
    gradeQuestions(a).forEach((q, i) => {
      const m = marks[q.id];
      if (m?.score == null || m.score >= q.marks) return;
      const g = get(q.subject || subject, q.topic || "—");
      g.lostMarks += q.marks - m.score;
      for (const tag of m.tags) {
        const t = g.tags.find((x) => x.tag === tag);
        if (t) t.n++;
        else g.tags.push({ tag, n: 1 });
      }
      g.evidence.push({ assignmentId: a.id, assignmentTitle: a.title, q: i + 1, lost: q.marks - m.score, marks: q.marks, tags: m.tags });
    });
  }

  for (const w of listWrong(studentId)) {
    const g = get(w.subject || "—", w.topic || "—");
    if (w.mastered) g.wrongMastered++;
    else g.wrongOpen++;
  }

  const bank = db.select({ subject: schema.questions.subject, topic: schema.questions.topic }).from(schema.questions).where(and(eq(schema.questions.scope, "school"), eq(schema.questions.type, "mc"))).all();
  const tutors = db.select({ subject: schema.tutors.subject, slug: schema.tutors.slug }).from(schema.tutors).where(eq(schema.tutors.status, "published")).all();

  const out: ConceptGap[] = [];
  for (const g of acc.values()) {
    const tagCount = g.tags.reduce((s, t) => s + t.n, 0);
    g.severity = Math.round((g.pct != null ? Math.max(0, 85 - g.pct) : 0) + g.wrongOpen * 12 + tagCount * 8 + g.lostMarks * 2);
    if (g.severity <= 0 && !g.wrongOpen) continue;
    g.level = g.severity >= 45 ? "high" : g.severity >= 20 ? "medium" : "low";
    g.tags.sort((x, y) => y.n - x.n);
    g.practice = bank.filter((b) => b.subject === g.subject && b.topic === g.topic).length;
    g.tutorSlug = tutors.find((t) => t.subject === g.subject)?.slug ?? null;
    out.push(g);
  }
  return out.sort((x, y) => y.severity - x.severity);
}
