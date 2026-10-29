# P2: Studio, Essay, Create Lab, My files, Safety/Policies/Logs

Demo: `http://188.245.12.100:3060/campus-ai`. Logins are unchanged: s123, t09 and admin, all with password `demo1234`.
Without an OpenRouter key, every tool runs in demo mode.

## New pages
| Role | Route | What it does |
|---|---|---|
| Student | `/s/studio`, `/s/studio/{mindmap,flashcards,quiz,youtube}/:id` | Upload, paste or pick a source, then make a mind map, flashcards, quiz or video notes. The mind map has draggable nodes, zoom, SVG export, AI "add branch", and conversion to flashcards or a quiz. Flashcards track known/forgotten cards and can make a quiz from the weak ones. The quiz gives instant feedback |
| Student | `/s/essay`, `/s/essay/:id` | Write an essay and get AI rubric feedback (four 1–5 scores plus a grade, highlights and guided improvements). Each assessment is saved as a version (v1, v2 …). Submitting sends it to the teacher, and the teacher's grade and comment show once it is returned |
| Student | `/s/create`, `/s/create/:id` | Create Lab: chat on the left, live poster / web page / slide preview on the right (sandboxed iframe, no scripts). Desktop/mobile view, HTML export, share to My files |
| Student | `/s/library` | My files: everything from Studio, Essay and Create Lab plus uploads. Filters, folders, search, rename/move/delete, download, "use in Studio" |
| Teacher | `/t/studio`, `/t/studio/:kind/:id` | Materials Studio: the same tools, plus worksheets (school template) and drafts as a source. "Save as draft" sends a worksheet to the drafts library |
| Teacher | `/t/grading/essay` | Queue of submitted essays → essay text, AI first pass, teacher rubric scores and comment → return to student |
| Admin | `/a/safety` | Risk inbox (open/resolved/escalated, level filter, masked list, detail with excerpt). Resolve, escalate or reopen with a note |
| Admin | `/a/policies` | Keyword/regex rules (category, block/flag, level, on/off) and a "test a sentence" check |
| Admin | `/a/logs` | Activity log with action and date filters, plus CSV export |

The home pages now link to the P2 tools. Before, they showed grey "P2" tiles. P3–P6 items stay locked.

## Backend
- `src/lib/ai/create.ts`: Create Lab prompt, output validation, and an HTML sanitiser (strips scripts, event handlers, iframes, `javascript:` URLs). The demo-mode generator reacts to the topic and colour words in the chat.
- Essay actions: save, assess (stored in `essay_versions`), submit, delete, and teacher return. Create Lab actions: chat turn, share, delete. Library actions: rename, move, delete (also removes the stored upload). The teacher worksheet → draft action is new as well.
- Audit logging is now wired in. It records sign-in, every `/a` admin action (settings, features, models, quotas, overrides, users, CSV import, batch, year-end), tutor publish/unpublish/delete, policy rules, safety cases, essay returns and log exports. The data was in `audit_logs` before, but nothing wrote to it.
- `ensurePolicyRules()` copies the built-in rules into `policy_rules` the first time someone opens `/a/policies`.
- `GET /api/admin/logs`: CSV export with a UTF-8 BOM. Cells that look like spreadsheet formulas are neutralised.
- `scripts/seed.ts`: a one-time, idempotent step turns on `studio`, `essay`, `create` and `youtube` for existing P1 databases (marker setting `p2FeaturesInit`). After that, admin choices in `/a/features` are kept. Fresh seeds include the same rows.
- i18n: all P2 strings live in `src/lib/i18n/dict-p2.ts` (zh-Hant + en) and are merged into the main dictionary. The missing `f.create`, `f.youtube`, `f.note.youtube` and `f.note.essay` keys were added.

## Fixes found while testing
- Create Lab crashed after the first message ("destroy is not a function"). An arrow-expression `useEffect` returned `scrollIntoView()`'s result, and current Chromium returns a Promise there.

## Deploy
```bash
npm run db:seed   # applies migrations; enables P2 switches once
npm run build
next start -p 3060 -H 0.0.0.0
```

## Verified (live demo, Playwright)
38 checks pass (`/tmp/p1fix/p2.mjs`), covering each tool end to end:

- **Student pages:** all P2 routes return 200 with no HTTP or page errors.
- **Mind map:** made from pasted text, dragged, extended by AI (still there after reload), converted to flashcards.
- **Flashcards → quiz:** finishing the deck and "practise weak cards" makes a quiz, which can be completed.
- **Video notes:** made from a YouTube link.
- **Essay:** two AI feedback versions, then submitted.
- **Create Lab:** the poster preview follows the chat (topic first, then a red colour change) and shares to My files.
- **My files:** lists 11 items across all types. A text upload goes into Studio and makes a quiz.
- **Teacher:** sees and returns the essay, and saves a worksheet as a draft. `/t/grading` (P4) is still locked.
- **Admin:**
  - A high-risk chat message opens a case, which can be resolved.
  - Policy test flags bullying, and a newly added block rule takes effect.
  - The audit log shows sign-in, policy, safety and essay entries, and the CSV downloads.
