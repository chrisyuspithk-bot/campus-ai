import "server-only";
import fs from "node:fs";
import path from "node:path";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { ScanBatchStatus, ScanMatch } from "@/lib/db/schema";
import { UPLOADS_DIR } from "@/lib/paths";
import { newId } from "@/lib/ids";
import { canManageClass, getClass, listMembers } from "@/lib/p3/classes";
import { getAssignment, paperQuestions, type Assignment } from "@/lib/p3/exam";
import { maxOf } from "@/lib/p4/grading";
import { parseNumbered, parseQr } from "./qr";

export type ScanBatch = typeof schema.scanBatches.$inferSelect;
export type ScanPage = typeof schema.scanPages.$inferSelect;

/** Mock OCR speed: per page, so the progress bar is visible in the demo. */
const OCR_MS_PER_PAGE = 600;
export const MAX_SCAN_BYTES = 25 * 1024 * 1024;

export function scanDir(batchId: string) {
  return path.join(UPLOADS_DIR, "scans", batchId);
}

export function pagePath(p: Pick<ScanPage, "batchId" | "id">) {
  return path.join(scanDir(p.batchId), `${p.id}.jpg`);
}

export function getBatch(id: string) {
  return db.select().from(schema.scanBatches).where(eq(schema.scanBatches.id, id)).get();
}

export function batchPages(batchId: string) {
  return db.select().from(schema.scanPages).where(eq(schema.scanPages.batchId, batchId)).orderBy(asc(schema.scanPages.seq)).all();
}

/** Owner teacher, the linked class's teacher, or an admin. */
export function canManageBatch(user: { id: string; role: string }, b: ScanBatch | undefined): b is ScanBatch {
  if (!b) return false;
  if (user.role === "admin" || b.teacherId === user.id) return true;
  const a = b.assignmentId ? getAssignment(b.assignmentId) : undefined;
  return !!a && canManageClass(user, getClass(a.classId));
}

export function batchAssignment(b: ScanBatch) {
  return b.assignmentId ? getAssignment(b.assignmentId) : undefined;
}

/** Students the pages can be matched to: the linked assignment's class roster. */
export function batchRoster(b: ScanBatch) {
  const a = batchAssignment(b);
  return a ? listMembers(a.classId) : [];
}

export type BatchSummary = ScanBatch & { pages: number; matched: number; failed: number; students: number; assignmentTitle: string | null; className: string | null };

export function summarize(b: ScanBatch, pages: ScanPage[] = batchPages(b.id)): BatchSummary {
  const a = batchAssignment(b);
  const c = a ? getClass(a.classId) : undefined;
  const matched = pages.filter((p) => p.studentId).length;
  return {
    ...b,
    pages: pages.length,
    matched,
    failed: pages.length - matched,
    students: new Set(pages.map((p) => p.studentId).filter(Boolean)).size,
    assignmentTitle: a?.title ?? null,
    className: c ? `${c.name} ${c.subject}` : null,
  };
}

export function listBatches(user: { id: string; role: string }) {
  const rows = db
    .select()
    .from(schema.scanBatches)
    .where(user.role === "admin" ? undefined : eq(schema.scanBatches.teacherId, user.id))
    .orderBy(desc(schema.scanBatches.createdAt))
    .all();
  return rows.map((b) => summarize(b));
}

/** Teacher's paper-based assignments a batch can be linked to (needs a paper so pages map to questions). */
export function linkableAssignments(user: { id: string; role: string }) {
  const classIds = db
    .select({ id: schema.classes.id })
    .from(schema.classes)
    .where(user.role === "admin" ? undefined : eq(schema.classes.teacherId, user.id))
    .all()
    .map((c) => c.id);
  if (!classIds.length) return [];
  return db
    .select({ id: schema.assignments.id, title: schema.assignments.title, className: schema.classes.name, subject: schema.classes.subject, paperId: schema.assignments.paperId })
    .from(schema.assignments)
    .innerJoin(schema.classes, eq(schema.classes.id, schema.assignments.classId))
    .where(inArray(schema.assignments.classId, classIds))
    .orderBy(desc(schema.assignments.dueAt))
    .all()
    .filter((a) => a.paperId);
}

