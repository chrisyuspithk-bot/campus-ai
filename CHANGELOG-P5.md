# Campus AI — P5 (scan upload, handwriting grading, concept gaps)

P5 builds on P4. It adds the `scan_batches` and `scan_pages` tables and a `grades.ink` column (`drizzle/0005_p5.sql`), the libraries in `src/lib/p5/*`, the routes below and `scripts/seed-p5.ts`. `CURRENT_PHASE = 5` unlocks `/t/scan` and `/s/progress/gaps`. P6 (`/t/media`, `/s/videos`) stays locked.

## Shipped
- **Scan upload home `/t/scan`**
  - Lists the teacher's batches. Each shows a status chip: 上載中 (uploading), 對名 m/n (matching), OCR 處理中 (OCR running) or 待批 (to grade). It also shows the linked assignment and class, page and student counts, and how many pages failed to match.
  - **[＋新批次]** (new batch) takes a name, the linked paper-based assignment and the pages per student, then opens the batch.
- **Batch detail `/t/scan/:batchId`**
  - **Upload.** Pick or drop several photos and/or PDFs. Each file is its own request to `POST /api/scan/:batchId/pages` (limit 25 MB; `proxyClientMaxBodySize` is raised to 26 MB), so the button shows "上載中 i/n".
    - On the server, PDFs are split into page images with `unpdf` + `@napi-rs/canvas`.
    - Every page is straightened (EXIF rotation) and saved as JPEG under `data/uploads/scans/<batch>/`.
  - **Matching**, in this order:
    1. **QR.** The QR is read on the server (`sharp` + `jsqr`, whole page, then the top-right band). The payload is `CAI1:<paperId>:<username>:<page>`.
    2. **File name.** A username in the file name (`s123_p1.jpg`), or a PDF named after a student, where PDF page n = script page n.
    3. **Page order.** A page with no QR that follows page k of student X becomes page k+1 of X, up to the pages-per-student limit. [按頁序補對] (fill by page order) re-runs this step.
    4. **Failed.** Anything left over is shown in a red "對名失敗" (match failed) panel.
  - **Manual remap.** Drag a page onto a student in the roster on the right, or use the "配對到…" (assign to) menu and the page-number menu on each thumbnail. Each page is badged with how it was matched: QR, 檔名 (file name), 頁序 (page order), 人手 (manual) or 失敗 (failed). Click a thumbnail to zoom.
  - **[佇列 OCR／分割]** (queue OCR / split) starts the demo OCR queue. The progress bar polls a server action, at about 0.6 s per page. When it finishes:
    - The recognised text of each student's pages becomes the answers on their attempt. Pages use numbered lines ("1. B", "8. (a) …"), and MC letters become option indexes.
    - A submitted attempt with `needs_marking` set is created for each student, or an existing one is reused; a digital submission keeps its own answers.
    - The batch moves to 待批 and lists [手寫批改] (grade handwriting) links. Unmatched pages are skipped.
  - You can also re-link the assignment or change pages per student, re-run OCR, delete a page or delete the batch. Batch creation, OCR runs, deletes and handwriting recognition are written to the activity log as `scan.create`, `scan.ocr`, `scan.delete` and `grade.handwriting`.
- **Handwriting mode in `/t/grading/:id`**
  - It switches on automatically when the attempt has scanned pages. The layout is the same three columns: student queue | script image + annotation layer | rubric + AI draft.
  - **Canvas tools:** 彩色筆 (colour pen, 4 colours), 文字 (text: click, type, Enter), 印章 (stamps ✓ ✗ 優 閱 ★ ?), 擦除 (erase: click an item), undo and clear page.
  - Page navigation: [上一頁] (previous) / [下一頁] (next) plus page thumbnails. The counter shows "批註未儲存" (annotations not saved) until you save.
  - Annotations use a 1000-wide page box and are saved in `grades.ink` by the existing [儲存（進行中）] (save, in progress), [完成 · 下一份] (done, next) and [接受 AI] (accept AI) buttons. The server checks the ink against this attempt's page ids (`sanitizeInk`).
  - **[手寫辨識＋AI 初評]** (recognise handwriting + AI draft) goes through `gate()`, so quota and safety checks apply.
    - **With an OpenRouter key:** one vision call reads up to 6 pages, transcribes each answer and scores it against the marking scheme. It uses `qwen/qwen3-vl-8b-instruct`, which `OPENROUTER_VISION_MODEL` can override. MC and short answers are then auto-marked on the transcription; long answers take the model's score and note.
    - **No key, or the vision call fails:** it uses the OCR-queue text and the rule-based draft.
    - Either way the transcription is written into the attempt's answers and into each question's `ocr` field, and is shown under each answer.
  - Scores are written back exactly as for digital scripts (`saveGrade` → `attempts.score`, `needs_marking=0`, grade `done`).
  - The grading queue shows a **手寫** (handwritten) badge on scanned scripts.
- **Student annotated script:** `/s/assignments/:id/script` shows the scanned pages with the teacher's pen, text and stamp layer once marks are released and review is allowed. The image route `/api/scan/page/:id` lets staff see pages of batches they manage. A student can only see their own pages, and only once released.
- **Student concept gaps `/s/progress/gaps`** (unlocked; linked from `/s/progress`)
  - Weak concepts per subject and topic, combining:
    - topic accuracy from released marks
    - the teacher's concept-defect tags on questions that lost marks (with counts)
    - marks lost, with an evidence list that links to each result
    - open and mastered wrongbook items
  - Each concept gets a severity level: 急需加強 (needs work), 要留意 (watch) or 輕微 (minor). It has buttons to **practise this topic** (school-bank MC quiz), **redo mistakes** (`/s/wrongbook/redo?topic=`) and **ask the subject tutor**.
  - The page is blocked during an AI-locked exam, like the wrongbook.
