import "server-only";
import fs from "node:fs";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/dal";
import { UPLOADS_DIR } from "@/lib/paths";
import { newId } from "@/lib/ids";
import { getSetting } from "@/lib/settings";
import { recordUsage } from "@/lib/quota";
import { gate, parseJsonObject, schoolPreamble } from "@/lib/ai/run";
import { checkSafety, recordSafety } from "@/lib/ai/safety";
import { buildSystemPrompt } from "@/lib/ai/prompts";
import { completeChat, hasOpenRouterKey, type ChatMessage } from "@/lib/ai/openrouter";
import { VISION_MODEL } from "@/lib/p5/handwriting";
import { addWrong } from "@/lib/p4/wrongbook";

// P7 (G2) photo practice: a student photographs a maths question → vision OCR (Qwen VL, the only vision model
// this key allows) → a guided tutor thread that never gives the final answer. Exam lock, quota and the safety gate
// apply (via gate() + a second safety pass on the recognised text).

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export type PhotoPractice = typeof schema.photoPractice.$inferSelect;

export function photoPath(id: string) {
  return path.join(UPLOADS_DIR, "photo", `${id}.jpg`);
}

export function listPhotoPractice(studentId: string, limit = 8) {
  return db.select().from(schema.photoPractice).where(eq(schema.photoPractice.studentId, studentId)).orderBy(desc(schema.photoPractice.createdAt)).limit(limit).all();
}

export function getOwnPhoto(id: string, studentId: string) {
  return db.select().from(schema.photoPractice).where(and(eq(schema.photoPractice.id, id), eq(schema.photoPractice.studentId, studentId))).get();
}

const GUIDE = [
  "This is PHOTO PRACTICE: the student photographed a question (HKDSE-style secondary maths unless stated) and wants help.",
  "NEVER state the final answer or the final numerical result, even if asked. Do not solve the last step.",
  "Structure: 1) restate what the question gives and asks (one line); 2) name the concept / formula needed; 3) give the FIRST step only as a guiding question or hint; 4) ask the student to try and reply with their working.",
  "Use LaTeX ($...$ inline, $$...$$ display). Keep it under 180 words. Reply in Traditional Chinese (Hong Kong written style) unless the question is in English.",
].join("\n");

type Read = { question: string; subject: string; topic: string };

