/* P5 demo data: scan batches for t09 (ready / matching with failures / uploading), handwritten scripts in the grading
 * queue (one graded with pen/stamp annotations), so /t/scan, handwriting mode and /s/progress/gaps have content.
 * Idempotent: runs once per database (marker setting `p5SeedInit`). Needs the P3/P4 seed (class 3A, paper A). */
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as schema from "../src/lib/db/schema";
import { scriptSvg } from "./scan-svg";

type DB = BetterSQLite3Database<typeof schema>;
const id = () => randomUUID().replace(/-/g, "").slice(0, 16);
const ago = (h: number) => new Date(Date.now() - h * 3_600_000);

type Script = { mc: string[]; short: [string, string]; long: string[] };
const LONG = {
  high: ["8. (a) x²+5x+6 = (x+2)(x+3)", "(b) 長 = x+3 米", "(c) x = 4：闊 6 米，長 7 米", "周界 = 2(6+7) = 26 米"],
  mid: ["8. (a) (x+2)(x+3)", "(b) 長係 x+3", "(c) 闊 6，長 7", "周界 = 6+7 = 13 米"],
  low: ["8. (a) (x+1)(x+6)", "(b) x+6"],
};
const SCRIPTS: Record<string, Script> = {
  s123: { mc: ["A", "B", "C", "A", "B"], short: ["(x+2)(x+3)", "k = -7"], long: LONG.mid },
  s125: { mc: ["A", "B", "B", "A", "A"], short: ["(x+2)(x+3)", "k = 7"], long: LONG.mid },
  s127: { mc: ["A", "B", "B", "B", "B"], short: ["(x+3)(x+2)", "7"], long: LONG.high },
  s129: { mc: ["A", "B", "B", "A", "B"], short: ["(x+2)(x+3)", "k = 7"], long: LONG.high },
  s124: { mc: ["B", "A", "C", "A", "A"], short: ["(x+1)(x+6)", "12"], long: LONG.low },
  s126: { mc: ["A", "B", "B", "A", "A"], short: ["(x+2)(x+3)", "7"], long: LONG.mid },
  s128: { mc: ["A", "B", "B", "A", "B"], short: ["(x+2)(x+3)", "7"], long: LONG.high },
  s130: { mc: ["A", "A", "B", "A", "B"], short: ["(x+2)(x+3)", "7"], long: LONG.mid },
};
const page1Lines = (s: Script) => [...s.mc.map((x, i) => `${i + 1}. ${x}`), `6. ${s.short[0]}`, `7. ${s.short[1]}`];

