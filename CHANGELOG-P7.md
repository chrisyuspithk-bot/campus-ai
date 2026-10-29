# Campus AI — P7 (tender gap close)

P7 closes the software gaps from `P7_GAPS.md` (G1–G11) on top of P1–P6. Changes are additive:
- **Database:** migration `drizzle/0007_p7.sql` adds two tables, `photo_practice` and `notifications`. Step marks live inside the existing `grades.marks` JSON, and the new draft types are new values in the existing `drafts.type` text column.
- **Code:** `src/lib/p7/*`, `src/components/p7/*`, `src/lib/i18n/dict-p7.ts`, `scripts/seed-p7.ts` and `scripts/p7-smoke.mjs`.
- **Phase:** `CURRENT_PHASE = 7`. The new nav items (影相練習 photo practice, 網上資料搜尋 web research) are phase 7.

Out of scope, as the brief says: contract terms, training, 2-year subscription, human support, legal forms, school SSO, Caddy and `api.spit.hk`.

## What the OpenRouter key allows (probed 2026-10-28)
| Provider | Chat | Notes |
|---|---|---|
| DeepSeek, Qwen, Kimi (Moonshot), MiniMax, GLM (Z-AI), Grok, Llama | ✅ | Live |
| Google Gemini, OpenAI GPT, Anthropic Claude | ❌ 403 | "violation of provider Terms Of Service" |
| **Image output models**: every one OpenRouter lists (Google / OpenAI / `openrouter/auto`) | ❌ 403 | So image generation is a **badged demo** |
| Web plugin (`plugins:[{id:"web"}]`) | ✅ | Returns `url_citation` annotations |
| Vision | Only `qwen/qwen3-vl-8b-instruct` | Unchanged since P5 |

We don't claim any provider that returns 403. Those rows are in `/a/models` but disabled, with a note.

## Shipped

### G1: Multi-model catalogue
- **`models` table: distinct OpenRouter ids** (`src/lib/p7/models.ts`):

  | Model | OpenRouter id | Roles |
  |---|---|---|
  | 校園快速 (fast) · DeepSeek | `deepseek/deepseek-v4.1-flash-1017` | all |
  | 校園通用 (general) · Qwen | `qwen/qwen3.8-flash` | all |
  | 校園極速 (fastest) · MiniMax | `minimax/minimax-m3.1-flash` | all |
  | 校園深度 (deep) · Kimi | `moonshotai/kimi-k3` | staff |
  | GLM | `z-ai/glm-5.3-flash` | disabled spare |
  | Gemini / GPT / Claude | — | disabled, with a 403 note |

- **Seeding:** the first P7 seed re-points the old aliases (all three were DeepSeek). Later seeds only insert missing rows, so admin edits in `/a/models` are kept.
- **Chat picker:** the picker's `modelId` was already sent to `/api/chat`. Each model now resolves to a different provider id.
- **Verifying the model used:** every response carries an `X-OpenRouter-Id` header, and each assistant message stores the model it used.
- **Model hint:** the picker shows a hint: 快速 (fast) for quick questions, 深度 (deep) for long or complex work.
- **`/a/models`:** has an explanatory note. Admins can still enable or disable a model and change its id without code changes.

### G2: Photo practice `/s/practice/photo` (students)
- **Flow:**
  - Take or choose a photo (`capture=environment`).
  - Optionally type the question as a fallback.
  - Qwen VL reads the question into JSON: `{question, subject, topic}`.
  - The student gets a **guided** tutor reply: the subject tutor, forced to `strict` strategy, with an HKDSE-style "first step only, never the final answer" prompt and LaTeX.
- **Saving:**
  - The run is saved in `photo_practice`.
  - It is also saved as a normal tutor conversation, so **繼續同導師傾** (continue with the tutor) keeps the guided strategy in `/ai/c/:id`.
  - **加入錯題簿** (add to wrongbook) adds the question to the wrongbook (`source = practice`).
