import "server-only";
import type { StreamEvent } from "./openrouter";

// Used when OPENROUTER_API_KEY is not set, so the whole product can be demoed offline.

function pick(content: string, opts: { tutorName?: string; strict?: boolean; draft?: boolean; lang: "zh" | "en" }) {
  const q = content.trim().slice(0, 80);
  const zh = opts.lang === "zh";
  if (opts.draft || /工作紙|worksheet|出.{0,3}題|quiz|練習/i.test(content)) {
    return zh
      ? `# 因式分解練習（中三）\n\n> 示範模式產生的範例草稿，可直接「插入到草稿」再修改。\n\n## 甲部：基本題\n1. 因式分解 $x^2 + 5x + 6$\n2. 因式分解 $x^2 - 9$\n3. 因式分解 $2x^2 + 7x + 3$\n4. 因式分解 $x^2 - 4x + 4$\n\n## 乙部：挑戰題\n5. 已知 $x^2 + kx + 12 = (x+3)(x+4)$，求 $k$。\n6. 因式分解 $a^2b - b^3$\n\n## 答案\n1. $(x+2)(x+3)$\n2. $(x+3)(x-3)$\n3. $(2x+1)(x+3)$\n4. $(x-2)^2$\n5. $k = 7$\n6. $b(a+b)(a-b)$\n`
      : `# Factorisation practice (Form 3)\n\n> Sample draft generated in demo mode — insert it into your draft and edit.\n\n## Part A\n1. Factorise $x^2 + 5x + 6$\n2. Factorise $x^2 - 9$\n3. Factorise $2x^2 + 7x + 3$\n\n## Part B\n4. Given $x^2 + kx + 12 = (x+3)(x+4)$, find $k$.\n\n## Answers\n1. $(x+2)(x+3)$\n2. $(x+3)(x-3)$\n3. $(2x+1)(x+3)$\n4. $k = 7$\n`;
  }
  if (opts.tutorName && opts.strict) {
    return zh
      ? `好問題！我係**${opts.tutorName}**，我哋一齊一步步諗 🙂\n\n你問：「${q}」\n\n**步驟 1：** 先講吓，題目俾咗你咩資料？想你搵咩？\n\n**提示：** 如果係二次方程 $ax^2 + bx + c = 0$，可以試吓搵兩個數，相乘等於 $c$、相加等於 $b$。\n\n例如 $x^2 - 5x + 6 = 0$：邊兩個數相乘係 $6$、相加係 $-5$？\n\n你試吓答，我再同你核對 ✍️`
      : `Great question! I'm **${opts.tutorName}** — let's work through it together 🙂\n\nYou asked: "${q}"\n\n**Step 1:** What information does the question give you, and what are you asked to find?\n\n**Hint:** For a quadratic $ax^2 + bx + c = 0$, look for two numbers that multiply to $c$ and add to $b$.\n\nFor $x^2 - 5x + 6 = 0$: which two numbers multiply to $6$ and add to $-5$?\n\nHave a go and I'll check your reasoning ✍️`;
  }
  return zh
    ? `（**示範模式**：未設定 \`OPENROUTER_API_KEY\`，以下係示範回覆。）\n\n你問：「${q}」\n\n以下用一個例子示範 **Markdown + 數學公式**：\n\n二次方程公式：\n\n$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$\n\n| 步驟 | 做法 |\n|---|---|\n| 1 | 寫低 $a$、$b$、$c$ |\n| 2 | 計判別式 $\\Delta = b^2 - 4ac$ |\n| 3 | 代入公式 |\n\n- 如果 $\\Delta > 0$：兩個不同實根\n- 如果 $\\Delta = 0$：一個重根\n- 如果 $\\Delta < 0$：無實根\n\n想我再詳細解釋邊一步？`
    : `(**Demo mode**: \`OPENROUTER_API_KEY\` is not set — this is a sample reply.)\n\nYou asked: "${q}"\n\nHere's an example with **Markdown + maths**:\n\nThe quadratic formula:\n\n$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$\n\n| Step | What to do |\n|---|---|\n| 1 | Write down $a$, $b$, $c$ |\n| 2 | Compute $\\Delta = b^2 - 4ac$ |\n| 3 | Substitute |\n\n- $\\Delta > 0$: two distinct real roots\n- $\\Delta = 0$: one repeated root\n- $\\Delta < 0$: no real roots\n\nWhich step should I explain in more detail?`;
}

export async function* mockStream(opts: {
  content: string;
  tutorName?: string;
  strict?: boolean;
  draft?: boolean;
  signal?: AbortSignal;
}): AsyncGenerator<StreamEvent> {
  const lang = /[㐀-鿿]/.test(opts.content) ? "zh" : "en";
  const text = pick(opts.content, { ...opts, lang });
  for (let i = 0; i < text.length; ) {
    if (opts.signal?.aborted) return;
    const n = 2 + Math.floor(Math.random() * 5);
    yield { type: "text", text: text.slice(i, i + n) };
    i += n;
    await new Promise((r) => setTimeout(r, 18));
  }
  yield { type: "usage", promptTokens: Math.ceil(opts.content.length / 2) + 300, completionTokens: Math.ceil(text.length / 2) };
}

/** Demo SVG. P7: `why` explains on the badge why no real image was generated (no key / no image model on this key). */
export function mockImage(prompt: string, why = "") {
  const safe = prompt.replace(/[<>&"]/g, "").slice(0, 40);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="320"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#14b8a6"/></linearGradient></defs><rect width="512" height="320" rx="24" fill="url(#g)"/><rect x="16" y="16" width="150" height="30" rx="15" fill="#f59e0b"/><text x="91" y="37" font-size="14" text-anchor="middle" fill="#1e293b" font-family="sans-serif" font-weight="bold">DEMO 示範圖</text><text x="256" y="150" font-size="22" text-anchor="middle" fill="white" font-family="sans-serif">Demo image</text><text x="256" y="190" font-size="16" text-anchor="middle" fill="white" font-family="sans-serif">${safe}</text></svg>`;
  return `> 🏷️ **示範圖／Demo image**${why ? ` — ${why}` : ""}\n\n![demo](data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")})`;
}