- **P1 suite:** still passes (35/35). P3–P6 routes still show the locked page.

Note: these runs created demo content under s123, t09 and admin. That includes essays, studio items and Create Lab projects, one resolved safety case from a test message, and one returned essay.

---

## Video notes (▶️ 影片重點) fixes — 2026-10-27

- **Fourth tile on Studio:** `/s/studio` now shows 心智圖 / 閃卡 / 練習題 / 影片重點 as four tiles. On `/t/studio` the video tile sits after the worksheet tile, but only when the `youtube` feature is on. When the feature is off, students see a disabled tile that says it is off.
- **A link is enough:** clicking the tile opens a panel with the URL field. The transcript box is now optional and folded away.
- **Captions are fetched on the server** (`src/lib/studio/youtube.ts`):
  - Uses YouTube's Android player endpoint to get the title, channel, description, length and a caption track. It prefers zh-HK, then other Chinese, then English, and human captions over auto-generated ones.
  - Captions are merged into `[mm:ss]` lines, so the model's timeline uses real timestamps.
  - If that fails (YouTube asks this server's IP to "confirm you're not a bot" for some videos), it gets the title and channel from oEmbed.
- **It never fails just because there's no transcript:**
  - With no captions and no paste, the notes come from the title and description.
  - With no OpenRouter key, the demo notes use real caption timestamps when there are captions.
  - If OpenRouter errors or returns unusable output, the request falls back to demo notes instead of failing. Quota, safety and exam-lock errors still block as before.
- **Result page:** keeps the embed, the summary and `data-testid="yt-timeline"`. It now also shows the video title, channel and where the notes came from (captions, pasted transcript, or title and description). Clicking a timestamp seeks the embedded player; Ctrl/⌘-click opens YouTube. The page respects the `youtube` feature switch. Items are saved as library kind `youtube`, titled with the real video title.
- **i18n:** added zh-HK and English text for `st.yt.auto`, `st.yt.addTranscript`, `st.yt.working`, `st.yt.timeline` and `st.yt.basis.*`.
- **Checked on the live :3060 demo as s123:**
  - A URL-only Rick Astley link took about 7 seconds and was based on captions, with 10 timeline points.
  - A URL-only 3Blue1Brown link had captions blocked by YouTube. The notes came from the title and description, and the timeline click moved the embed to `?start=300`.

---

## P2 finish: exports and checks (2026-10-27)

- **Create Lab exports** (`src/app/(app)/s/create/[id]/CreateLab.tsx`, new `src/lib/export-client.ts`):
  - **Poster → 匯出圖片 PNG.** The preview HTML loads in an off-screen iframe (`sandbox="allow-same-origin"`, scripts stay disabled) and is captured at 2× with `html2canvas-pro`. On posters this is the main button. Slides and web pages get it too.
  - **Slides → 匯出 PPTX.** Builds a real 16:9 `.pptx` with `pptxgenjs`. There is one slide per `<section>` (or per h1–h3 when there are no sections), with the title, bullets from the `<li>` items, and stray `<p>` text as speaker notes. The accent colour is taken from the preview's heading colour, and slides are numbered. The PPTX button only appears on slide projects.
  - **匯出 HTML** is still there for every type. Desktop/mobile preview and 分享到檔案庫 are unchanged.
  - Both libraries load lazily on click. If an export fails, the student sees the error 「匯出失敗」.
- **Mind map:** 「匯出 SVG」 is now paired with a new **「匯出 PNG」** button (2×, white background, CJK font stack).
- **i18n:** added `cr.exportImage`, `cr.exportPptx`, `cr.exporting`, `cr.exportFailed` and `st.mm.exportPng` in zh-Hant and en.
- **Already in place, checked rather than rebuilt:**
  - Studio has 4 tiles, including 影片重點.
  - Video notes work from a URL alone, with caption, oEmbed and demo fallbacks.
  - 最近產出 shows on `/s/studio`.
  - The quiz page has the shell's AI panel for asking about concepts.
- **Not done:** saving drafts as `.docx` (optional in the spec).
- **Smoke test on live :3060** (Playwright, `/tmp/p2finish/smoke.mjs`):
  - As s123: logged in, saw the 4 tiles and 最近產出, and made notes from a YouTube URL alone (11 timeline points plus the embed, about 5 s).
  - s123 then hit today's AI token quota (51.7k of 50k) from repeated test runs. The rest of the AI-backed run used s125:
    - Mind map PNG: 1274×1204.
    - Poster PNG: 1800×2342. Poster HTML also exported.
    - Mobile preview and share to library worked.
    - Slides PPTX: 8 slides with the outline text.
    - Slides PNG exported. The web page has no PPTX button and exports HTML.
  - No page errors.
