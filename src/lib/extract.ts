import "server-only";
import { toPlainText, TEXT_EXTENSIONS } from "@/lib/ai/rag";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Common formats accepted by /s/library uploads (spec 16: 上載常用格式). */
export const LIBRARY_ACCEPT = [".pdf", ".docx", ".pptx", ".xlsx", ".png", ".jpg", ".jpeg", ".gif", ".webp", ...TEXT_EXTENSIONS];

export function isAllowedUpload(filename: string) {
  const lower = filename.toLowerCase();
  return LIBRARY_ACCEPT.some((ext) => lower.endsWith(ext));
}

/** Best-effort plain text from an uploaded file (txt/md/html/csv/json/tex, PDF, Word). Images → "". */
export async function extractText(filename: string, buf: Buffer): Promise<string> {
  const lower = filename.toLowerCase();
  try {
    if (TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext))) return toPlainText(filename, buf.toString("utf8")).slice(0, 200_000);
    if (lower.endsWith(".pdf")) {
      const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const { text } = await pdfText(pdf, { mergePages: true });
      return String(text).slice(0, 200_000);
    }
    if (lower.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer: buf });
      return value.slice(0, 200_000);
    }
  } catch (e) {
    console.error("extractText failed", filename, e);
  }
  return "";
}

export function mimeFor(filename: string) {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  return (
    {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      txt: "text/plain; charset=utf-8",
      md: "text/markdown; charset=utf-8",
      csv: "text/csv; charset=utf-8",
      json: "application/json",
      html: "text/plain; charset=utf-8", // never serve user HTML as HTML
      htm: "text/plain; charset=utf-8",
    } as Record<string, string>
  )[ext] ?? "application/octet-stream";
}
