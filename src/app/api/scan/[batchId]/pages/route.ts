import { requireApiUser } from "@/lib/auth/dal";
import { addUpload, canManageBatch, getBatch, MAX_SCAN_BYTES, setBatchStatus } from "@/lib/p5/scan";

export const maxDuration = 120;

/** Upload one photo or PDF (multipart field `file`) into a scan batch. PDFs are split into page images. */
export async function POST(req: Request, ctx: RouteContext<"/api/scan/[batchId]/pages">) {
  const user = await requireApiUser(["teacher", "admin"]);
  if (user instanceof Response) return user;
  const { batchId } = await ctx.params;
  const b = getBatch(batchId);
  if (!canManageBatch(user, b)) return Response.json({ error: "not_found" }, { status: 404 });
  if (b.status === "ocr") return Response.json({ error: "busy" }, { status: 409 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "no_file" }, { status: 400 });
  if (file.size > MAX_SCAN_BYTES) return Response.json({ error: "too_large" }, { status: 413 });
  const okType = /^image\/(png|jpe?g|webp|gif|heic|heif|tiff)$/.test(file.type) || file.type === "application/pdf" || /\.(pdf|png|jpe?g|webp|heic|tiff?)$/i.test(file.name);
  if (!okType) return Response.json({ error: "bad_type" }, { status: 415 });
  try {
    const ids = await addUpload(b, { name: file.name, type: file.type, buf: Buffer.from(await file.arrayBuffer()) });
    if (b.status === "ready") setBatchStatus(b.id, "matching");
    return Response.json({ ok: true, pages: ids.length });
  } catch (e) {
    console.warn("[scan] upload failed:", (e as Error).message);
    return Response.json({ error: "unreadable" }, { status: 422 });
  }
}