/** Vision OCR of the photo. Returns null on failure so the caller can fall back to typed text / demo. */
async function readPhoto(user: CurrentUser, jpeg: Buffer): Promise<{ read: Read; tokens: number } | null> {
  try {
    const { text, tokens } = await completeChat({
      model: VISION_MODEL,
      json: true,
      messages: [
        {
          role: "system",
          content: [
            schoolPreamble(user),
            "Read the photographed exam/homework question exactly (printed or handwritten). Transcribe the question only — not any student working — keeping maths in LaTeX ($...$).",
            'Respond with one JSON object: {"question":string,"subject":string,"topic":string}. subject in Traditional Chinese (e.g. 數學, 物理); topic a short Traditional Chinese topic name (e.g. 二次方程). If there is no readable question, question = "".',
          ].join("\n"),
        },
        { role: "user", content: [{ type: "text", text: "Photo of the question:" }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpeg.toString("base64")}` } }] },
      ],
    });
    const o = parseJsonObject(text) as Partial<Read> | null;
    if (!o || typeof o.question !== "string") return null;
    return {
      read: { question: o.question.trim().slice(0, 2000), subject: String(o.subject ?? "").slice(0, 20) || "數學", topic: String(o.topic ?? "").slice(0, 30) },
      tokens,
    };
  } catch (e) {
    console.warn("[photo] vision OCR failed:", (e as Error).message);
    return null;
  }
}

function mockGuide(question: string, lang: "zh" | "en") {
  const q = question.replace(/\s+/g, " ").slice(0, 120);
  return lang === "en"
    ? `(**Demo mode** — guided hint, no final answer)\n\n**The question:** ${q}\n\n1. What does the question give you, and what must you find?\n2. Which concept fits? For a quadratic $ax^2+bx+c=0$, think about factorisation or the formula $x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}$.\n3. **First step:** write down $a$, $b$ and $c$. What are they here?\n\nReply with your working and I'll check the next step ✍️`
    : `（**示範模式**：只會引導，唔會直接俾答案）\n\n**題目重點：** ${q}\n\n1. 題目俾咗你咩資料？要你搵咩？\n2. 用邊個概念？例如二次方程 $ax^2+bx+c=0$ 可以試因式分解，或者用公式 $x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}$。\n3. **第一步：** 先寫低 $a$、$b$、$c$ 各係幾多？\n\n你試吓做第一步，將算式打俾我，我再同你核對 ✍️`;
}

export type PhotoResult =
  | { ok: true; id: string; conversationId: string; question: string; reply: string; mock: boolean; subject: string; topic: string }
  | { ok: false; error: "exam_locked" | "quota" | "blocked" | "no_model" | "unreadable" | "no_tutor" };

/** Full photo-practice turn. `jpeg` may be null when the student only typed the question. */
export async function runPhotoPractice(user: CurrentUser, input: { jpeg: Buffer | null; typed: string; subject: string }): Promise<PhotoResult> {
  const g = gate(user, input.typed || "photo practice", "practice");
  if (!g.ok) return g;
  const model = g.model;
  const id = newId();

  let read: Read = { question: input.typed.trim().slice(0, 2000), subject: input.subject || "數學", topic: "" };
  let mock = !hasOpenRouterKey();
  if (input.jpeg) {
    fs.mkdirSync(path.dirname(photoPath(id)), { recursive: true });
    fs.writeFileSync(photoPath(id), input.jpeg);
    const ocr = !mock ? await readPhoto(user, input.jpeg) : null;
    if (ocr?.read.question) {
      read = { question: ocr.read.question, subject: input.subject || ocr.read.subject, topic: ocr.read.topic };
      recordUsage(user.id, ocr.tokens);
    } else if (!read.question) {
      if (!mock) return { ok: false, error: "unreadable" };
      read.question = "（示範模式：未接駁視覺模型）解方程 $x^2 - 5x + 6 = 0$。";
    }
    // else: the vision read failed but the student also typed the question — carry on with the typed text.
  }
  if (!read.question) return { ok: false, error: "unreadable" };

  // Second safety pass on what was actually read from the photo.
  const safety = checkSafety(read.question);
  recordSafety({ userId: user.id, result: safety, source: "practice", text: read.question, modelId: model.id, refId: id });
  if (safety.blocked) return { ok: false, error: "blocked" };

  const t = schema.tutors;
  const tutor =
    db.select().from(t).where(and(eq(t.subject, read.subject), eq(t.status, "published"))).get() ??
    db.select().from(t).where(and(eq(t.slug, "math"), eq(t.status, "published"))).get();
  if (!tutor) return { ok: false, error: "no_tutor" };
  // Photo practice is always guided, whatever the tutor's normal strategy.
  const guidedTutor = { ...tutor, strategy: "strict" as const };

  const lang = /[㐀-鿿]/.test(read.question) || user.language !== "en" ? "zh" : "en";
  const userMsg = lang === "zh" ? `📷 我影咗呢條題目：\n\n${read.question}\n\n請一步步引導我，唔好直接俾答案。` : `📷 I photographed this question:\n\n${read.question}\n\nPlease guide me step by step — don't give me the answer.`;
  let reply = "";
  let tokens = 0;
  if (!mock) {
    const messages: ChatMessage[] = [
      { role: "system", content: `${buildSystemPrompt({ schoolName: getSetting("schoolName"), role: user.role, displayName: user.displayName, tutor: guidedTutor })}\n\n${GUIDE}` },
      { role: "user", content: userMsg },
    ];
    try {
      const r = await completeChat({ model: model.openrouterId, messages });
      reply = r.text.trim();
      tokens = r.tokens;
    } catch (e) {
      console.warn("[photo] guided reply failed:", (e as Error).message);
    }
  }
  if (!reply) {
    mock = true;
    reply = mockGuide(read.question, lang);
    tokens = Math.ceil((userMsg.length + reply.length) / 2) + 300;
  }
  recordUsage(user.id, tokens);

  const conversationId = newId();
  db.insert(schema.conversations)
    .values({ id: conversationId, userId: user.id, title: `📷 ${read.question.replace(/\$|\s+/g, " ").trim().slice(0, 36)}`, tutorId: tutor.id, modelId: model.id, tools: { rag: true, search: false, image: false, tts: false } })
    .run();
  db.insert(schema.messages).values({ id: newId(), conversationId, role: "user", content: userMsg }).run();
  db.insert(schema.messages).values({ id: newId(), conversationId, role: "assistant", content: reply, modelId: model.id, tokens }).run();
  db.insert(schema.photoPractice)
    .values({ id, studentId: user.id, subject: read.subject, topic: read.topic, imageFile: input.jpeg ? `${id}.jpg` : "", ocrText: read.question, reply, conversationId, mock })
    .run();
  return { ok: true, id, conversationId, question: read.question, reply, mock, subject: read.subject, topic: read.topic };
}

/** "加入錯題簿": the recognised question goes into the wrongbook as a practice item (no answer key). */
export function photoToWrongbook(p: PhotoPractice) {
  const added = addWrong(p.studentId, [{ source: "practice", subject: p.subject, topic: p.topic || "影相練習", type: "long", stem: `📷 ${p.ocrText}`, options: [], answer: "", myAnswer: "" }]);
  db.update(schema.photoPractice).set({ inWrongbook: true }).where(eq(schema.photoPractice.id, p.id)).run();
  return added;
}
