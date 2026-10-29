# Campus AI — P6 (adaptive practice, explainer videos, media studio, code sandbox, app publishing, org)

P6 is the last phase and builds on P5. It adds:
- the tables `practice_sessions`, `videos`, `video_views` and `app_listings` (`drizzle/0006_p6.sql`, additive only);
- the libraries in `src/lib/p6/*`, the `media` feature switch (phase 6), `src/lib/i18n/dict-p6.ts` and `scripts/seed-p6.ts`.

`CURRENT_PHASE = 6`, so every nav item is now unlocked, including `/s/videos` and `/t/media`.

## Shipped
- **Adaptive practice `/s/practice`**
  - **Topic picker.** Each topic offers **[自適應練習]** (adaptive practice; it changes to [繼續練習], resume, when a run is in progress), **[🎬 動畫講解]** (animated explainer) and the old **[快速測驗]** (quick quiz). Each topic also shows the student's current level (★–★★★) and mastery, and the page lists recent runs.
  - **Session `/s/practice/session/:id`** (8 questions from the school MC bank):
    - **Difficulty:** 2 correct answers in a row at the same level move up a level; a wrong answer moves down a level.
    - **Starting level:** where the student's last run on that topic ended.
    - **Wrong answers** go to the wrongbook (`source = practice`), with short notes on the concept.
    - **Results page:** accuracy, mastery (weighted by difficulty), the level path, and links to another round, the animation, redoing mistakes and related videos.
  - **[問 AI 概念]** (ask AI about the concept):
    - It goes through `gate()`, so the exam lock, quota and safety checks all apply.
    - It explains the concept and never gives the answer. A question where the hint was used does not count towards levelling up.
    - Without an OpenRouter key it falls back to a mock answer built from the topic notes.
  - **`/s/practice/animate?subject=&topic=`** plays an animated step-by-step explainer: scenes advance on a timer, lines animate in, captions show, and voice-over uses the browser's text-to-speech. It uses the teacher's published video for the topic if there is one, otherwise a built-in animation.
  - **Exam lock:** `/s/practice`, the session page and `/s/practice/animate` show `ExamLocked` during an AI-locked exam. The adaptive and AI actions refuse too. Practice only uses the school bank, never exam papers.
- **Student videos `/s/videos`**
  - A list of published course videos with a subject filter, duration, the first key points and a 已看 (watched) badge.
  - **`/s/videos/:id`** has the player, numbered key points, a transcript, links to the animation, adaptive practice and the subject tutor, and more videos from the same subject. Views are recorded in `video_views`.
- **Teacher media studio `/t/media`** (feature switch `media` plus the org permission `media.create`)
  - **List and new video:** title, subject, level, topic and an optional script.
  - **Editor**, in 3 steps:
    1. **講稿** (script): **[AI 生成講稿]** (generate script).
    2. **分鏡** (storyboard): **[由講稿生成分鏡]** (build storyboard from script). You can edit scenes (emoji, title, seconds, visual with `$LaTeX$`, narration), reorder, add and delete them, and edit the key points.
    3. **短片草稿** (video draft): **[生成短片草稿]** (build video draft) → the player → **[發佈畀學生]** (publish to students) or unpublish.
  - **AI:** script and storyboard generation go through `runStructured` (source `media`, quota and safety apply). The offline/mock fallback uses topic notes and splits the script into one scene per paragraph.
  - **Mock render:** no video pipeline is connected on this server, so "render" is a **mock**. `renderInfo` records `mock · n scenes · …`, and the draft is the animated storyboard player. The UI says this plainly.
  - Create, render, publish and delete are written to the audit log.
- **Create Lab code sandbox `/s/create`**
  - A new 💻 **代碼沙盒** (code sandbox) project type (`create_projects.kind = 'code'`). It has a JavaScript editor (Tab, Ctrl+Enter to run, Ctrl+S to save), sample snippets, an output console and save/share.
  - **Isolation** (`src/lib/p6/sandbox.ts`): code never runs on the server. It runs in a Web Worker started inside an `<iframe sandbox="allow-scripts">` (opaque origin: no cookies, no same-origin access).
  - **No network:** a CSP sets `connect-src 'none'`, and `fetch`, `XMLHttpRequest`, `WebSocket`, `importScripts`, `Worker` and similar are stubbed out on the global object and its prototype.
  - **Limits:** the run stops after **3 seconds** (the iframe is removed, which kills the worker), and output is capped at 200 lines.
  - The P2 poster/web page/slides editor's **[代碼]** (code) button now works: it toggles a view of the HTML source.
- **App publishing flow**
  - **`/t/apps`:** the gallery now also shows approved teacher apps. A new **我的應用** (my apps) section shows status and the live version, with 4 starter templates (random picker, scoreboard, flashcards, blank). Each teacher can have at most 12 apps.
  - **`/t/apps/build/:id`:**
    - **Editing:** an HTML/CSS/JS editor with a live sandboxed preview (no network), plus name, emoji, description, subject and audience (students and teachers, or teachers only). The code limit is 200 KB.
    - **Review:** **[打包並提交上架]** (package and submit) sends the app for review; you can withdraw it.
    - **Versions:** any edit returns the app to draft, and the published snapshot stays live until the next version is approved.
  - **`/a/moderation`:** new tabs **應用上架** (app listings, the default) and **社群分享** (community, the P3 queue, unchanged).
    - Each pending app can be tried in the sandbox or read as code. Static flags warn about network calls, external URLs, eval, storage and forms.
    - Approve or reject with a note. Approving snapshots `published_html` and increments the version.
    - A **上架中** (live) list has an [下架] (unlist) button.
  - The `/s/apps` and `/t/apps` galleries run approved apps in a sandboxed iframe. Students only see apps whose audience includes students.