- **Safeguards:**
  - `gate()` applies: exam lock, quota, safety on the typed text.
  - A second safety pass runs on the OCR text.
  - The API returns 423 during an AI-locked exam. The page shows `ExamLocked`, and the nav item is disabled.
  - Photos are served only to their owner.
- **Entry points:** a **📷 影相練習** button on `/s/practice`, plus a nav item.
- **No key, or the vision call fails:** the typed text is used. If there's no typed text either, the run is marked as a demo.

### G3: Step-level partial credit
- **Steps:** the marking scheme's `[n]` markers become steps, e.g. `(a) … [2]`.
- **Where steps come from** (`src/lib/p7/steps.ts`):
  - `aiDraft()` (long answers) and the handwriting vision call now ask for `steps:[{label, ok, marksAwarded, marksMax, note}]`. The AI score is the sum of the steps.
  - The rule-based draft makes steps from how much of each step's key fragments the answer covers.
  - Grades drafted before P7 get rule-based steps on the fly.
- **Workbench:**
  - Long and upload items show green / amber / red step rows, each with ✓/✗ buttons and a mark input.
  - Editing a step sets the question score to the step total, and the total updates live.
  - Saving writes `steps` back. A score the teacher types directly still overrides the steps.
  - [接受 AI] (accept AI) resets to the AI steps.
- **Student result** (`ScriptList`): shows the step feedback once marks are released.
- **Seeded on t09's 因式分解測驗（上週）** (factorisation test, last week), question Q1008:
  - s126: AI steps 4/6, still in progress (for the walkthrough).
  - s125 and s127: teacher-final steps, matching the already released scores, so no total changed.
  - s127's scanned paper script: AI steps 6/6 (handwriting mode).

### G4: Cross-subject banks
- **40 school-scope questions:** 8 per subject (5 MC + 2 short + 1 long with a step-marked scheme) for 企業會計與財務概論 (BAFS), 資訊及通訊科技 (ICT), 生物 (biology), 化學 (chemistry) and 物理 (physics), with topics, difficulty and level.
- **Bank and practice:** `BANK_SUBJECTS` now includes BAFS and ICT. The new MC questions also show up as topics in `/s/practice`.
- **Paper:** t09 has a non-maths paper, **生物 · 細胞與酶 小測（P7 示範）** (biology: cells and enzymes quiz), with an MC section and a structured section. AI lock is on.

### G5: AI literacy, 6 dimensions with the tender's labels
- **Dimensions** (`src/lib/p7/literacy.ts`):

  | Dimension | Signals |
  |---|---|
  | 學習目的 (learning purpose) | Share of goal-directed use (tutor, photo practice, research), practice runs |
  | 提示詞精準度 (prompt precision) | Question length and count, attachments |
  | 迭代對話 (iterative dialogue) | Follow-up turns per chat |
  | 批判性判斷 (critical judgement) | 👍/👎 feedback, checking words such as 點解 (why) / 來源 (source) / verify, web-search chats |
  | 戰術性學習應用 (tactical learning use) | Practice runs, wrongbook redos, library items, creations |
  | 負責任的使用 (responsible use) | Safety record |

- **Labels:** there are zh and en labels.
- **No random baseline:** the old random per-student baseline (a hash of the user id) is gone; scores now come only from these activity signals.
- **Captions:** `/s/progress` and `/a/analytics` keep a 「非正式／估算」 (informal / estimate) caption.
- **Class report:** `/a/analytics` has a new class × dimension table plus the school average, with the method explained.

### G6: Image tool
- **Setting:** `imageModel` is set to blank, so a badged demo image is used, because every image model 403s on this key.
- **Chat:**
  - A blank setting, `mock`, or a known-403 provider produces a demo SVG labelled **DEMO 示範圖** plus a quoted reason.
  - If a configured model still fails, chat falls back to the same badge instead of returning a 502.
  - The `images` quota still counts.
