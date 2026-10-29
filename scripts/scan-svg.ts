/* SVG "photos" of handwritten scripts for the P5 seed and smoke test (printed header + QR + blue-ink answers). */
import QRCode from "qrcode";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** QR as SVG rects (synchronous). */
export function qrRects(text: string, x: number, y: number, size: number) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const cell = size / (n + 2);
  let r = `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#fff"/>`;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (qr.modules.get(i, j)) r += `<rect x="${(x + (j + 1) * cell).toFixed(2)}" y="${(y + (i + 1) * cell).toFixed(2)}" width="${(cell + 0.3).toFixed(2)}" height="${(cell + 0.3).toFixed(2)}" fill="#000"/>`;
  return r;
}

export type ScriptPageSpec = {
  school: string;
  title: string;
  page: number;
  name?: string;
  qr?: string | null;
  /** Handwritten lines (blue ink) */
  lines: string[];
  /** Printed question prompts shown before the answers */
  printed?: string[];
  tilt?: number;
  smudge?: boolean;
};

export function scriptSvg(p: ScriptPageSpec) {
  const W = 1000;
  const H = 1414;
  const font = `'Noto Sans CJK TC','Noto Serif CJK TC',sans-serif`;
  let body = `<rect width="${W}" height="${H}" fill="#fbfaf6"/>`;
  body += `<text x="60" y="80" font-family="${font}" font-size="22" fill="#444">${esc(p.school)}</text>`;
  body += `<text x="60" y="122" font-family="${font}" font-size="30" font-weight="700" fill="#111">${esc(p.title)}</text>`;
  body += `<text x="60" y="168" font-family="${font}" font-size="22" fill="#333">姓名：＿＿＿＿＿＿＿　　第 ${p.page} 頁</text>`;
  if (p.name) body += `<text x="140" y="164" font-family="${font}" font-size="30" fill="#1e3a8a" transform="rotate(-2 140 164)">${esc(p.name)}</text>`;
  if (p.qr) body += qrRects(p.qr, 800, 40, 150);
  body += `<line x1="60" y1="195" x2="940" y2="195" stroke="#999" stroke-width="2"/>`;
  let y = 250;
  for (const line of p.printed ?? []) {
    body += `<text x="60" y="${y}" font-family="${font}" font-size="20" fill="#555">${esc(line)}</text>`;
    y += 36;
  }
  y += 20;
  p.lines.forEach((line, i) => {
    const r = ((i * 37) % 7) - 3;
    body += `<text x="${80 + ((i * 13) % 20)}" y="${y}" font-family="${font}" font-size="34" fill="#1d4ed8" transform="rotate(${r / 3} 80 ${y})">${esc(line)}</text>`;
    body += `<line x1="60" y1="${y + 14}" x2="940" y2="${y + 14}" stroke="#d6dbe4" stroke-width="1.5"/>`;
    y += 62;
  });
  if (p.smudge) body += `<ellipse cx="860" cy="120" rx="140" ry="95" fill="#8a8172" opacity="0.55"/><ellipse cx="500" cy="700" rx="420" ry="160" fill="#b9b2a4" opacity="0.25"/>`;
  const tilt = p.tilt ?? 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#e7e5e0"/><g transform="rotate(${tilt} ${W / 2} ${H / 2})">${body}</g></svg>`;
}
