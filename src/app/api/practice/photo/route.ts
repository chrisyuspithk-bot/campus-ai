import { requireApiUser } from "@/lib/auth/dal";
import { featuresFor } from "@/lib/features";
import { activeLockedAttempt } from "@/lib/p3/exam";
import { translate } from "@/lib/i18n/dict";
import { audit } from "@/lib/audit";
import { MAX_PHOTO_BYTES, runPhotoPractice } from "@/lib/p7/photo";

export const maxDuration = 120;

const STATUS = { exam_locked: 423, quota: 429, blocked: 422, no_model: 403, unreadable: 422, no_tutor: 404 } as const;

/** P7 photo practice: multipart `file` (image, optional) + `text` (typed question, optional) + `subject`. */
export async function POST(req: Request) {
  const user = await requireApiUser(["student"]);
  if (user instanceof Response) return user;
  if (activeLockedAttempt(user.id)) return Response.json({ error: "exam_locked", message: translate(user.language, "p3.err.examLocked") }, { status: 423 });
  const f = featuresFor(user.role);
  if (!f.ai_chat && !f.tutors) return Response.json({ error: "feature_off" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ error: "bad_form" }, { status: 400 });
  const file = form.get("file");
  const typed = String(form.get("text") ?? "").slice(0, 2000);
  const subject = String(form.get("subject") ?? "").slice(0, 20);
  let jpeg: Buffer | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_PHOTO_BYTES) return Response.json({ error: "too_large" }, { status: 413 });
    if (!/^image\//.test(file.type) && !/\.(png|jpe?g|webp|heic|heif)$/i.test(file.name)) return Response.json({ error: "bad_type" }, { status: 415 });
    try {
      const sharp = (await import("sharp")).default;
      jpeg = await sharp(Buffer.from(await file.arrayBuffer())).rotate().resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    } catch {
      return Response.json({ error: "unreadable" }, { status: 422 });
    }
  }
  if (!jpeg && !typed.trim()) return Response.json({ error: "no_file" }, { status: 400 });

  const r = await runPhotoPractice(user, { jpeg, typed, subject });
  if (!r.ok) return Response.json({ error: r.error }, { status: STATUS[r.error] });
  audit(user, "photo.practice", r.question.slice(0, 80), r.id);
  return Response.json(r);
}
