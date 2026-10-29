// Starter templates for teacher-built apps (/t/apps/build). Plain module so the seed script can import it.
const shell = (title: string, body: string, script: string) => `<!doctype html>
<html lang="zh-Hant"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>
  body { font-family: system-ui, "Noto Sans HK", sans-serif; margin: 0; padding: 20px; background: #f8fafc; color: #0f172a; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px; max-width: 520px; margin: auto; text-align: center; }
  button { font: inherit; padding: 8px 16px; border-radius: 10px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; margin: 4px; }
  button.primary { background: #2563eb; color: #fff; border-color: #2563eb; }
  textarea, input { font: inherit; width: 100%; box-sizing: border-box; padding: 8px; border-radius: 8px; border: 1px solid #cbd5e1; }
  .big { font-size: 2.2rem; font-weight: 700; margin: 14px 0; }
</style></head>
<body>
${body}
<script>
${script}
</script>
</body></html>`;

/** Starter templates for /t/apps/build. */
export const APP_TEMPLATES = {
  picker: {
    emoji: "🎯",
    title: "隨機抽問",
    description: "貼上學生名單，一按抽一位（唔重複）",
    html: shell(
      "隨機抽問",
      `<div class="card"><h2>🎯 隨機抽問</h2><textarea id="names" rows="4">阿明\n阿華\n小美\n志強\n嘉欣</textarea>
<div class="big" id="out">—</div><button class="primary" id="go">抽一位</button><button id="reset">重置</button><p id="left"></p></div>`,
      `let pool = [];
const names = () => document.getElementById("names").value.split(/\\n|,/).map(s => s.trim()).filter(Boolean);
const left = () => document.getElementById("left").textContent = "剩餘 " + pool.length + " 人";
document.getElementById("reset").onclick = () => { pool = names(); left(); document.getElementById("out").textContent = "—"; };
document.getElementById("go").onclick = () => { if (!pool.length) pool = names(); const i = Math.floor(Math.random() * pool.length); document.getElementById("out").textContent = pool.splice(i, 1)[0]; left(); };
pool = names(); left();`,
    ),
  },
  scoreboard: {
    emoji: "🏆",
    title: "分組計分板",
    description: "課堂比賽用：四組加減分",
    html: shell(
      "分組計分板",
      `<div class="card"><h2>🏆 分組計分板</h2><div id="teams"></div><button id="reset">清零</button></div>`,
      `const teams = ["紅隊", "藍隊", "綠隊", "黃隊"]; const score = [0, 0, 0, 0];
function draw() { document.getElementById("teams").innerHTML = teams.map((t, i) => '<div style="display:flex;align-items:center;gap:8px;justify-content:center"><b style="width:4em">' + t + '</b><button data-i="' + i + '" data-d="-1">−</button><span class="big" style="width:2.5em">' + score[i] + '</span><button class="primary" data-i="' + i + '" data-d="1">＋</button></div>').join(""); }
document.getElementById("teams").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; score[+b.dataset.i] += +b.dataset.d; draw(); };
document.getElementById("reset").onclick = () => { score.fill(0); draw(); };
draw();`,
    ),
  },
  flashcards: {
    emoji: "🃏",
    title: "概念閃卡",
    description: "撳卡片翻轉，溫習定義",
    html: shell(
      "概念閃卡",
      `<div class="card"><h2>🃏 概念閃卡</h2><div id="card" class="big" style="cursor:pointer;min-height:5rem"></div><p id="n"></p><button id="prev">← 上一張</button><button class="primary" id="flip">翻轉</button><button id="next">下一張 →</button></div>`,
      `const cards = [["公因式", "每一項都有嘅因式，例如 6x+9 = 3(2x+3)"], ["十字相乘", "x²+bx+c：搵 p×q=c、p+q=b"], ["判別式", "Δ = b² − 4ac"], ["中位數", "排好次序後正中間嘅數"]];
let i = 0, back = false;
function draw() { document.getElementById("card").textContent = cards[i][back ? 1 : 0]; document.getElementById("card").style.fontSize = back ? "1.2rem" : "2.2rem"; document.getElementById("n").textContent = (i + 1) + " / " + cards.length; }
document.getElementById("flip").onclick = document.getElementById("card").onclick = () => { back = !back; draw(); };
document.getElementById("next").onclick = () => { i = (i + 1) % cards.length; back = false; draw(); };
document.getElementById("prev").onclick = () => { i = (i + cards.length - 1) % cards.length; back = false; draw(); };
draw();`,
    ),
  },
  blank: {
    emoji: "🧩",
    title: "新應用",
    description: "",
    html: shell("新應用", `<div class="card"><h2>你好！</h2><p id="msg">喺左邊改 HTML／JavaScript。</p><button class="primary" id="b">撳我</button></div>`, `let n = 0; document.getElementById("b").onclick = () => document.getElementById("msg").textContent = "撳咗 " + (++n) + " 次";`),
  },
} as const;
export type TemplateKey = keyof typeof APP_TEMPLATES;

export const STATUS_CLS: Record<string, string> = {
  draft: "",
  pending: "bg-amber-50 text-amber-800",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-rose-50 text-rose-700",
};
