import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireApiUser } from "@/lib/auth/dal";
import { newId } from "@/lib/ids";
import { chunkText, isIndexable } from "@/lib/ai/rag";
import { extractText } from "@/lib/extract";
import { canEditTutor } from "@/lib/tutors";
import { UPLOADS_DIR } from "@/lib/paths";
import fs from "node:fs/promises";
import path from "node:path";

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request, ctx: RouteContext<"/api/tutors/[id]/files">) {
  const user = await requireApiUser(["teacher", "admin"]);
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const tutor = db.select().from(schema.tutors).where(eq(schema.tutors.id, id)).get();
  if (!tutor || !canEditTutor(user, tutor)) return Response.json({ error: "not_found" }, { status: 404 });

  const form = await req.formData();
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (!files.length) return Response.json({ error: "no_file" }, { status: 400 });

  const dir = path.join(UPLOADS_DIR, id);
  await fs.mkdir(dir, { recursive: true });

  const results = [];
  for (const file of files) {
    if (file.size > MAX_BYTES) {
      results.push({ filename: file.name, error: "too_large" });
      continue;
    }
    const fileId = newId();
    const buf = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(path.join(dir, `${fileId}-${path.basename(file.name)}`), buf);
    const indexable = isIndexable(file.name);
    db.insert(schema.tutorFiles)
      .values({ id: fileId, tutorId: id, filename: file.name, size: file.size, status: indexable ? "indexing" : "unsupported" })
      .run();
    if (indexable) {
      const chunks = chunkText(await extractText(file.name, buf));
      if (!chunks.length) {
        db.update(schema.tutorFiles).set({ status: "unsupported" }).where(eq(schema.tutorFiles.id, fileId)).run();
        results.push({ id: fileId, filename: file.name });
        continue;
      }
      db.transaction((tx) => {
        for (const content of chunks) tx.insert(schema.tutorChunks).values({ fileId, tutorId: id, content }).run();
        tx.update(schema.tutorFiles)
          .set({ status: "ready", chunkCount: chunks.length })
          .where(eq(schema.tutorFiles.id, fileId))
          .run();
      });
    }
    results.push({ id: fileId, filename: file.name });
  }
  db.update(schema.tutors).set({ updatedAt: new Date() }).where(eq(schema.tutors.id, id)).run();
  return Response.json({ files: results });
}
