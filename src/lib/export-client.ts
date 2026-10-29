"use client";
// Browser-side exports (P2): PNG snapshots of mind maps / Create Lab previews, and .pptx from a
// Create Lab slide outline. Heavy libraries are imported lazily so they only load on click.

const FONT = "'Noto Sans TC','Microsoft JhengHei','PingFang TC',system-ui,sans-serif";

export function safeName(s: string) {
  // Strip a trailing .pptx so writeFile({ fileName: `${safeName}.pptx` }) never yields foo.pptx.pptx.
  const base = (s.replace(/[\\/:*?"<>|\n\r]+/g, " ").trim() || "export").replace(/\.pptx$/i, "").trim() || "export";
  return base.slice(0, 80);
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const toBlob = (canvas: HTMLCanvasElement, type: string) =>
  new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), type, 0.92));

/** Rasterise an inline-styled SVG (no external CSS) to PNG at `scale`× with a white background. */
export async function svgToPng(svg: SVGSVGElement, width: number, height: number, scale = 2): Promise<Blob> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.setAttribute("font-family", FONT);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("svg_load"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return toBlob(canvas, "image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Load sanitised preview HTML into an off-screen iframe. `allow-same-origin` (but no scripts) lets us
 * read its layout; the HTML has already had scripts/handlers stripped server-side.
 */
async function withFrame<T>(html: string, width: number, fn: (doc: Document, win: Window) => Promise<T>): Promise<T> {
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:900px;border:0;visibility:hidden`;
  document.body.appendChild(frame);
  try {
    await new Promise<void>((res) => {
      frame.onload = () => res();
      frame.srcdoc = html;
    });
    const doc = frame.contentDocument!;
    await doc.fonts?.ready.catch(() => undefined);
    frame.style.height = `${Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0, 400)}px`;
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    return await fn(doc, frame.contentWindow!);
  } finally {
    frame.remove();
  }
}

/** Snapshot the full rendered page as PNG (or JPEG). */
export async function htmlToImage(html: string, opts: { width?: number; type?: "image/png" | "image/jpeg" } = {}): Promise<Blob> {
  const { default: html2canvas } = await import("html2canvas-pro");
  const width = opts.width ?? 1000;
  return withFrame(html, width, async (doc) => {
    const root = doc.documentElement;
    const canvas = await html2canvas(root, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: false,
      logging: false,
      width,
      height: root.scrollHeight,
      windowWidth: width,
      windowHeight: root.scrollHeight,
    });
    return toBlob(canvas, opts.type ?? "image/png");
  });
}

type Slide = {
  title: string;
  /** Small label above the title (.kicker inside h2, or .eyebrow sibling) — matches preview hierarchy. */
  kicker: string;
  /** Visible subtitle (.sub / .subtitle / .meta) — not speaker notes. */
  subtitle: string;
  bullets: string[];
  notes: string[];
  /** Cover slides get centred title layout; content slides always get bullets + left title. */
  kind: "cover" | "content";
};

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

const SUB_SEL = "p.sub, p.subtitle, p.meta, .sub, .subtitle, .meta";

/** Split heading into optional kicker + main title the way the preview CSS shows them. */
function headingParts(el: Element): { kicker: string; title: string } {
  const h = el.querySelector("h1,h2,h3");
  let kicker = "";
  // Eyebrow often sits beside the heading (cover layouts).
  const eye = el.querySelector(":scope > .eyebrow, :scope > .kicker");
  if (eye && (!h || !h.contains(eye))) kicker = clean(eye.textContent);

  if (!h) return { kicker, title: "" };

  const innerK = h.querySelector(".kicker, .eyebrow");
  if (innerK) {
    kicker = kicker || clean(innerK.textContent);
    // Clone heading, drop kicker node, read remaining title text (preserves br → space via clean).
    const clone = h.cloneNode(true) as Element;
    clone.querySelectorAll(".kicker, .eyebrow").forEach((n) => n.remove());
    return { kicker, title: clean(clone.textContent) };
  }
  return { kicker, title: clean(h.textContent) };
}

function collectSubtitles(el: Element): string[] {
  const out: string[] = [];
  const seen = new Set<Element>();
  for (const n of Array.from(el.querySelectorAll(SUB_SEL))) {
    // Prefer the element itself; skip nested matches of the same text.
    if (seen.has(n)) continue;
    // Skip if nested inside another matched subtitle node.
    if (n.parentElement?.closest(SUB_SEL) && n.parentElement.closest(SUB_SEL) !== n) continue;
    const t = clean(n.textContent);
    if (!t) continue;
    seen.add(n);
    out.push(t);
  }
  return out;
}

function isSubtitleNode(n: Element): boolean {
  return n.matches?.(SUB_SEL) || Boolean(n.closest?.(SUB_SEL));
}

/** Turn the slide-outline HTML into slides: one per <section> / .slide (or per h1/h2 run when there are none). */
export function parseSlides(doc: Document): Slide[] {
  const body = doc.body;
  const blocks = Array.from(body.querySelectorAll("section, .slide, article")).filter(
    (el) => !el.parentElement?.closest("section, .slide, article") && el.querySelector("h1,h2,h3,li,p"),
  );

  const fromBlock = (el: Element): Slide => {
    const { kicker, title: headingTitle } = headingParts(el);
    const bullets = Array.from(el.querySelectorAll("li"))
      .map((li) => clean(li.textContent))
      .filter(Boolean);
    const subs = collectSubtitles(el);
    // Other paragraphs (not subtitle/meta) — speaker notes when bullets exist, else body text.
    const otherParas = Array.from(el.querySelectorAll("p"))
      .filter((p) => !isSubtitleNode(p))
      .map((p) => clean(p.textContent))
      .filter(Boolean);

    let title = headingTitle;
    const subtitle = subs.join("\n");
    let bodyBullets = bullets;
    let notes = [...otherParas];

    if (!title && notes.length) {
      title = notes.shift() || "";
    }
    if (!bullets.length && notes.length && !subs.length) {
      // No list and no .sub — treat leftover paras as body points (legacy mock HTML).
      bodyBullets = notes;
      notes = [];
    }
    // Cover with only .sub / .meta: keep subtitle visible — do NOT promote to bullets.

    const hasCoverClass = /\bcover\b/i.test(el.className || "");
    const kind: "cover" | "content" = hasCoverClass || (bodyBullets.length === 0 && Boolean(title)) ? "cover" : "content";

    return {
      title: title || "",
      kicker,
      subtitle,
      bullets: bodyBullets,
      notes,
      kind,
    };
  };

  if (blocks.length >= 1) {
    const mapped = blocks.map(fromBlock).filter((s) => s.title || s.bullets.length || s.subtitle || s.kicker);
    if (mapped.length >= 1) return mapped.slice(0, 40);
  }

  // No wrappers: start a new slide at every heading.
  const slides: Slide[] = [];
  let cur: Slide | null = null;
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode() as Element | null; n; n = walker.nextNode() as Element | null) {
    const tag = n.tagName.toLowerCase();
    if (/^h[1-3]$/.test(tag)) {
      // Walker's node may be inside a heading that also has .kicker — only fire on the heading itself.
      if (n.closest("h1,h2,h3") !== n) continue;
      const kickerEl = n.querySelector(".kicker, .eyebrow");
      let kicker = "";
      let title = clean(n.textContent);
      if (kickerEl) {
        kicker = clean(kickerEl.textContent);
        const clone = n.cloneNode(true) as Element;
        clone.querySelectorAll(".kicker, .eyebrow").forEach((x) => x.remove());
        title = clean(clone.textContent);
      }
      slides.push((cur = { title, kicker, subtitle: "", bullets: [], notes: [], kind: "content" }));
    } else if (tag === "li" || (tag === "p" && !n.closest("li"))) {
      const text = clean(n.textContent);
      if (!text) continue;
      if (!cur) slides.push((cur = { title: "", kicker: "", subtitle: "", bullets: [], notes: [], kind: "content" }));
      if (isSubtitleNode(n) && !cur.subtitle) cur.subtitle = text;
      else cur.bullets.push(text);
    }
  }
  // Promote empty-bullet first slides / no-bullet slides to cover when appropriate.
  for (const s of slides) {
    if (!s.bullets.length) s.kind = "cover";
  }
  return slides.filter((s) => s.title || s.bullets.length || s.subtitle || s.kicker).slice(0, 40);
}

const hex = (c: string, fallback: string) => {
  const m = c.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/);
  if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return fallback;
  return [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, "0")).join("").toUpperCase();
};

/** Build a real .pptx (16:9) from the slide-outline preview, keeping its accent colour. */
export async function htmlSlidesToPptx(html: string, title: string): Promise<{ slides: number }> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  return withFrame(html, 1000, async (doc, win) => {
    const slides = parseSlides(doc);
    const h = doc.querySelector("h1,h2,h3");
    const accent = h ? hex(win.getComputedStyle(h).color, "1E3A8A") : "1E3A8A";
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_16x9"; // 10 × 5.625 in
    pptx.title = title;
    const list = slides.length ? slides : [{ title, kicker: "", subtitle: "", bullets: [], notes: [], kind: "cover" as const }];
    list.forEach((s, i) => {
      const slide = pptx.addSlide();
      slide.background = { color: "FFFFFF" };
      slide.addShape("rect", { x: 0, y: 0, w: 10, h: 0.14, fill: { color: accent }, line: { color: accent } });

      // Cover layout only when the preview marks it as cover (or no body bullets) — never force
      // i===0 into title-slide layout when the first section is a normal content slide.
      const cover = s.kind === "cover";
      let y = cover ? 1.35 : 0.4;

      if (s.kicker) {
        slide.addText(s.kicker, {
          x: 0.6,
          y,
          w: 8.8,
          h: 0.35,
          fontSize: 14,
          bold: true,
          color: "64748B",
          fontFace: "Microsoft JhengHei",
          align: cover ? "center" : "left",
          charSpacing: 6,
        });
        y += 0.4;
      }

      slide.addText(s.title || title, {
        x: 0.6,
        y,
        w: 8.8,
        h: cover ? 1.1 : 0.85,
        fontSize: cover ? 36 : 28,
        bold: true,
        color: accent,
        fontFace: "Microsoft JhengHei",
        align: cover ? "center" : "left",
        valign: "middle",
      });
      y += cover ? 1.2 : 0.95;

      if (s.subtitle) {
        slide.addText(s.subtitle, {
          x: 0.8,
          y,
          w: 8.4,
          h: 0.7,
          fontSize: 16,
          color: "475569",
          fontFace: "Microsoft JhengHei",
          align: cover ? "center" : "left",
          valign: "top",
        });
        y += 0.75;
      }

      if (s.bullets.length) {
        const bulletH = Math.max(1.2, 5.0 - y - 0.4);
        slide.addText(
          s.bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
          {
            x: 0.8,
            y,
            w: 8.4,
            h: bulletH,
            fontSize: Math.max(14, 22 - Math.max(0, s.bullets.length - 4) * 2),
            color: "334155",
            fontFace: "Microsoft JhengHei",
            align: "left",
            valign: "top",
            paraSpaceAfter: 8,
          },
        );
      }
      slide.addText(String(i + 1), { x: 9.1, y: 5.1, w: 0.6, h: 0.35, fontSize: 12, color: "94A3B8", align: "right" });
      if (s.notes.length) slide.addNotes(s.notes.join("\n"));
    });
    await pptx.writeFile({ fileName: `${safeName(title)}.pptx` });
    return { slides: list.length };
  });
}
