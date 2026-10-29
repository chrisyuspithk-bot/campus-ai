// Topic notes + built-in animated explainers (used by adaptive practice hints, /s/practice/animate and
// as the offline/mock source for /t/media script generation). No server-only: safe for client imports.
import type { VideoScene } from "@/lib/db/schema";

export const TOPIC_NOTES: Record<string, string[]> = {
  因式分解: [
    "先睇有冇公因式：6x + 9 = 3(2x + 3)。",
    "恆等式：a² − b² = (a + b)(a − b)；a² + 2ab + b² = (a + b)²。",
    "十字相乘：x² + bx + c，搵兩個數 p、q，使 p × q = c 而 p + q = b，答案係 (x + p)(x + q)。",
    "做完要展開返驗算，特別留意負號。",
  ],
  二次方程: [
    "先將方程寫成 ax² + bx + c = 0。",
    "可因式分解就用「積為零」：(x − 2)(x − 3) = 0 ⇒ x = 2 或 x = 3。",
    "唔方便分解就用公式 x = (−b ± √(b² − 4ac)) / 2a。",
    "判別式 Δ = b² − 4ac：Δ > 0 兩個實根，Δ = 0 一個（重根），Δ < 0 冇實根。",
  ],
  統計: [
    "平均數 = 總和 ÷ 個數。",
    "中位數：先由細到大排好，取正中間；個數係雙數就取中間兩個嘅平均。",
    "眾數：出現次數最多嘅數。",
    "分佈域 = 最大值 − 最小值。",
  ],
  Tenses: [
    "Simple present: habits and facts — She walks to school every day.",
    "Present continuous: happening now — I am reading.",
    "Simple past: finished time — We visited Ocean Park last Sunday.",
    "Present perfect: past action linked to now — I have already finished my homework (already / yet / since / for).",
  ],
};

export function notesFor(topic: string): string[] {
  return TOPIC_NOTES[topic] ?? [`溫習「${topic || "呢個課題"}」嘅定義、例題同常見錯誤。`, "試吓用自己嘅說話解釋一次，再做一條相似題。"];
}

/** Built-in animated explainers per topic (step-by-step scenes). */
export const TOPIC_ANIMATIONS: Record<string, VideoScene[]> = {
  因式分解: [
    { emoji: "🎯", title: "目標", visual: "$$x^2 - 5x + 6$$\n寫成兩個括號相乘", narration: "我哋要將 x 二次方減五 x 加六，寫成兩個括號相乘。", seconds: 5 },
    { emoji: "🔍", title: "睇 b 同 c", visual: "$b = -5$\n$c = 6$", narration: "對比 x 二次方加 b x 加 c：b 係負五，c 係六。", seconds: 5 },
    { emoji: "✖️", title: "搵 p、q", visual: "$p \\times q = 6$\n$p + q = -5$\n$\\Rightarrow p = -2,\\ q = -3$", narration: "搵兩個數，相乘係六、相加係負五：負二同負三。", seconds: 7 },
    { emoji: "🧩", title: "寫答案", visual: "$$x^2 - 5x + 6 = (x-2)(x-3)$$", narration: "所以答案係 x 減二，乘 x 減三。", seconds: 5 },
    { emoji: "✅", title: "驗算", visual: "$(x-2)(x-3) = x^2 - 3x - 2x + 6$\n$= x^2 - 5x + 6$ ✓", narration: "展開返驗算，同原式一樣，啱晒！", seconds: 6 },
  ],
  二次方程: [
    { emoji: "📝", title: "標準形式", visual: "$$ax^2 + bx + c = 0$$", narration: "先將方程整理成 a x 二次方加 b x 加 c 等於零。", seconds: 5 },
    { emoji: "🧮", title: "判別式", visual: "$$\\Delta = b^2 - 4ac$$", narration: "計判別式 b 二次方減四 a c，佢話俾你知有幾多個實根。", seconds: 6 },
    { emoji: "🚦", title: "三種情況", visual: "$\\Delta > 0$：兩個實根\n$\\Delta = 0$：一個重根\n$\\Delta < 0$：冇實根", narration: "大過零有兩個實根，等於零有一個重根，細過零就冇實根。", seconds: 7 },
    { emoji: "🎯", title: "例子", visual: "$x^2 - 5x + 6 = 0$\n$\\Delta = 25 - 24 = 1 > 0$\n$x = 2$ 或 $x = 3$", narration: "例如 x 二次方減五 x 加六等於零，判別式係一，所以有兩個根：二同三。", seconds: 8 },
  ],
  統計: [
    { emoji: "📊", title: "數據", visual: "3, 7, 5, 9, 6", narration: "我哋有五個數據：三、七、五、九、六。", seconds: 5 },
    { emoji: "↕️", title: "排序", visual: "3, 5, **6**, 7, 9", narration: "由細到大排好：三、五、六、七、九。", seconds: 5 },
    { emoji: "🎯", title: "中位數", visual: "正中間 → **6**", narration: "五個數，正中間第三個，所以中位數係六。", seconds: 5 },
    { emoji: "➗", title: "平均數", visual: "$(3+5+6+7+9) \\div 5 = 6$", narration: "平均數係總和三十除以五，都係六。", seconds: 6 },
  ],
  Tenses: [
    { emoji: "⏰", title: "Present perfect", visual: "have / has + past participle", narration: "Present perfect uses have or has plus the past participle.", seconds: 5 },
    { emoji: "🔗", title: "Past → now", visual: "I **have finished** my homework.\n(so now I am free)", narration: "It links a past action to now: I have finished my homework, so now I am free.", seconds: 6 },
    { emoji: "🏷️", title: "Signal words", visual: "already · yet · since · for · ever · never", narration: "Look for signal words like already, yet, since and for.", seconds: 5 },
    { emoji: "⚠️", title: "Not with past time", visual: "✗ I have seen it **yesterday**.\n✓ I **saw** it yesterday.", narration: "Do not use it with a finished time like yesterday — use the simple past instead.", seconds: 6 },
  ],
};

/** Scenes for a topic: built-in animation, else a generic one from the notes. */
export function animationFor(topic: string): VideoScene[] {
  if (TOPIC_ANIMATIONS[topic]) return TOPIC_ANIMATIONS[topic];
  return notesFor(topic).map((n, i) => ({ emoji: ["📘", "💡", "✏️", "✅"][i % 4], title: `${topic || "重點"} ${i + 1}`, visual: n, narration: n, seconds: 5 }));
}
