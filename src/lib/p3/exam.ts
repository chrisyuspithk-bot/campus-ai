import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { AttemptAnswers, QuestionType } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { memberIds, studentClassIds } from "./classes";

export type Assignment = typeof schema.assignments.$inferSelect;
export type Attempt = typeof schema.attempts.$inferSelect;
export type Question = typeof schema.questions.$inferSelect;

/** What the attempt page renders. Answers / marking notes are never sent to the student. */
export type ExamQuestion = {
  id: string;
  section: string;
  type: QuestionType;
  stem: string;
  options: string[];
  marks: number;
};

/** Pseudo-question for "upload" assignments (no paper): one free answer + file. */
export const UPLOAD_QID = "_upload";

/** Uploaded file for a question is stored next to the text answer as `answers["<qid>:file"] = "<libraryId>|<filename>"`. */
export function fileKey(qid: string) {
  return `${qid}:file`;
}

export function parseFileAnswer(v: string | undefined) {
  if (!v) return null;
  const i = v.indexOf("|");
  return i > 0 ? { id: v.slice(0, i), name: v.slice(i + 1) } : null;
}

/** Number of questions with a text answer or an uploaded file. */
export function answeredCount(answers: AttemptAnswers) {
  const ids = new Set<string>();
  for (const [k, v] of Object.entries(answers)) if (v.trim()) ids.add(k.replace(/:file$/, ""));
  return ids.size;
}

export function getAssignment(id: string) {
  return db.select().from(schema.assignments).where(eq(schema.assignments.id, id)).get();
}

export function getPaper(id: string | null) {
  return id ? db.select().from(schema.papers).where(eq(schema.papers.id, id)).get() : undefined;
}

/** Paper questions in section order, with section titles. Missing (deleted) questions are skipped. */
export function paperQuestions(paperId: string | null): (Question & { section: string })[] {
  const paper = getPaper(paperId);
  if (!paper) return [];
  const ids = paper.sections.flatMap((s) => s.questionIds);
  if (!ids.length) return [];
  const byId = new Map(db.select().from(schema.questions).where(inArray(schema.questions.id, ids)).all().map((q) => [q.id, q]));
  return paper.sections.flatMap((s) => s.questionIds.map((id) => byId.get(id)).filter((q): q is Question => !!q).map((q) => ({ ...q, section: s.title })));
}