- **QR on printed papers:** `/t/papers/:id` has a new "個人化試卷（含 QR）" (personalised papers, with QR) option. Pick a class to print one copy per student, with the QR (`CAI1:paper:user:1`) and the student's name in the header, one copy per printed page. Scanning those copies matches them automatically.
- **i18n:** `src/lib/i18n/dict-p5.ts` has the zh-Hant and English strings.

## Demo data (`scripts/seed-p5.ts`, runs once, marker `p5SeedInit`)
- **因式分解紙本測驗（掃描）:** a new closed paper test for class 3A, using paper A.
- **Batch 1 · 第一疊 (待批):** 8 pages for s123, s125, s127 and s129 (QR on page 1, page 2 matched by order), with OCR done and attempts in the queue.
  - **s125:** graded 13/17 with tags, notes, comment and a red pen/stamp/text layer. Two wrongbook items were added.
  - **s127:** in progress, with one stamp.
  - **s123 and s129:** pending (handwritten scripts ready to grade).
- **Batch 2 · 第二疊 (對名 6/9):** QR matches (s124, s126), order matches, a file-name match (`s130_p1.jpg`), a smudged script with no QR (s128, 2 pages, failed) and a loose scrap page (failed).
- **Batch 3 · 補考 (上載中):** empty, still uploading.
- The page "photos" are SVGs with a printed header, a real QR code and blue "handwriting", rendered to JPEG with sharp (`scripts/scan-svg.ts`, `scripts/render-svg.mjs`).

## Deploy steps run (2026-10-27)
1. Backed up the DB to `data/campus.db.bak.pre-p5-1793128833`.
2. Ran `npm run db:seed`. This applied migration 0005 and seeded the P5 data. The seed was tested first on a copy of the live DB.
3. Ran `npm run typecheck` (OK) and `npm run build` (OK). New dependencies: `qrcode`, `jsqr` and `@napi-rs/canvas`. `@napi-rs/canvas` is in `serverExternalPackages`.
4. Restarted `npx next start -H 0.0.0.0 -p 3060`, logging to `/tmp/campus-ai-3060.log`. Only this app's `next-server` PID, verified by its cwd, was stopped.

## Smoke checks
### `node scripts/p5-smoke.mjs` (live demo): ALL PASSED
- **t09, `/t/scan`:** the nav item is unlocked, and the seeded chips show 上載中, 對名 6/9 and 待批.
- **New batch:**
  - Created a batch linked to the paper test. It opens at `/t/scan/:id` as 上載中.
  - Uploaded 3 photos and a 2-page PDF, giving 5 pages:
    - s131: page 1 by QR, page 2 by page order.
    - Loose page: failed.
    - PDF (s132): page 1 by QR, page 2 by file name.
  - [完成上載] (finish upload) → 對名 4/5.
  - Dragged the failed page onto s133 → matched manually. All pages matched.
- **OCR and grading queue:**
  - The OCR progress bar ran → 待批, with 3 grading links.
  - 3 attempts were created with `needs_marking=1`. The queue shows the 手寫 badge.
- **Handwriting grading (s131):**
  - Handwriting mode opened (canvas, 第 1/2 頁).
  - [手寫辨識＋AI 初評] used the live Qwen-VL vision model (`ai_mock=0`), and the recognised text was stored.
  - Drew a pen stroke, a stamp and text on page 1 and a stamp on page 2, then saved: `grades.ink` holds 3 + 1 items, and they reload after a refresh.
  - Set the long answer to 5 and pressed done: `needs_marking=0`, score 16/17, grade `done`.
- **Other t09 checks:**
  - The seeded s123 script opens in handwriting mode.
  - The paper print for 3A has 12 QR copies.
  - `/t/media` is still locked (P6) and is not in the nav.
  - All the P1–P4 teacher routes return 200.
- **s125 and s123, `/s/progress/gaps`:**
  - The page is non-empty and the nav item is unlocked.
  - s125's gaps show the defect tags 概念混淆, 步驟不完整 and 計算失誤.
  - s125's annotated paper script renders the ink layer.
  - The gap → redo-mistakes link works.
  - `/s/videos` is still locked (P6). All the P1–P4 student routes return 200.
- **admin:** the `/a/*` pages return 200, `/t/scan` keeps admin on `/a`, and the activity log has scan and handwriting rows.

### `node scripts/p4-smoke.mjs` (regression): ALL PASSED
Its two "P5 still locked" checks now check that P6 (`/t/media`, `/s/videos`) is still locked.

## Notes
- On this deployment's OpenRouter key, the Google, OpenAI and Anthropic vision models return 403 ("violation of provider Terms Of Service"). Qwen VL works, so it is the default vision model. The chat, studio and grading text models are unchanged (deepseek).
- Uploaded real photos have no OCR text until [手寫辨識] runs. Without a key, that step falls back to the rule-based draft on whatever text exists. The seeded scripts carry demo OCR text.
- The smoke run leaves s131 (graded), s132 and s133 (pending) on the paper test, plus one "煙測批次…" batch. The next smoke run deletes these first.
- `npx eslint .` still reports 5 pre-existing `react-hooks/purity` errors in P3 files. There are none in P5 code.
