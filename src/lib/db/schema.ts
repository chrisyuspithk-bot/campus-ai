import { sql } from "drizzle-orm";
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
  index,
} from "drizzle-orm/sqlite-core";
import type { DraftType } from "../p7/draft-types";
import type { ProjectFiles } from "../p8/files";
export { DRAFT_TYPES, type DraftType } from "../p7/draft-types";

export type Role = "student" | "teacher" | "admin";
export type Lang = "zh-Hant" | "en";

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  email: text("email"),
  role: text("role").$type<Role>().notNull(),
  /** Class (students) or subject (teachers), e.g. "3A" / "數學" */
  group: text("group_name"),
  status: text("status").$type<"active" | "disabled">().notNull().default("active"),
  language: text("language").$type<Lang>().notNull().default("zh-Hant"),
  avatar: text("avatar").notNull().default("🙂"),
  defaultModelId: text("default_model_id"),
  /** Bumped by "log out all devices" to invalidate existing JWTs. */
  tokenVersion: integer("token_version").notNull().default(0),
  lastLoginAt: integer("last_login_at", { mode: "timestamp_ms" }),
  createdAt: createdAt(),
});

export const models = sqliteTable("models", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  openrouterId: text("openrouter_id").notNull(),
  description: text("description").notNull().default(""),
  /** JSON array of Role */
  roles: text("roles", { mode: "json" }).$type<Role[]>().notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const quotas = sqliteTable("quotas", {
  role: text("role").$type<Role>().primaryKey(),
  dailyTokens: integer("daily_tokens").notNull(),
  monthlyTokens: integer("monthly_tokens").notNull(),
  imagesPerDay: integer("images_per_day").notNull(),
});

export const quotaOverrides = sqliteTable("quota_overrides", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  dailyTokens: integer("daily_tokens").notNull(),
  monthlyTokens: integer("monthly_tokens").notNull(),
  imagesPerDay: integer("images_per_day").notNull(),
  note: text("note").notNull().default(""),
});