/** Deterministic Fisher–Yates with a string seed, so a student's order is stable across reloads. */
function seededShuffle<T>(arr: T[], seed: string): T[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function examQuestions(a: Assignment, attemptId: string): ExamQuestion[] {
  if (!a.paperId) {
    return [{ id: UPLOAD_QID, section: "", type: "upload", stem: a.instructions || a.title, options: [], marks: 0 }];
  }
  const qs = paperQuestions(a.paperId).map((q) => ({ id: q.id, section: q.section, type: q.type, stem: q.stem, options: q.options, marks: q.marks }));
  return a.shuffle ? seededShuffle(qs, attemptId) : qs;
}

/** Attempt ends at the earlier of the assignment deadline and start + time limit. */
export function attemptDeadline(a: Assignment, att: Pick<Attempt, "startedAt">) {
  const due = a.dueAt.getTime();
  return a.durationMin ? Math.min(due, att.startedAt.getTime() + a.durationMin * 60_000) : due;
}

function norm(s: string) {
  return s.replace(/\s+/g, "").replace(/[，,。.]/g, "").toLowerCase();
}

/** Auto-mark MC and short answers; long/upload need the teacher (P4 grading queue). */
export function markAnswers(a: Assignment, answers: AttemptAnswers) {
  const qs = paperQuestions(a.paperId);
  if (!qs.length) return { score: null, maxScore: null, needsMarking: true, perQuestion: {} as Record<string, boolean | null> };
  let score = 0;
  let max = 0;
  let needsMarking = false;
  const perQuestion: Record<string, boolean | null> = {};
  for (const q of qs) {
    max += q.marks;
    const ans = (answers[q.id] ?? "").trim();
    if (q.type === "mc") {
      const ok = ans !== "" && ans === q.answer;
      perQuestion[q.id] = ok;
      if (ok) score += q.marks;
    } else if (q.type === "short") {
      const ok = ans !== "" && q.answer.split("|").some((acc) => norm(acc) === norm(ans));
      perQuestion[q.id] = ok;
      if (ok) score += q.marks;
    } else {
      perQuestion[q.id] = null;
      if (ans || answers[fileKey(q.id)]) needsMarking = true;
    }
  }
  return { score, maxScore: max, needsMarking, perQuestion };
}

export function submitAttempt(att: Attempt, a: Assignment, auto = false) {
  const m = markAnswers(a, att.answers);
  db.update(schema.attempts)
    .set({ status: "submitted", submittedAt: new Date(), score: m.score, maxScore: m.maxScore, needsMarking: m.needsMarking, autoSubmitted: auto })
    .where(and(eq(schema.attempts.id, att.id), eq(schema.attempts.status, "in_progress")))
    .run();
}

/** Lazily close attempts whose time is up ("逾時自動交"). Returns the fresh row. */
export function settleAttempt(att: Attempt, a: Assignment): Attempt {
  if (att.status === "in_progress" && Date.now() > attemptDeadline(a, att) + 5_000) {
    submitAttempt(att, a, true);
    return db.select().from(schema.attempts).where(eq(schema.attempts.id, att.id)).get()!;
  }
  return att;
}

export function findAttempt(assignmentId: string, studentId: string) {
  return db
    .select()
    .from(schema.attempts)
    .where(and(eq(schema.attempts.assignmentId, assignmentId), eq(schema.attempts.studentId, studentId)))
    .get();
}

export function startAttempt(a: Assignment, studentId: string): Attempt {
  const existing = findAttempt(a.id, studentId);
  if (existing) return settleAttempt(existing, a);
  const row = { id: newId(), assignmentId: a.id, studentId, startedAt: new Date() };
  db.insert(schema.attempts).values(row).onConflictDoNothing().run();
  return findAttempt(a.id, studentId)!;
}

/** Can this student see / do this assignment? */
export function studentCanAccess(a: Assignment | undefined, studentId: string): a is Assignment {
  return !!a && studentClassIds(studentId).includes(a.classId);
}

/**
 * The in-progress, AI-locked attempt a student is sitting right now (if any).
 * While it exists every AI entry point is closed for that student: /ai, the side panel and the P2 tools.
 */
export function activeLockedAttempt(studentId: string) {
  const rows = db
    .select({ att: schema.attempts, a: schema.assignments })
    .from(schema.attempts)
    .innerJoin(schema.assignments, eq(schema.assignments.id, schema.attempts.assignmentId))
    .where(and(eq(schema.attempts.studentId, studentId), eq(schema.attempts.status, "in_progress"), eq(schema.assignments.lockAi, true)))
    .all();
  for (const r of rows) {
    const att = settleAttempt(r.att, r.a);
    if (att.status === "in_progress") return { attempt: att, assignment: r.a };
  }
  return null;
}

export type StudentAssignment = Assignment & {
  className: string;
  subject: string;
  questionCount: number;
  attempt?: Attempt;
  state: "todo" | "in_progress" | "submitted" | "graded" | "missed";
};

export function listStudentAssignments(studentId: string): StudentAssignment[] {
  const classIds = studentClassIds(studentId);
  if (!classIds.length) return [];
  const rows = db
    .select({ a: schema.assignments, className: schema.classes.name, subject: schema.classes.subject })
    .from(schema.assignments)
    .innerJoin(schema.classes, eq(schema.classes.id, schema.assignments.classId))
    .where(inArray(schema.assignments.classId, classIds))
    .orderBy(desc(schema.assignments.dueAt))
    .all();
  return rows.map(({ a, className, subject }) => {
    let attempt = findAttempt(a.id, studentId);
    if (attempt) attempt = settleAttempt(attempt, a);
    const overdue = a.dueAt.getTime() < Date.now() || a.status === "closed";
    const state: StudentAssignment["state"] = !attempt
      ? overdue ? "missed" : "todo"
      : attempt.status === "in_progress"
        ? "in_progress"
        : attempt.needsMarking ? "submitted" : "graded";
    return { ...a, className, subject, questionCount: a.paperId ? paperQuestions(a.paperId).length : 1, attempt, state };
  });
}

/** Per-student rows for the teacher monitor. */
export function monitorRows(a: Assignment) {
  const members = memberIds(a.classId);
  const users = members.length
    ? db.select({ id: schema.users.id, displayName: schema.users.displayName, username: schema.users.username, avatar: schema.users.avatar }).from(schema.users).where(inArray(schema.users.id, members)).all()
    : [];
  const atts = new Map(
    db.select().from(schema.attempts).where(eq(schema.attempts.assignmentId, a.id)).all().map((x) => [x.studentId, settleAttempt(x, a)]),
  );
  const total = a.paperId ? paperQuestions(a.paperId).length : 1;
  return users
    .map((u) => {
      const att = atts.get(u.id);
      return {
        ...u,
        attempt: att,
        answered: att ? answeredCount(att.answers) : 0,
        total,
        deadline: att ? attemptDeadline(a, att) : null,
      };
    })
    .sort((x, y) => x.username.localeCompare(y.username));
}

export function assignmentStats(a: Assignment) {
  const members = memberIds(a.classId).length;
  const atts = db.select().from(schema.attempts).where(eq(schema.attempts.assignmentId, a.id)).all().map((x) => settleAttempt(x, a));
  const submitted = atts.filter((x) => x.status === "submitted");
  const scored = submitted.filter((x) => x.maxScore);
  const avg = scored.length ? Math.round((scored.reduce((s, x) => s + (x.score ?? 0) / (x.maxScore || 1), 0) / scored.length) * 100) : null;
  return { members, submitted: submitted.length, inProgress: atts.filter((x) => x.status === "in_progress").length, avg };
}