- **`/a/models`:** shows the live / demo status and the probe note. Entering `mock` or a blank value is now accepted.

### G7: Research and web search
- **Feature switch:** `web_search` is on for teachers. Admins get every unlocked feature anyway. Students follow the feature switch (still off).
- **Chat:**
  - With 網上搜尋 (web search) on, streaming replies collect the web plugin's `url_citation` annotations and append a **來源** (sources) list.
  - If the plugin errors, the reply is regenerated without it, with a "未經網上查證" (not web-verified) note.
- **`/research`:**
  - The page takes a question, returns a summary with citations, and saves it as a chat conversation (search on) that can be continued in `/ai`.
  - It's in the nav for teachers and admins. For students it appears only if the feature switch is on.
  - It's exam-locked for students.
- **YouTube:** the studio's YouTube video notes are unchanged, and the research page links to them.

### G8: Document drafts
- **New draft types:** `report_card` 成績單 (report card), `notice` 通知信 (parent notice), `progress_report` 進度報告 (progress report). They appear in the filter and the editor.
- **Create box:** `/t/drafts` has a **✨ AI 文件草稿** (AI document draft) box: type, class (optional), topic → `runStructured`.
  - If a class is picked, the draft uses that class's real numbers: averages, submissions, open wrongbook items.
  - Students are referred to by login id only; no names are sent.
  - Without a key, a local template is filled in instead.
- **Seed:** one example of each type for t09.

### G9: Natural-language coding
- **Code sandbox** (`/s/create`, code project): a **生成／修改代碼** (generate / edit code) bar.
  - `runStructured` returns JS, which is saved and then **automatically run in the existing sandbox**.
  - A **導出 .js** (export .js) button downloads the code.
  - The generated code is post-processed so that `fetch`, `XHR` and `WebSocket` are neutralised. Isolation is unchanged: Worker inside an opaque-origin iframe, 3 s timeout, network stubbed, CSP `connect-src 'none'`.
- **Teacher app builder:** the same bar rewrites the HTML into the **draft** copy. It previews in the sandboxed iframe, and publishing still goes through `/a/moderation`.
- **`/s/create`:** has a flow line: 描述 → 預覽 → 導出／上架 (describe → preview → export / publish).
- **Server-side execution:** none — generated code never runs on the server.

### G10: HKDSE labelling
- **Tags:** school maths MC on 因式分解 (factorisation), 二次方程 (quadratic equations) and 統計 (statistics) is tagged `hkdse` plus a topic group (代數 algebra / 統計 statistics).
- **New items:** 3 HKDSE-style long structured items with `[n]` step schemes.
- **`/t/bank`:** a 標籤 (tags) chip (全部 all / HKDSE), an "只看 HKDSE 題" (HKDSE only) link and an HKDSE badge on list rows.

### G11: Safety auto-report and masking
- **Auto-report:** every **high** case opened by `recordSafety()` triggers `notifyHighRisk()`, which:
  - writes an audit row (`safety.auto_high`, masked user + category);
  - sends in-app notices to every admin;
  - sends in-app notices to the student's class teachers.
- **Notices:**
  - They carry only `s***`, the category and the source — never the text or the name.
  - They appear on `/a`, `/a/safety` and `/t/alerts`, with a 全部標為已讀 (mark all read) button.
- **CSV export:** `/a/safety` → **匯出 CSV（已遮蔽）** (`/api/admin/safety`). User ids are masked, there are no excerpts, and the export is audited (`safety.export`).
- **Detail view:** the full detail stays admin-only, as before.

## Demo data (`scripts/seed-p7.ts`, marker `p7SeedInit`)
- Model catalogue, plus `web_search` turned on for teachers.
- `imageModel` set to blank.
- 40 cross-subject questions and 3 HKDSE long items, plus HKDSE tags on 38 maths items.
- 1 biology paper for t09.
- Step marks on 4 scripts.
- 3 document drafts.

