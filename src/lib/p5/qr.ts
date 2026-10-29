/** QR payload printed on paper scripts: `CAI1:<paperId>:<username>:<page>`. Shared by print + scan matching. */
export type QrPayload = { paperId: string; username: string; page: number };

export function qrPayload(p: QrPayload) {
  return `CAI1:${p.paperId}:${p.username}:${p.page}`;
}

export function parseQr(text: string | null | undefined): QrPayload | null {
  const m = text?.trim().match(/^CAI1:([\w-]+):([\w.-]+):(\d{1,2})$/);
  return m ? { paperId: m[1], username: m[2], page: Number(m[3]) } : null;
}

/** Recognised answer text uses one numbered line per question: "1. B", "5. (a) ...". */
export function parseNumbered(text: string): Map<number, string> {
  const out = new Map<number, string>();
  let cur = 0;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:Q\s*)?(\d{1,2})\s*[.、:：)]\s*(.*)$/i);
    if (m) {
      cur = Number(m[1]);
      out.set(cur, m[2].trim());
    } else if (cur && line.trim()) {
      out.set(cur, `${out.get(cur)}\n${line.trim()}`.trim());
    }
  }
  return out;
}