- **Admin org `/a/org`**
  - A **grade × subject grid** (S1–S6 × subjects: classes, member counts, a flag for classes with no teacher, students per grade).
  - A **permission matrix** (capability × role, saved to the `orgPermissions` setting and audited).
  - Four of the capabilities are enforced: `apps.publish`, `media.create`, `practice.adaptive` and `create.sandbox`. The other rows only record policy for now.
  - Class creation and role descriptions from P3 are unchanged.
- **Concept gaps `/s/progress/gaps`** from P5 is unchanged.

## Demo data (`scripts/seed-p6.ts`, runs once, marker `p6SeedInit`)
- **Questions:** 25 extra leveled MC questions (因式分解 factorisation, 二次方程 quadratic equations, 統計 statistics, English Tenses) at difficulty 1–3, so adaptive practice has room to move.
- **Videos:**
  - 4 published, with storyboards and key points: 十字相乘 (cross-method factorisation), 判別式 (discriminant), 中位數同平均數 (median and mean), and Present perfect by t12.
  - 2 t09 drafts: 勾股定理 (Pythagoras' theorem, at the storyboard step) and 百分數 (percentages, script only).
  - s123 has already watched one video.
- **Practice history:**
  - s123: a finished run on 因式分解 (factorisation) and an active one on 二次方程 (quadratic equations).
  - s125: a finished run on 統計 (statistics).
- **Apps:**
  - Live: 3A 隨機抽問 (random picker, teachers only, v1) and 代數概念閃卡 (algebra flashcards, everyone, v1).
  - In review: Vocab Battle scoreboard (t12) and 十字相乘練習器 (cross-method practice tool, t09).
  - Returned: t15's "外部連結測驗" (external-link quiz), with a reviewer note.
- **Classes:** 1A 中文, 2B 英文, 5C 物理 (no teacher) and 6A 生物, so the org grid is filled.
- **Community:** one pending community share (added only if the queue is empty).
- **Create Lab:** one code-sandbox project for s123.

## Deploy steps run (2026-10-28)
1. **Backups:**
   - First I copied the DB to `data/campus.db.bak.pre-p6-1793145821-nowal`. I made that copy *before* checkpointing the WAL, so it may lack the most recent writes; the file name says so.
   - After seeding I made a consistent `.backup`: `data/campus.db.bak.post-p6-seed-1793145930`.
   - The P6 seed only adds tables and rows.
2. **Seed:** ran `npm run db:seed` (migration 0006 + P6 seed). I tested it first on a copy of the live DB (twice, to confirm it's idempotent) and on a fresh `--reset` database.
3. **Checks and build:** `npm run typecheck` OK, `eslint` clean on the P6 files, `npm run build` OK. No new dependencies.
4. **Restart:** stopped only the `next-server` on :3060 whose cwd is this app (PID verified), then restarted `nohup npx next start -H 0.0.0.0 -p 3060 >> /tmp/campus-ai-3060.log`.

## Smoke checks
### `node scripts/p6-smoke.mjs` (live demo): 78/78 PASSED
- **t09:**
  - `/t/media`: new video → AI script (live model) → storyboard (7 scenes) → draft render → publish.
  - `/t/apps`: new app from a template → the sandboxed preview runs → package and submit → 審核中 (in review).
  - P1–P5 teacher routes return 200.
- **admin:**
  - The app queue (3 pending) → approve → live v1. The community tab works.
  - `/a/org` grid (6 grades) and permission matrix render, and the media feature switch is shown.
  - Admin routes return 200.
- **s125:**
  - **Adaptive practice:**
    - The AI concept hint works.
    - Over 8 answers the level path was 1→1→1→2→2→1→1→2: up after a streak, down after the wrong answer. The hinted first question correctly earned no streak credit.
    - The results page shows, the session is stored with 8 steps, and the wrong answer is in the wrongbook.
  - **Animation:** advances scenes.
  - **Videos:** `/s/videos` lists 5, the video page shows the player and key points, and the view is recorded.
  - **Code sandbox:**
    - A snippet runs (`sum 10`).
    - `while(true)` stops at the timeout.
    - `fetch` is blocked.
    - There is no `document` or `localStorage`.
    - Save works.
  - **Apps:** `/s/apps` shows the approved apps and hides the teachers-only one; a teacher app runs in the sandbox.
  - P1–P5 student routes return 200.
- **Exam lock:** with a temporary in-progress locked attempt for s126, `/s/practice` and `/s/practice/animate` show the exam-locked screen. The attempt was deleted afterwards.
- **Cleanup:** the smoke deletes its own video and app. The practice run and code project stay as history.

### Regressions
- **`node scripts/p4-smoke.mjs`:** 59 passed. The only 2 failures are the checks that P6 is *still locked*, which are expected now that P6 is unlocked.
- **`node scripts/p5-smoke.mjs`:**
  - All scan/OCR/handwriting/gaps checks pass, apart from these failures:
    - The 4 checks that P6 is still locked (expected).
    - "attempts created in grading queue": s133's attempt on the paper test was already graded (`done`) in an earlier P5 smoke run on 2026-10-27, and the script only cleans up s131/s132. This is old smoke data, not a P6 change.
  - Note: p5-smoke was run twice in this session, so it created two more smoke batches/attempts (it cleans up its own previous batches on each run).
- `/tmp/campus-ai-3060.log` has no errors after the restart.