## Deploy steps run (2026-10-28)
1. **Backup:** `PRAGMA wal_checkpoint`, then `sqlite3 .backup` → `data/campus.db.bak.pre-p7-1793157275` (`integrity_check` ok).
2. **Seed rehearsal:** tested on a `.backup` copy of the live DB twice (idempotent) and on a fresh `--reset` DB.
3. **Live seed:** ran `npm run db:seed` (migration 0007 + P7 seed) on the live DB.
4. **Checks and build:** `npm run typecheck` OK, `eslint` clean on the touched files, `npm run build` OK. No new dependencies.
5. **Restart:**
   - Killed only PID 3169615 (`next-server`, cwd = this app) and its npm/sh parents.
   - Restarted with `nohup npx next start -H 0.0.0.0 -p 3060 >> /tmp/campus-ai-3060.log`.
   - Other ports (3001 / 3005 / 3010 / 3050 / 4000) and Caddy were not touched.

## Smoke
### `node scripts/p7-smoke.mjs` (live demo): 102/102 PASSED
- **t09:**
  - **Models:** completions on 3 distinct provider ids (DeepSeek, Qwen, Kimi). The UI picker switched to Qwen, and the request carried `campus-light` and was answered by `qwen/qwen3.8-flash`.
  - **Image tool:** 200 with a badged demo image.
  - **Search:** chat with web search returned a 來源 (sources) list with hkeaa.edu.hk links, and `/research` returned a cited answer.
  - **Bank:** each of the 5 new subjects has ≥8 questions, and the HKDSE filter returns 38. The 化學 (chemistry) variants page and the biology paper open.
  - **Step credit:** the workbench shows step rows. Editing a step changed the total from 11/17 to 13/17, and the save wrote the steps back with score = step sum. The handwriting workbench shows steps too.
  - **Drafts:** the filter has the new types, and AI created a 通知信 (parent notice) from 3A's data.
  - **App builder:** an NL edit updated the sandboxed preview and the app stayed a draft.
  - **Routes:** 15 teacher routes return 200.
- **s125:**
  - **Models:** two models in one chat (DeepSeek, then Qwen), and the messages record both.
  - **Literacy:** 6D labels and the 估算 (estimate) caption are shown. After chatting, 4 dimensions moved, and 負責任的使用 (responsible use) went 90 → 70 after a high-risk message.
  - **Photo practice:** live Qwen VL read "Solve x² − 7x + 12 = 0", the tutor's reply was guided with no final answer, continuing opened the tutor thread, and the question went into the wrongbook.
  - **Result page:** shows step feedback.
  - **Code sandbox:** an NL request produced a 9×9 table that ran in the sandbox. Export .js works, network is still blocked, and the timeout still applies.
  - **Nav and routes:** research is hidden for students; 15 student routes return 200.
- **Safety:** a blocked high-risk message created a case, a `safety.auto_high` audit row and a masked admin notice.
- **admin:**
  - `/a/models` shows distinct ids, the 403 notes and the image status.
  - The analytics 6D class report renders.
  - The `/a/safety` notice shows and the list is masked. The CSV is masked, with no excerpt.
  - Admin routes return 200.
- **Exam lock** (temporary in-progress locked attempt for s126):
  - `/s/practice/photo`, `/research` and `/ai` show the exam-locked screen.
  - The photo API and the chat API return 423.
  - The attempt is deleted afterwards.
- **Cleanup:** the smoke deletes its draft, app, safety case and notices, and restores s126's seeded workbench grade.
- **First run:** 99/100. The doc-draft check filtered by title, but the AI picks its own title. The draft itself was created correctly; the check now uses the draft id.
- `/tmp/campus-ai-3060.log` shows no errors after the restart.

### Not re-run
- p4/p5/p6 smokes were not re-run in this session. P1–P6 routes are covered by the 200-checks above; the p4/p5 "P6 still locked" checks have failed by design since P6, which is not a P7 regression.