export const usage = sqliteTable(
  "usage",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** YYYY-MM-DD (server local time) */
    day: text("day").notNull(),
    tokens: integer("tokens").notNull().default(0),
    requests: integer("requests").notNull().default(0),
    images: integer("images").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

export const features = sqliteTable("features", {
  key: text("key").primaryKey(),
  studentEnabled: integer("student_enabled", { mode: "boolean" }).notNull(),
  teacherEnabled: integer("teacher_enabled", { mode: "boolean" }).notNull(),
  /** Phase in which the module becomes available. Phase > 1 is locked in P1. */
  phase: integer("phase").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const tutors = sqliteTable("tutors", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  nameEn: text("name_en").notNull().default(""),
  subject: text("subject").notNull(),
  emoji: text("emoji").notNull().default("📘"),
  /** JSON array like ["S1","S2"] */
  levels: text("levels", { mode: "json" }).$type<string[]>().notNull(),
  strategy: text("strategy").$type<"strict" | "moderate" | "answers">().notNull().default("strict"),
  tagline: text("tagline").notNull().default(""),
  blurb: text("blurb").notNull().default(""),
  will: text("will").notNull().default(""),
  wont: text("wont").notNull().default(""),
  topics: text("topics").notNull().default(""),
  systemPrompt: text("system_prompt").notNull().default(""),
  /** JSON array of model ids allowed for this tutor; empty = any allowed for role */
  modelWhitelist: text("model_whitelist", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  status: text("status").$type<"draft" | "published">().notNull().default("draft"),
  ownerId: text("owner_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const tutorFiles = sqliteTable("tutor_files", {
  id: text("id").primaryKey(),
  tutorId: text("tutor_id")
    .notNull()
    .references(() => tutors.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  size: integer("size").notNull(),
  status: text("status").$type<"indexing" | "ready" | "unsupported">().notNull(),
  chunkCount: integer("chunk_count").notNull().default(0),
  createdAt: createdAt(),
});

export const tutorChunks = sqliteTable(
  "tutor_chunks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fileId: text("file_id")
      .notNull()
      .references(() => tutorFiles.id, { onDelete: "cascade" }),
    tutorId: text("tutor_id")
      .notNull()
      .references(() => tutors.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
  },
  (t) => [index("tutor_chunks_tutor_idx").on(t.tutorId)],
);

export type ChatTools = { rag: boolean; search: boolean; image: boolean; tts: boolean };

export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    tutorId: text("tutor_id").references(() => tutors.id, { onDelete: "set null" }),
    draftId: text("draft_id"),
    modelId: text("model_id"),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    /** Teacher preview of a tutor — not counted in student history */
    preview: integer("preview", { mode: "boolean" }).notNull().default(false),
    /** Year-end archive: read-only */
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    tools: text("tools", { mode: "json" })
      .$type<ChatTools>()
      .notNull()
      .default(sql`'{"rag":false,"search":false,"image":false,"tts":false}'`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("conversations_user_idx").on(t.userId, t.updatedAt)],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").$type<"user" | "assistant">().notNull(),
    content: text("content").notNull(),
    modelId: text("model_id"),
    tokens: integer("tokens").notNull().default(0),
    feedback: integer("feedback"),
    /** "blocked" when the safety filter replaced the content */
    flag: text("flag"),
    createdAt: createdAt(),
  },
  (t) => [index("messages_conv_idx").on(t.conversationId, t.createdAt)],
);


export const drafts = sqliteTable("drafts", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  /** P7 adds report_card / notice / progress_report (admin & pastoral documents) */
  type: text("type").$type<DraftType>().notNull(),
  subject: text("subject").notNull().default(""),
  content: text("content").notNull().default(""),
  status: text("status").$type<"draft" | "exported" | "archived">().notNull().default("draft"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Lightweight audit events used for admin metrics (blocked messages, quota denials, logins). */
export const events = sqliteTable(
  "events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type").$type<"login" | "blocked" | "quota_denied">().notNull(),
    userId: text("user_id"),
    detail: text("detail").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("events_type_idx").on(t.type, t.createdAt)],
);

/** Session JWT ids (`jti`) revoked by logout, kept until the token would have expired anyway. */
export const revokedSessions = sqliteTable("revoked_sessions", {
  jti: text("jti").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});


// ---- P2 ----------------------------------------------------------------------------------------

export type LibraryKind = "mindmap" | "flashcards" | "quiz" | "youtube" | "worksheet" | "essay" | "create" | "upload";
export type LibrarySource = "studio" | "essay" | "create" | "upload";

/** "My files": studio outputs, essays, shared create-lab projects and plain uploads. */
export const libraryItems = sqliteTable(
  "library_items",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").$type<LibraryKind>().notNull(),
    source: text("source").$type<LibrarySource>().notNull(),
    title: text("title").notNull(),
    folder: text("folder").notNull().default(""),
    /** Structured output (mindmap tree, cards, questions…) as JSON */
    data: text("data", { mode: "json" }).$type<unknown>(),
    /** Extracted plain text (uploads) or source text (studio) — used as studio input */
    text: text("text").notNull().default(""),
    /** essay id / create project id */
    refId: text("ref_id"),
    filename: text("filename"),
    mime: text("mime"),
    size: integer("size").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("library_owner_idx").on(t.ownerId, t.updatedAt)],
);

export type RubricScores = { content: number; organisation: number; grammar: number; vocabulary: number };
export type EssayFeedback = {
  grade: string;
  scores: RubricScores;
  summary: string;
  highlights: string[];
  improvements: string[];
};
export type EssayStatus = "draft" | "ai_scored" | "submitted" | "returned";

export const essays = sqliteTable(
  "essays",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    subject: text("subject").$type<"chinese" | "english">().notNull().default("chinese"),
    genre: text("genre").notNull().default("narrative"),
    prompt: text("prompt").notNull().default(""),
    wordTarget: integer("word_target").notNull().default(400),
    content: text("content").notNull().default(""),
    status: text("status").$type<EssayStatus>().notNull().default("draft"),
    teacherId: text("teacher_id").references(() => users.id, { onDelete: "set null" }),
    teacherScores: text("teacher_scores", { mode: "json" }).$type<RubricScores>(),
    teacherGrade: text("teacher_grade"),
    teacherComment: text("teacher_comment").notNull().default(""),
    submittedAt: integer("submitted_at", { mode: "timestamp_ms" }),
    returnedAt: integer("returned_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("essays_student_idx").on(t.studentId, t.updatedAt), index("essays_status_idx").on(t.status)],
);

export const essayVersions = sqliteTable(
  "essay_versions",
  {
    id: text("id").primaryKey(),
    essayId: text("essay_id")
      .notNull()
      .references(() => essays.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    content: text("content").notNull(),
    feedback: text("feedback", { mode: "json" }).$type<EssayFeedback>(),
    createdAt: createdAt(),
  },
  (t) => [index("essay_versions_idx").on(t.essayId, t.version)],
);

export type CreateKind = "poster" | "webpage" | "slides" | "code";
export type CreateMessage = { role: "user" | "assistant"; content: string };

export const createProjects = sqliteTable(
  "create_projects",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: text("kind").$type<CreateKind>().notNull().default("poster"),
    html: text("html").notNull().default(""),
    messages: text("messages", { mode: "json" }).$type<CreateMessage[]>().notNull().default(sql`'[]'`),
    /** P8 code projects: html/css/js/data + 簡易邏輯編排 blocks (null = legacy single JS in `html`) */
    files: text("files", { mode: "json" }).$type<ProjectFiles>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("create_owner_idx").on(t.ownerId, t.updatedAt)],
);

export type PolicyCategory = "selfharm" | "bullying" | "sexual" | "cheating" | "violence" | "other";
export type PolicyAction = "block" | "flag";
export type RiskLevel = "high" | "medium" | "low";

export const policyRules = sqliteTable("policy_rules", {
  id: text("id").primaryKey(),
  category: text("category").$type<PolicyCategory>().notNull(),
  /** Keyword (case-insensitive substring) or regular expression */
  pattern: text("pattern").notNull(),
  isRegex: integer("is_regex", { mode: "boolean" }).notNull().default(false),
  action: text("action").$type<PolicyAction>().notNull().default("flag"),
  level: text("level").$type<RiskLevel>().notNull().default("medium"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

export const safetyCases = sqliteTable(
  "safety_cases",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    level: text("level").$type<RiskLevel>().notNull(),
    category: text("category").$type<PolicyCategory>().notNull(),
    /** Where it happened: chat / essay / studio / create / report */
    source: text("source").notNull(),
    /** Matched rule pattern (no user text) */
    matched: text("matched").notNull().default(""),
    /** Conversation excerpt — only shown to admins on the detail view */
    excerpt: text("excerpt").notNull().default(""),
    modelId: text("model_id"),
    blocked: integer("blocked", { mode: "boolean" }).notNull().default(false),
    refId: text("ref_id"),
    status: text("status").$type<"open" | "resolved" | "escalated">().notNull().default("open"),
    note: text("note").notNull().default(""),
    handledBy: text("handled_by"),
    handledAt: integer("handled_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("safety_status_idx").on(t.status, t.createdAt)],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    actorId: text("actor_id"),
    actorName: text("actor_name").notNull().default(""),
    actorRole: text("actor_role").notNull().default(""),
    action: text("action").notNull(),
    target: text("target").notNull().default(""),
    detail: text("detail").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt), index("audit_action_idx").on(t.action)],
);

// ---- P3 ----------------------------------------------------------------------------------------

/** A teaching group, e.g. "3A 數學". Students join via class_members. */
export const classes = sqliteTable("classes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  /** Form level, e.g. "S3" */
  level: text("level").notNull().default(""),
  teacherId: text("teacher_id").references(() => users.id, { onDelete: "set null" }),
  emoji: text("emoji").notNull().default("🏫"),
  createdAt: createdAt(),
});

export const classMembers = sqliteTable(
  "class_members",
  {
    classId: text("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.classId, t.userId] }), index("class_members_user_idx").on(t.userId)],
);

export type QuestionType = "mc" | "short" | "long" | "upload";

export const questions = sqliteTable(
  "questions",
  {
    id: text("id").primaryKey(),
    /** Short display code, e.g. "Q1024" */
    code: text("code").notNull(),
    ownerId: text("owner_id").references(() => users.id, { onDelete: "set null" }),
    /** "school" = shared school bank, "mine" = private to owner */
    scope: text("scope").$type<"school" | "mine">().notNull().default("mine"),
    subject: text("subject").notNull(),
    topic: text("topic").notNull().default(""),
    level: text("level").notNull().default(""),
    difficulty: integer("difficulty").notNull().default(2),
    type: text("type").$type<QuestionType>().notNull(),
    stem: text("stem").notNull(),
    options: text("options", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    /** MC: option index as string ("0".."3"); short: accepted answers separated by "|"; long/upload: marking notes */
    answer: text("answer").notNull().default(""),
    marks: integer("marks").notNull().default(1),
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    /** Source question when this row is an AI variant */
    parentId: text("parent_id"),
    createdAt: createdAt(),
  },
  (t) => [index("questions_subject_idx").on(t.subject, t.topic)],
);

export type PaperSection = { title: string; questionIds: string[] };

export const papers = sqliteTable("papers", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  subject: text("subject").notNull().default(""),
  durationMin: integer("duration_min").notNull().default(45),
  shuffle: integer("shuffle", { mode: "boolean" }).notNull().default(false),
  lockAi: integer("lock_ai", { mode: "boolean" }).notNull().default(true),
  sections: text("sections", { mode: "json" }).$type<PaperSection[]>().notNull().default(sql`'[]'`),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type AssignmentKind = "quiz" | "homework" | "exam";

export const assignments = sqliteTable(
  "assignments",
  {
    id: text("id").primaryKey(),
    teacherId: text("teacher_id").references(() => users.id, { onDelete: "set null" }),
    classId: text("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    /** Null for "upload" assignments (teacher file + free-form submission) */
    paperId: text("paper_id").references(() => papers.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    kind: text("kind").$type<AssignmentKind>().notNull().default("quiz"),
    instructions: text("instructions").notNull().default(""),
    /** Teacher-uploaded worksheet (library item id owned by the teacher) */
    fileId: text("file_id"),
    fileName: text("file_name"),
    dueAt: integer("due_at", { mode: "timestamp_ms" }).notNull(),
    /** Null = untimed */
    durationMin: integer("duration_min"),
    lockAi: integer("lock_ai", { mode: "boolean" }).notNull().default(false),
    shuffle: integer("shuffle", { mode: "boolean" }).notNull().default(false),
    allowReview: integer("allow_review", { mode: "boolean" }).notNull().default(true),
    status: text("status").$type<"active" | "closed">().notNull().default("active"),
    createdAt: createdAt(),
  },
  (t) => [index("assignments_class_idx").on(t.classId, t.dueAt)],
);

export type AttemptAnswers = Record<string, string>;

export const attempts = sqliteTable(
  "attempts",
  {
    id: text("id").primaryKey(),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").$type<"in_progress" | "submitted">().notNull().default("in_progress"),
    answers: text("answers", { mode: "json" }).$type<AttemptAnswers>().notNull().default(sql`'{}'`),
    /** Times the exam window lost focus — logged for the teacher monitor only */
    blurCount: integer("blur_count").notNull().default(0),
    /** Auto-marked score (MC/short); null until submitted */
    score: integer("score"),
    maxScore: integer("max_score"),
    /** True when long/upload answers still need a teacher */
    needsMarking: integer("needs_marking", { mode: "boolean" }).notNull().default(false),
    autoSubmitted: integer("auto_submitted", { mode: "boolean" }).notNull().default(false),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    savedAt: integer("saved_at", { mode: "timestamp_ms" }),
    submittedAt: integer("submitted_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("attempts_assignment_idx").on(t.assignmentId), index("attempts_student_idx").on(t.studentId, t.status)],
);

/** "Don't remind me again" on /t/alerts. `key` identifies the computed alert. */
export const alertDismissals = sqliteTable(
  "alert_dismissals",
  {
    teacherId: text("teacher_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.teacherId, t.key] })],
);

export type CommunityKind = "worksheet" | "paper" | "tutor";

export const communityPosts = sqliteTable(
  "community_posts",
  {
    id: text("id").primaryKey(),
    authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind").$type<CommunityKind>().notNull(),
    subject: text("subject").notNull().default(""),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    /** Snapshot of the shared content (markdown / paper outline / tutor settings) */
    content: text("content").notNull().default(""),
    refId: text("ref_id"),
    status: text("status").$type<"pending" | "approved" | "rejected">().notNull().default("pending"),
    reviewNote: text("review_note").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("community_status_idx").on(t.status, t.createdAt)],
);

export const communityReactions = sqliteTable(
  "community_reactions",
  {
    postId: text("post_id")
      .notNull()
      .references(() => communityPosts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"like" | "save">().notNull(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId, t.kind] })],
);

// ---- P4: grading workbench + wrongbook ------------------------------------------------------

export type GradeStatus = "pending" | "in_progress" | "done";
/** Handwriting annotation on a scanned page. Coordinates are normalised to a 1000-wide page box. */
export type InkItem =
  | { t: "pen"; c: string; w: number; p: number[] }
  | { t: "text"; c: string; x: number; y: number; s: string }
  | { t: "stamp"; c: string; x: number; y: number; s: string };
/** Highlight on a long answer: the quoted text, a note and whether it is a strength or an issue. */
export type Annotation = { quote: string; note: string; kind: "good" | "bad" };
export type QuestionGrade = {
  /** AI / rule-based draft score */
  ai?: number;
  aiNote?: string;
  /** Teacher's final score for the question */
  score?: number;
  note?: string;
  tags?: string[];
  annotations?: Annotation[];
  /** P5: handwriting-recognised text of the scanned answer */
  ocr?: string;
  /** P7: AI / rule-based step breakdown (long + upload items) */
  aiSteps?: StepMark[];
  /** P7: teacher-edited steps; when present the question score is their sum */
  steps?: StepMark[];
};

/** P7 step-level partial credit for one marking point of a long answer. */
export type StepMark = { label: string; ok: boolean; marksAwarded: number; marksMax: number; note?: string };

/** Teacher marking of one attempt (P4 grading queue). Written back to attempts.score when done. */
export const grades = sqliteTable(
  "grades",
  {
    attemptId: text("attempt_id")
      .primaryKey()
      .references(() => attempts.id, { onDelete: "cascade" }),
    status: text("status").$type<GradeStatus>().notNull().default("pending"),
    marks: text("marks", { mode: "json" }).$type<Record<string, QuestionGrade>>().notNull().default(sql`'{}'`),
    aiTotal: integer("ai_total"),
    aiSummary: text("ai_summary").notNull().default(""),
    /** True when the AI draft came from the rule-based fallback rather than a model */
    aiMock: integer("ai_mock", { mode: "boolean" }).notNull().default(true),
    comment: text("comment").notNull().default(""),
    /** P5 handwriting mode: pen / text / stamp layer per scanned page id */
    ink: text("ink", { mode: "json" }).$type<Record<string, InkItem[]>>().notNull().default(sql`'{}'`),
    gradedBy: text("graded_by").references(() => users.id, { onDelete: "set null" }),
    gradedAt: integer("graded_at", { mode: "timestamp_ms" }),
    updatedAt: updatedAt(),
  },
  (t) => [index("grades_status_idx").on(t.status)],
);

export type WrongSource = "assignment" | "practice";

/** Student's wrongbook (錯題簿): a snapshot of the question so it survives bank edits. */
export const wrongItems = sqliteTable(
  "wrong_items",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    questionId: text("question_id").references(() => questions.id, { onDelete: "set null" }),
    assignmentId: text("assignment_id").references(() => assignments.id, { onDelete: "set null" }),
    source: text("source").$type<WrongSource>().notNull().default("assignment"),
    subject: text("subject").notNull().default(""),
    topic: text("topic").notNull().default(""),
    type: text("type").$type<QuestionType>().notNull(),
    stem: text("stem").notNull(),
    options: text("options", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    answer: text("answer").notNull().default(""),
    myAnswer: text("my_answer").notNull().default(""),
    redoCount: integer("redo_count").notNull().default(0),
    redoCorrect: integer("redo_correct").notNull().default(0),
    mastered: integer("mastered", { mode: "boolean" }).notNull().default(false),
    lastRedoAt: integer("last_redo_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("wrong_items_student_idx").on(t.studentId, t.mastered), index("wrong_items_q_idx").on(t.studentId, t.questionId, t.stem)],
);

// ---- P5: scan upload + handwriting --------------------------------------------------------------

export type ScanBatchStatus = "uploading" | "matching" | "ocr" | "ready";
export type ScanMatch = "qr" | "name" | "order" | "manual" | "failed";

/** A stack of paper scripts scanned together (photos / PDF), matched to students and queued for OCR. */
export const scanBatches = sqliteTable(
  "scan_batches",
  {
    id: text("id").primaryKey(),
    teacherId: text("teacher_id").references(() => users.id, { onDelete: "set null" }),
    assignmentId: text("assignment_id").references(() => assignments.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    status: text("status").$type<ScanBatchStatus>().notNull().default("uploading"),
    pagesPerStudent: integer("pages_per_student").notNull().default(2),
    ocrStartedAt: integer("ocr_started_at", { mode: "timestamp_ms" }),
    ocrDoneAt: integer("ocr_done_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("scan_batches_teacher_idx").on(t.teacherId, t.createdAt)],
);

export const scanPages = sqliteTable(
  "scan_pages",
  {
    id: text("id").primaryKey(),
    batchId: text("batch_id")
      .notNull()
      .references(() => scanBatches.id, { onDelete: "cascade" }),
    /** Order in the uploaded stack */
    seq: integer("seq").notNull(),
    filename: text("filename").notNull().default(""),
    mime: text("mime").notNull().default("image/png"),
    width: integer("width").notNull().default(0),
    height: integer("height").notNull().default(0),
    /** Decoded QR payload (CAI1:...) when found */
    qr: text("qr"),
    studentId: text("student_id").references(() => users.id, { onDelete: "set null" }),
    /** Page number within the student's script (1-based) */
    pageNo: integer("page_no").notNull().default(1),
    match: text("match").$type<ScanMatch>().notNull().default("failed"),
    /** Handwriting OCR text (mock / vision) */
    ocrText: text("ocr_text").notNull().default(""),
    ocrDone: integer("ocr_done", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("scan_pages_batch_idx").on(t.batchId, t.seq), index("scan_pages_student_idx").on(t.studentId)],
);

// ---- P6: adaptive practice, explainer videos, teacher-built apps ----------------------------------

export type PracticeStep = { qid: string; level: number; choice: number; correct: boolean; hint?: boolean; at: number };

/** One adaptive practice run on a topic: difficulty (1–3) moves with the student's answers. */
export const practiceSessions = sqliteTable(
  "practice_sessions",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    topic: text("topic").notNull().default(""),
    /** Current difficulty 1..3 */
    level: integer("level").notNull().default(1),
    startLevel: integer("start_level").notNull().default(1),
    /** Question being shown now (null when finished) */
    currentQid: text("current_qid"),
    steps: text("steps", { mode: "json" }).$type<PracticeStep[]>().notNull().default(sql`'[]'`),
    target: integer("target").notNull().default(8),
    status: text("status").$type<"active" | "done">().notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("practice_student_idx").on(t.studentId, t.subject, t.topic, t.updatedAt)],
);

export type VideoScene = { title: string; visual: string; narration: string; seconds: number; emoji?: string };
export type VideoStatus = "script" | "storyboard" | "draft" | "published";

/** Short explainer video made in /t/media: script → storyboard → rendered draft → published to /s/videos. */
export const videos = sqliteTable(
  "videos",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").references(() => users.id, { onDelete: "set null" }),
    subject: text("subject").notNull(),
    topic: text("topic").notNull().default(""),
    level: text("level").notNull().default(""),
    title: text("title").notNull(),
    script: text("script").notNull().default(""),
    scenes: text("scenes", { mode: "json" }).$type<VideoScene[]>().notNull().default(sql`'[]'`),
    keyPoints: text("key_points", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    status: text("status").$type<VideoStatus>().notNull().default("script"),
    /** "mock" (storyboard player) — a real render pipeline would put a file/url here */
    renderInfo: text("render_info").notNull().default(""),
    renderedAt: integer("rendered_at", { mode: "timestamp_ms" }),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("videos_owner_idx").on(t.ownerId, t.updatedAt), index("videos_status_idx").on(t.status, t.subject)],
);

export const videoViews = sqliteTable(
  "video_views",
  {
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    viewedAt: integer("viewed_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.videoId, t.userId] })],
);

export type AppStatus = "draft" | "pending" | "approved" | "rejected";

/** Teacher-built mini app (single HTML file) and its listing in the school app library. */
export const appListings = sqliteTable(
  "app_listings",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").references(() => users.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    emoji: text("emoji").notNull().default("🧩"),
    description: text("description").notNull().default(""),
    subject: text("subject").notNull().default(""),
    audience: text("audience").$type<"all" | "teacher">().notNull().default("all"),
    /** Working copy edited in /t/apps/build/:id */
    html: text("html").notNull().default(""),
    /** P8: source files the working copy is stitched from (null = legacy single HTML in `html`) */
    files: text("files", { mode: "json" }).$type<ProjectFiles>(),
    /** Snapshot that passed review — what the gallery runs */
    publishedHtml: text("published_html").notNull().default(""),
    version: integer("version").notNull().default(0),
    status: text("status").$type<AppStatus>().notNull().default("draft"),
    reviewNote: text("review_note").notNull().default(""),
    submittedAt: integer("submitted_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("apps_status_idx").on(t.status, t.updatedAt), index("apps_owner_idx").on(t.ownerId)],
);

// ---- P7: photo practice + in-app notifications ---------------------------------------------------

/** Student photo-of-a-question practice: vision OCR → guided tutor thread (never the final answer). */
export const photoPractice = sqliteTable(
  "photo_practice",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subject: text("subject").notNull().default("數學"),
    topic: text("topic").notNull().default(""),
    /** Stored under uploads/photo/<id>.jpg ("" when the student typed the question instead) */
    imageFile: text("image_file").notNull().default(""),
    ocrText: text("ocr_text").notNull().default(""),
    reply: text("reply").notNull().default(""),
    conversationId: text("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    mock: integer("mock", { mode: "boolean" }).notNull().default(false),
    inWrongbook: integer("in_wrongbook", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("photo_practice_student_idx").on(t.studentId, t.createdAt)],
);

/** In-app notices (P7: high-risk safety cases → admins / class teachers). */
export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    href: text("href").notNull().default(""),
    readAt: integer("read_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
);