export function createBatch(teacherId: string, input: { title: string; assignmentId: string | null; pagesPerStudent: number }) {
  const id = newId();
  db.insert(schema.scanBatches)
    .values({ id, teacherId, assignmentId: input.assignmentId, title: input.title.slice(0, 120) || "掃描批次", pagesPerStudent: Math.max(1, Math.min(8, input.pagesPerStudent || 2)) })
    .run();
  return id;
}

export function setBatchStatus(id: string, status: ScanBatchStatus, extra: Partial<ScanBatch> = {}) {
  db.update(schema.scanBatches).set({ ...extra, status, updatedAt: new Date() }).where(eq(schema.scanBatches.id, id)).run();
}

// ---- Upload -------------------------------------------------------------------------------------

/** Split a PDF into page images (server-side render). */
async function pdfPages(buf: Buffer): Promise<Buffer[]> {
  const { getDocumentProxy, renderPageAsImage } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(buf));
  const out: Buffer[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 60); i++) {
    const png = await renderPageAsImage(doc, i, { canvasImport: () => import("@napi-rs/canvas"), scale: 2 });
    out.push(Buffer.from(png));
  }
  return out;
}

/** Look for a QR code: the whole page first, then the top band where the printed header puts it. */
async function decodeQr(img: Buffer): Promise<string | null> {
  const sharp = (await import("sharp")).default;
  const jsQR = (await import("jsqr")).default;
  const meta = await sharp(img).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const tries: { left: number; top: number; width: number; height: number }[] = [
    { left: 0, top: 0, width: w, height: h },
    { left: Math.floor(w / 2), top: 0, width: w - Math.floor(w / 2), height: Math.floor(h * 0.3) },
  ];
  for (const r of tries) {
    if (r.width < 40 || r.height < 40) continue;
    const { data, info } = await sharp(img).extract(r).resize({ width: Math.min(r.width, 1200), withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const hit = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height);
    if (hit?.data) return hit.data;
  }
  return null;
}

/** Normalise a page to an upright JPEG (EXIF rotation, max 1600 px wide). */
async function normalise(img: Buffer) {
  const sharp = (await import("sharp")).default;
  const out = await sharp(img).rotate().flatten({ background: "#ffffff" }).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer({ resolveWithObject: true });
  return { buf: out.data, width: out.info.width, height: out.info.height };
}

type Roster = ReturnType<typeof batchRoster>;

/** First-pass match for a page: QR payload, else a username in the file name. */
function matchFor(qr: string | null, filename: string, roster: Roster, paperId: string | null, pageHint = 1): { studentId: string | null; pageNo: number; match: ScanMatch } {
  const p = parseQr(qr);
  if (p && (!paperId || p.paperId === paperId)) {
    const s = roster.find((r) => r.username === p.username);
    if (s) return { studentId: s.id, pageNo: p.page, match: "qr" };
  }
  const base = filename.toLowerCase();
  const s = roster.find((r) => new RegExp(`(^|[^a-z0-9])${r.username.toLowerCase()}([^a-z0-9]|$)`).test(base));
  if (s) {
    const pg = base.match(/(?:p|page|頁)[-_ ]?(\d{1,2})/);
    return { studentId: s.id, pageNo: pg ? Number(pg[1]) : pageHint, match: "name" };
  }
  return { studentId: null, pageNo: 1, match: "failed" };
}

/** Store an uploaded photo / PDF as one or more pages and try to match each to a student. */
export async function addUpload(b: ScanBatch, file: { name: string; type: string; buf: Buffer }) {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const images = isPdf ? await pdfPages(file.buf) : [file.buf];
  const roster = batchRoster(b);
  const paperId = batchAssignment(b)?.paperId ?? null;
  fs.mkdirSync(scanDir(b.id), { recursive: true });
  let seq = (db.select({ seq: schema.scanPages.seq }).from(schema.scanPages).where(eq(schema.scanPages.batchId, b.id)).orderBy(desc(schema.scanPages.seq)).get()?.seq ?? 0) + 1;
  const ids: string[] = [];
  for (const [i, raw] of images.entries()) {
    const { buf, width, height } = await normalise(raw);
    const qr = await decodeQr(buf).catch(() => null);
    const name = isPdf ? `${file.name}#${i + 1}` : file.name;
    // A PDF named after a student ("s123.pdf") is that student's whole script: page n of the PDF = page n.
    const m = matchFor(qr, isPdf ? file.name : name, roster, paperId, i + 1);
    const id = newId();
    fs.writeFileSync(path.join(scanDir(b.id), `${id}.jpg`), buf);
    db.insert(schema.scanPages).values({ id, batchId: b.id, seq: seq++, filename: name.slice(0, 200), mime: "image/jpeg", width, height, qr, ...m }).run();
    ids.push(id);
  }
  inferByOrder(b);
  db.update(schema.scanBatches).set({ updatedAt: new Date() }).where(eq(schema.scanBatches.id, b.id)).run();
  return ids;
}

/**
 * Page→student by stack order: a page without QR that follows page k of student X (k < pages per student)
 * becomes page k+1 of X. The printed QR is on page 1, so this fills in the rest of each script.
 */
export function inferByOrder(b: ScanBatch) {
  const pages = batchPages(b.id);
  let changed = 0;
  for (let i = 1; i < pages.length; i++) {
    const p = pages[i];
    const prev = pages[i - 1];
    if (p.studentId || !prev.studentId || prev.pageNo >= b.pagesPerStudent) continue;
    p.studentId = prev.studentId;
    p.pageNo = prev.pageNo + 1;
    p.match = "order";
    db.update(schema.scanPages).set({ studentId: p.studentId, pageNo: p.pageNo, match: "order" }).where(eq(schema.scanPages.id, p.id)).run();
    changed++;
  }
  return changed;
}

export function assignPage(pageId: string, studentId: string | null, pageNo: number) {
  db.update(schema.scanPages)
    .set({ studentId, pageNo: Math.max(1, Math.min(20, pageNo || 1)), match: studentId ? "manual" : "failed" })
    .where(eq(schema.scanPages.id, pageId))
    .run();
}

export function deletePage(p: ScanPage) {
  db.delete(schema.scanPages).where(eq(schema.scanPages.id, p.id)).run();
  fs.rmSync(pagePath(p), { force: true });
}

// ---- OCR / split queue (demo) -------------------------------------------------------------------

export function startOcr(b: ScanBatch) {
  db.update(schema.scanPages).set({ ocrDone: false }).where(eq(schema.scanPages.batchId, b.id)).run();
  setBatchStatus(b.id, "ocr", { ocrStartedAt: new Date(), ocrDoneAt: null });
}

/**
 * Advance the mock OCR queue by wall-clock time and finalise when every matched page is done:
 * pages are split per student, recognised answers become the attempt's answers, attempts are queued for grading.
 */
export function tickOcr(b: ScanBatch) {
  const pages = batchPages(b.id).filter((p) => p.studentId);
  if (b.status !== "ocr" || !b.ocrStartedAt) return { done: pages.filter((p) => p.ocrDone).length, total: pages.length, status: b.status };
  const due = Math.min(pages.length, Math.floor((Date.now() - b.ocrStartedAt.getTime()) / OCR_MS_PER_PAGE));
  const todo = pages.filter((p) => !p.ocrDone).slice(0, Math.max(0, due - pages.filter((p) => p.ocrDone).length));
  if (todo.length) db.update(schema.scanPages).set({ ocrDone: true }).where(inArray(schema.scanPages.id, todo.map((p) => p.id))).run();
  const done = pages.filter((p) => p.ocrDone).length + todo.length;
  if (done >= pages.length) {
    finalizeBatch(b);
    return { done, total: pages.length, status: "ready" as const };
  }
  return { done, total: pages.length, status: b.status };
}

/** Recognised text for a student's pages, in page order, merged into question answers (1-based numbering). */
export function answersFromOcr(a: Assignment, pages: Pick<ScanPage, "ocrText" | "pageNo">[]) {
  const qs = paperQuestions(a.paperId);
  const merged = parseNumbered([...pages].sort((x, y) => x.pageNo - y.pageNo).map((p) => p.ocrText).join("\n"));
  const answers: Record<string, string> = {};
  qs.forEach((q, i) => {
    let v = merged.get(i + 1);
    if (v === undefined) return;
    if (q.type === "mc") {
      const k = "ABCDEF".indexOf(v.trim().charAt(0).toUpperCase());
      v = k >= 0 ? String(k) : "";
    }
    answers[q.id] = v;
  });
  return answers;
}

/** Create (or reuse) a submitted attempt per matched student so the scripts appear in the grading queue. */
export function finalizeBatch(b: ScanBatch) {
  const a = batchAssignment(b);
  setBatchStatus(b.id, "ready", { ocrDoneAt: new Date() });
  if (!a) return [];
  const pages = batchPages(b.id).filter((p) => p.studentId);
  const byStudent = new Map<string, ScanPage[]>();
  for (const p of pages) byStudent.set(p.studentId!, [...(byStudent.get(p.studentId!) ?? []), p]);
  const max = maxOf(a);
  const out: string[] = [];
  for (const [studentId, ps] of byStudent) {
    const answers = answersFromOcr(a, ps);
    const existing = db.select().from(schema.attempts).where(and(eq(schema.attempts.assignmentId, a.id), eq(schema.attempts.studentId, studentId))).get();
    if (existing) {
      // Keep a digital submission's answers; fill blanks from the paper script.
      if (existing.status === "submitted") {
        const merged = { ...answers, ...Object.fromEntries(Object.entries(existing.answers).filter(([, v]) => v.trim())) };
        db.update(schema.attempts).set({ answers: merged }).where(eq(schema.attempts.id, existing.id)).run();
      } else {
        db.update(schema.attempts).set({ answers, status: "submitted", submittedAt: b.createdAt, needsMarking: true, maxScore: max }).where(eq(schema.attempts.id, existing.id)).run();
      }
      out.push(existing.id);
      continue;
    }
    const id = newId();
    db.insert(schema.attempts)
      .values({ id, assignmentId: a.id, studentId, status: "submitted", answers, needsMarking: true, maxScore: max, startedAt: b.createdAt, savedAt: b.createdAt, submittedAt: b.createdAt })
      .run();
    out.push(id);
  }
  return out;
}

// ---- Handwriting pages for grading -------------------------------------------------------------

/** Scanned pages of one student's script for an assignment (from batches past matching). */
export function attemptPages(assignmentId: string, studentId: string) {
  return db
    .select({ p: schema.scanPages })
    .from(schema.scanPages)
    .innerJoin(schema.scanBatches, eq(schema.scanBatches.id, schema.scanPages.batchId))
    .where(and(eq(schema.scanBatches.assignmentId, assignmentId), eq(schema.scanPages.studentId, studentId), inArray(schema.scanBatches.status, ["ocr", "ready"])))
    .all()
    .map((r) => r.p)
    .sort((x, y) => x.pageNo - y.pageNo || x.seq - y.seq);
}

/** "assignmentId|studentId" keys that have scanned pages — for the 手寫 badge in the queue. */
export function scannedKeys(assignmentIds: string[]) {
  if (!assignmentIds.length) return new Set<string>();
  return new Set(
    db
      .select({ a: schema.scanBatches.assignmentId, s: schema.scanPages.studentId })
      .from(schema.scanPages)
      .innerJoin(schema.scanBatches, eq(schema.scanBatches.id, schema.scanPages.batchId))
      .where(and(inArray(schema.scanBatches.assignmentId, assignmentIds), inArray(schema.scanBatches.status, ["ocr", "ready"])))
      .all()
      .map((r) => `${r.a}|${r.s}`),
  );
}
