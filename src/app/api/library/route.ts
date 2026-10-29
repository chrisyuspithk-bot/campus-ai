import fs from "node:fs/promises";
import path from "node:path";
import { requireApiUser } from "@/lib/auth/dal";
import { MAX_UPLOAD_BYTES, extractText, isAllowedUpload, mimeFor } from "@/lib/extract";
import { createLibraryItem, libraryFileDir } from "@/lib/library";

/** Upload files into "My files" (students) / studio sources (teachers). Text is extracted for studio use. */
export async function POST(req: Request) {
  const user = await requireApiUser(["student", "teacher"]);
  if (user instanceof Response) return user;
  const form = await req.formData();
  const folder = String(form.get("folder") ?? "").trim().slice(0, 40);
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (!files.length) return Response.json({ error: "no_file" }, { status: 400 });

  const dir = libraryFileDir(user.id);
  await fs.mkdir(dir, { recursive: true });
  const results: { id?: string; filename: string; error?: string; hasText?: boolean }[] = [];
  for (const file of files.slice(0, 10)) {
    const filename = path.basename(file.name).slice(0, 120);
    if (file.size > MAX_UPLOAD_BYTES) {
      results.push({ filename, error: "too_large" });
      continue;
    }
    if (!isAllowedUpload(filename)) {
      results.push({ filename, error: "type" });
      continue;
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const text = await extractText(filename, buf);
    const id = createLibraryItem({
      ownerId: user.id,
      kind: "upload",
      source: "upload",
      title: filename,
      text,
      filename,
      mime: mimeFor(filename),
      size: file.size,
      folder,
    });
    await fs.writeFile(path.join(dir, id), buf);
    results.push({ id, filename, hasText: text.trim().length > 0 });
  }
  return Response.json({ files: results });
}