export function seedP5(db: DB, dbPath: string) {
  if (db.select().from(schema.settings).where(eq(schema.settings.key, "p5SeedInit")).get()) return;
  const t09 = db.select().from(schema.users).where(eq(schema.users.username, "t09")).get();
  const paper = db.select().from(schema.papers).where(eq(schema.papers.title, "中三數學測驗 A：因式分解")).get();
  const c3A = t09 && db.select().from(schema.classes).where(and(eq(schema.classes.teacherId, t09.id), eq(schema.classes.name, "3A"), eq(schema.classes.subject, "數學"))).get();
  if (!t09 || !paper || !c3A) {
    console.log("• P5 seed skipped (P3 demo data missing)");
    return;
  }
  const school = db.select().from(schema.settings).where(eq(schema.settings.key, "schoolName")).get()?.value ?? "Campus AI 示範中學";
  const members = db.select({ id: schema.classMembers.userId }).from(schema.classMembers).where(eq(schema.classMembers.classId, c3A.id)).all().map((m) => m.id);
  const students = new Map(db.select().from(schema.users).where(inArray(schema.users.id, members)).all().map((u) => [u.username, u]));
  const qids = paper.sections.flatMap((s) => s.questionIds);
  const qById = new Map(db.select().from(schema.questions).where(inArray(schema.questions.id, qids)).all().map((q) => [q.id, q]));
  const qs = qids.map((q) => qById.get(q)!).filter(Boolean);
  const maxScore = qs.reduce((s, q) => s + q.marks, 0);

  // ---- The paper test the scans belong to ------------------------------------------------------
  const aid = id();
  const title = "因式分解紙本測驗（掃描）";
  db.insert(schema.assignments).values({
    id: aid, teacherId: t09.id, classId: c3A.id, paperId: paper.id, title, kind: "quiz",
    instructions: "紙本測驗：用印有 QR 嘅試卷作答，交卷後老師掃描上載批改。", dueAt: ago(30), durationMin: 45, lockAi: false, shuffle: false, allowReview: true, status: "closed", createdAt: ago(24 * 3),
  }).run();

  const scansRoot = path.join(path.dirname(dbPath), "uploads", "scans");
  const jobs: { svg: string; out: string; width: number }[] = [];
  const pageRows: (typeof schema.scanPages.$inferInsert)[] = [];
  const qr = (u: string, pg: number) => `CAI1:${paper.id}:${u}:${pg}`;

  function addPage(batchId: string, seq: number, spec: Parameters<typeof scriptSvg>[0], row: Partial<typeof schema.scanPages.$inferInsert>, filename: string, ocrText: string) {
    const pid = id();
    fs.mkdirSync(path.join(scansRoot, batchId), { recursive: true });
    jobs.push({ svg: scriptSvg(spec), out: path.join(scansRoot, batchId, `${pid}.jpg`), width: 1240 });
    pageRows.push({ id: pid, batchId, seq, filename, mime: "image/jpeg", qr: spec.qr ?? null, ocrText, match: "failed", pageNo: 1, ...row });
    return pid;
  }
  const printed1 = ["一、選擇題（第 1–5 題）　二、短答題（第 6–7 題）"];
  const printed2 = ["三、長答題：第 8 題（花園面積 x² + 5x + 6 平方米）"];
  const scriptPages = (batchId: string, seq: number, u: string, opts: { qr1?: boolean; smudge?: boolean; match1?: schema.ScanMatch; match2?: schema.ScanMatch; matched?: boolean; ocrDone?: boolean; filename?: string }) => {
    const s = SCRIPTS[u];
    const st = students.get(u)!;
    const l1 = page1Lines(s);
    const matched = opts.matched ?? true;
    const p1 = addPage(batchId, seq, { school, title: paper.title, page: 1, name: st.displayName, qr: opts.qr1 === false ? null : qr(u, 1), lines: l1, printed: printed1, tilt: (seq % 3) - 1, smudge: opts.smudge },
      { studentId: matched ? st.id : null, pageNo: 1, match: matched ? (opts.match1 ?? "qr") : "failed", ocrDone: !!opts.ocrDone }, opts.filename ?? `IMG_${4100 + seq}.jpg`, l1.join("\n"));
    const p2 = addPage(batchId, seq + 1, { school, title: paper.title, page: 2, lines: s.long, printed: printed2, tilt: ((seq + 1) % 3) - 1 },
      { studentId: matched ? st.id : null, pageNo: matched ? 2 : 1, match: matched ? (opts.match2 ?? "order") : "failed", ocrDone: !!opts.ocrDone }, `IMG_${4101 + seq}.jpg`, s.long.join("\n"));
    return [p1, p2];
  };

  // ---- Batch 1: ready (待批) — OCR done, attempts in the grading queue --------------------------
  const b1 = id();
  db.insert(schema.scanBatches).values({ id: b1, teacherId: t09.id, assignmentId: aid, title: "3A 因式分解紙本測驗 · 第一疊", status: "ready", pagesPerStudent: 2, ocrStartedAt: ago(20), ocrDoneAt: ago(20), createdAt: ago(22), updatedAt: ago(20) }).run();
  const readyStudents = ["s123", "s125", "s127", "s129"];
  const pagesOf: Record<string, string[]> = {};
  readyStudents.forEach((u, i) => (pagesOf[u] = scriptPages(b1, i * 2 + 1, u, { ocrDone: true })));

  // ---- Batch 2: matching — mixed QR / order / file-name / failed pages ------------------------
  const b2 = id();
  db.insert(schema.scanBatches).values({ id: b2, teacherId: t09.id, assignmentId: aid, title: "3A 因式分解紙本測驗 · 第二疊", status: "matching", pagesPerStudent: 2, createdAt: ago(3), updatedAt: ago(2) }).run();
  scriptPages(b2, 1, "s124", {});
  scriptPages(b2, 3, "s126", {});
  scriptPages(b2, 5, "s128", { qr1: false, smudge: true, matched: false });
  scriptPages(b2, 7, "s130", { qr1: false, match1: "name", filename: "s130_p1.jpg" });
  addPage(b2, 9, { school, title: paper.title, page: 1, lines: ["草稿", "x² + 5x + 6", "= (x + 2)(x + ?)"], printed: [], tilt: 2 }, {}, "IMG_4199.jpg", "");

  // ---- Batch 3: just created, still uploading -------------------------------------------------
  db.insert(schema.scanBatches).values({ id: id(), teacherId: t09.id, assignmentId: aid, title: "3A 補考 · 上載中", status: "uploading", pagesPerStudent: 2, createdAt: ago(0.2), updatedAt: ago(0.2) }).run();

  // Render the page images (sharp is async; the seed is not).
  const jobFile = path.join(os.tmpdir(), `campus-p5-jobs-${process.pid}.json`);
  fs.writeFileSync(jobFile, JSON.stringify(jobs));
  const sizes = JSON.parse(execFileSync(process.execPath, [path.resolve("scripts/render-svg.mjs"), jobFile], { maxBuffer: 1 << 24 }).toString()) as { width: number; height: number }[];
  fs.rmSync(jobFile, { force: true });
  pageRows.forEach((r, i) => {
    r.width = sizes[i].width;
    r.height = sizes[i].height;
  });
  db.insert(schema.scanPages).values(pageRows).run();

  // ---- Attempts from batch 1 (answers = OCR result) + grades -----------------------------------
  const letter = (v: string) => String("ABCDEF".indexOf(v));
  const norm = (s: string) => s.replace(/\s+/g, "").replace(/^k=/i, "").toLowerCase();
  for (const [ri, u] of readyStudents.entries()) {
    const st = students.get(u)!;
    const s = SCRIPTS[u];
    const answers: Record<string, string> = {};
    const marks: Record<string, schema.QuestionGrade> = {};
    qs.forEach((q, i) => {
      if (q.type === "mc") {
        answers[q.id] = letter(s.mc[i]);
        const ok = answers[q.id] === q.answer;
        marks[q.id] = { ai: ok ? q.marks : 0, aiNote: ok ? "自動評分：正確" : "自動評分：錯誤", ocr: answers[q.id] };
      } else if (q.type === "short") {
        answers[q.id] = s.short[i - 5];
        const ok = q.answer.split("|").some((x) => norm(x) === norm(answers[q.id]));
        marks[q.id] = { ai: ok ? q.marks : 0, aiNote: ok ? "自動評分：正確" : "自動評分：錯誤", ocr: answers[q.id] };
      } else {
        answers[q.id] = s.long.join("\n").replace(/^8\.\s*/, "");
        const tier = s.long === LONG.high ? 6 : s.long === LONG.mid ? 5 : 2;
        marks[q.id] = { ai: tier, aiNote: tier === 6 ? "手寫辨識：涵蓋參考答案要點 6/6" : "手寫辨識：涵蓋要點 5/6；周界未乘 2", ocr: answers[q.id] };
      }
    });
    const attId = id();
    const submittedAt = ago(26 - ri);
    const graded = u === "s125";
    const inProgress = u === "s127";
    if (graded) {
      const long = qs.find((q) => q.type === "long")!;
      marks[long.id] = { ...marks[long.id], score: 4, tags: ["步驟不完整", "計算失誤"], note: "(c) 周界 = 2(長 + 闊)，唔係長 + 闊。" };
      const q5 = qs[4];
      marks[q5.id] = { ...marks[q5.id], tags: ["概念混淆"], note: "a² + 2ab + b² 先寫成 (a+b)²，再用平方差。" };
      for (const q of qs) if (marks[q.id].score === undefined) marks[q.id].score = marks[q.id].ai;
    }
    const total = qs.reduce((n, q) => n + (graded ? (marks[q.id].score ?? 0) : q.type === "mc" || q.type === "short" ? (marks[q.id].ai ?? 0) : 0), 0);
    db.insert(schema.attempts).values({
      id: attId, assignmentId: aid, studentId: st.id, status: "submitted", answers, score: total, maxScore, needsMarking: !graded,
      startedAt: submittedAt, savedAt: submittedAt, submittedAt,
    }).run();
    if (graded || inProgress) {
      const [p1, p2] = pagesOf[u];
      const y = (i: number) => 306 + 62 * i;
      const ink: Record<string, schema.InkItem[]> = graded
        ? {
            [p1]: [
              ...[0, 1, 2, 3, 5, 6].map((i): schema.InkItem => ({ t: "stamp", c: "#dc2626", x: 470, y: y(i) - 12, s: "✓" })),
              { t: "stamp", c: "#dc2626", x: 470, y: y(4) - 12, s: "✗" },
              { t: "text", c: "#dc2626", x: 520, y: y(4) - 30, s: "先寫 (a+b)² 再用平方差" },
              { t: "stamp", c: "#dc2626", x: 900, y: 1320, s: "閱" },
            ],
            [p2]: [
              { t: "pen", c: "#dc2626", w: 4, p: Array.from({ length: 25 }, (_, k) => { const a = (k / 24) * Math.PI * 2; return [Math.round(330 + 200 * Math.cos(a)), Math.round(y(3) - 12 + 38 * Math.sin(a))]; }).flat() },
              { t: "text", c: "#dc2626", x: 560, y: y(3) + 20, s: "周界 = 2(長+闊) = 26 米" },
              { t: "stamp", c: "#dc2626", x: 120, y: y(0) - 12, s: "✓" },
              { t: "text", c: "#16a34a", x: 600, y: 1250, s: "13/17 · 十字相乘做得好！" },
            ],
          }
        : { [p1]: [{ t: "stamp", c: "#2563eb", x: 470, y: y(3) - 12, s: "?" }] };
      db.insert(schema.grades).values({
        attemptId: attId, status: graded ? "done" : "in_progress", marks, ink, aiTotal: Object.values(marks).reduce((n, m) => n + (m.ai ?? 0), 0),
        aiSummary: "（示範）手寫辨識：用掃描 OCR 結果，再按參考答案要點估分。", aiMock: true,
        comment: graded ? "選擇題同短答做得好；長答 (c) 周界要乘 2，Q5 要先睇出完全平方。已喺卷面標示。" : "", gradedBy: t09.id, gradedAt: graded ? ago(18) : null, updatedAt: ago(18),
      }).run();
    }
  }

  // Wrongbook items for s125 from the graded paper script (feeds /s/progress/gaps).
  const s125 = students.get("s125");
  const att125 = s125 && db.select().from(schema.attempts).where(and(eq(schema.attempts.assignmentId, aid), eq(schema.attempts.studentId, s125.id))).get();
  if (s125 && att125) {
    for (const q of [qs[4], qs.find((x) => x.type === "long")!]) {
      db.insert(schema.wrongItems).values({
        id: id(), studentId: s125.id, questionId: q.id, assignmentId: aid, source: "assignment", subject: q.subject || "數學", topic: q.topic,
        type: q.type, stem: q.stem, options: q.options, answer: q.answer, myAnswer: att125.answers[q.id] ?? "", createdAt: ago(17),
      }).run();
    }
  }

  db.insert(schema.settings).values({ key: "p5SeedInit", value: new Date().toISOString() }).run();
  console.log(`• P5 demo data: 3 scan batches (${pageRows.length} pages), 4 handwritten scripts in the grading queue`);
}
