# Campus AI — P8 (Vibe Coding deepen, tender 9.1 / R4)

P8 builds out the P7 natural-language coding (`P8_GAPS.md` V1–V5) for the student Code Lab (`/s/create/:id`, code projects) and the teacher App Builder (`/t/apps/build/:id`). It aims to be a credible school demo of tender 9.1: describe in plain language → front end with mock data → simple logic blocks → live preview → fix errors in plain language → export or list in the school app library. It does **not** include a real cloud backend or server deploy.

All changes are additive:
- **Database:** `drizzle/0008_p8.sql` adds one nullable JSON column `files` to `create_projects` and to `app_listings`. Rows where it is null are legacy rows and still work: a code project keeps its JS in `html`, and an app's single HTML file is split into files when it is opened.
- **Code:** `src/lib/p8/{files,runtime,zip}.ts`, `src/components/p8/*`, `src/lib/i18n/dict-p8.ts`, `scripts/seed-p8.ts`, `scripts/p8-smoke.mjs` (`npm run test:p8`). Also updated: `src/lib/p7/vibe.ts`, `src/lib/p6/sandbox.ts`, `VibeBar`, `CodeLab`, `AppBuilder` and both sets of server actions.
- **Phase:** `CURRENT_PHASE = 8`.
- **Backup** made before migrating: `data/campus.db.bak.pre-p8-1793162342` (made with `sqlite3 .backup`).

## Shipped

### V1: Multi-file projects
- A project has the files **`index.html` · `style.css` · `script.js` · `data.json`**, plus **🧩 積木** (blocks). Each is a tab in both editors. A dot on a tab means the file isn't empty.
- **Code Lab has two modes:**
  - **console mode:** `index.html` is empty. This is the P6/P7 behaviour: `script.js` runs in a Web Worker with no DOM.
  - **web mode:** `index.html` has content. The files are combined into one page and previewed in the sandboxed iframe, and the preview updates live as you type.
  - 「＋ 轉做網頁」 adds a starter page and 「轉返 console 程式」 switches back. If the student asks for a page or buttons, the NL bar also switches modes.
- **Combining the files:** `stitch()` puts the CSS in `<head>`, the JS and the compiled blocks at the end of `<body>`, and `data.json` in a `<script type="application/json">`. Each piece is escaped (`</script` / `</style`).
- **App Builder** keeps `app_listings.html` as the combined single document. Moderation, approval and the gallery are unchanged, and `files` holds the source. New apps from templates are stored already split, so the P6 templates open as html/css/js tabs.
- **Saving:** `normalizeFiles` validates the files and limits their size (html 60k, css 30k, js 50k, data 20k, ≤20 rules × ≤10 actions). Apps still have the 200 KB limit on the combined document.
- **`vibeCode` / `vibeApp`** now take and return the whole project (`{reply, files, code}`). The model only sends back the files it changed, which are merged with the rest. The P7 `{code}` reply shape is still accepted.

### V2: Natural-language debugging
- A button **「用 AI 修」** appears after a run fails:
  - in the worker: an exception or a 3 s timeout;
  - in the web preview: an uncaught error, a promise rejection or a loop-guard timeout.
- It sends the error text (`status:` plus the last error lines) and **all the files** to `vibeCodeAction` / `vibeAppAction` with `error`. The prompt asks for a minimal fix and a 1–3 sentence explanation, written as a teacher would and in the user's language. The result is applied and run again.
- **Errors give a file and line,** e.g. `ReferenceError: scoer is not defined (script.js 第 2 行 / line 2)`. The preview maps line numbers in the combined document back to the original file.
- **The free-text bar stays** for requests like 「幫我改：…」 on a multi-file project.
- **Demo mode** (no key) has fixes for:
  - infinite loops: adds a limit to the loop;
  - `fetch`: switches to `campus.mock`;
  - an undeclared variable: declares it;
  - a missing `#id`: adds the element to index.html;
  - unbalanced brackets.

  Anything else is wrapped in `try/catch`, and the reply says so honestly.

### V3: 簡易邏輯編排 (simple logic blocks)
- **8 block types in total:** 2 triggers and 6 actions.
  - **Triggers:** 撳掣 #id (button clicked) and 開始時 (page opens).
  - **Actions:** 設定文字 (set text), 計數 +n (count), 顯示／隱藏 (show/hide), 隨機揀一個 (random pick), 改字體顏色 (text colour) and 存入資料層 (save to data layer, which pushes to `campus.mock`).
- The UI is labelled 簡易邏輯編排 and says it is **not** an enterprise workflow engine.
- **Compiling:** `compileBlocks()` turns the rules into readable, commented JS (`blocks.js`) that runs after `script.js` in the same sandbox. 「睇生成嘅 JavaScript」 shows the output. Every string value is a JSON literal escaped for `<script>`, and ids are limited to `[A-Za-z0-9_-]`.
- **Editing:** the block editor suggests ids from `index.html` and warns 「⚠ index.html 搵唔到 id」 when an id is missing. The NL bar can also add or edit blocks (the model returns a `blocks` array), or edit the raw code; the tabs switch between the two.

### V4: Preview, export and 上架 (listing)
- **The flow line is shown in both editors** and highlights the current step: **描述 → 編輯／積木 → 預覽 → 修錯 → 導出／上架**. It reads 導出／分享 for students.
- **導出 ZIP:**
  - Contents: `index.html` (with `<link>`/`<script src>` for the other files), `style.css`, `script.js`, `blocks.js`, `data.json`, `campus-mock.js`, `project.json` (source + blocks) and `README.txt`.
  - The README says campus.mock is a demo in-memory layer and not a server.
  - The ZIP writer is our own (`src/lib/p8/zip.ts`: stored entries, CRC32, UTF-8 names), with no new dependency.
  - The exported page also opens offline from `file://`.
- **Single-file downloads are kept:** 「導出 .js」 (as in P7) and a new 「導出 .html」 for the combined page.
- **Listing (上架)** still goes **submit → admin review in `/a/moderation` → school app library**. The copy says 「唔係雲端正式部署，亦冇真實伺服器」 (not a production cloud deploy; no real server). An app stays `pending` with an empty `published_html` until an admin approves it. Students 導出 or 分享到檔案庫 (share to My files).

### V5: In-sandbox mock data layer (`campus.mock`)
- **API:** `campus.mock.get(key, default)`, `.set(key, value)`, `.push(key, item)`, `.remove`, `.keys()`, `.all()` and `.reset()`. Values are JSON-cloned and kept in memory only.
- **Seeding:** the store starts from `data.json`. It works both in the page preview and in the console worker; for the worker, the data is passed with each run.
- **UI wording:** the tip 「campus.mock：示範用記憶體資料層，非真實伺服器（重新整理就清空）」 appears under both editors and on the data.json tab. A badge 「前端 + 示範資料層」 shows when a project uses it.
- **Network stays blocked:**
  - `fetch` / `XMLHttpRequest` / `WebSocket` / `EventSource` / `WebTransport` / `sendBeacon` are replaced with stubs that throw an error pointing to campus.mock;
  - the CSP `connect-src 'none'` is unchanged.

## Sandbox: unchanged or stricter
- **Console runs** are as before: a worker inside an opaque-origin `sandbox="allow-scripts"` iframe, a **3 s hard kill** (the iframe is removed), stubbed network APIs and an output cap.
- **Every sandboxed page now gets a runtime injected by `sandboxDoc()`.** This covers the builder preview, the moderation preview and the gallery. The runtime is one line placed after the existing CSP meta, and it adds:
  - the network stubs;
  - **loop protection:** `instrumentLoops` adds a `__campusLoop()` call to every `for(;;)` test and `while`/`do-while` condition, and it throws once a single task has run for more than 3 s, so an infinite loop in a page no longer hangs the tab. If the instrumented code doesn't compile, the original is used. The check only compiles the code and never calls it.
  - `campus.mock`.
- **Editor previews also add a console/error bridge.** The parent only accepts messages whose `event.source` is that iframe. A watchdog removes a page that hasn't loaded within 4.5 s.
- **Nothing generated runs on the server.** CSP, `sandbox="allow-scripts"` and the opaque origin are unchanged. The stored `html` and `published_html` don't contain the runtime, so the moderation flags (network / eval / storage…) still only look at the teacher's code.

## Seed
`scripts/seed-p8.ts` is run by `npm run db:seed` and is idempotent. It adds **「P8 示範：班會投票（多檔案 + 示範資料層）」** for s125: html/css/js, `data.json` holding the options and votes, and two blocks (存入資料層 and 顯示／隱藏). It is re-added only if missing, because `p6-smoke` deletes all of s125's code projects.

## Verification (2026-10-28, live `http://188.245.12.100:3060/campus-ai`)
- `npm run typecheck` ✅ · `npm run build` ✅
- **`node scripts/p8-smoke.mjs` → ALL 58 PASS.** It ran against the live OpenRouter models, not the mock. Coverage:
  - multi-file tabs and persistence;
  - console NL (the P7 path);
  - campus.mock in the worker and in the page;
  - a timeout → 用 AI 修 → clean run;
  - web mode combining html+css+js;
  - blocks → JS → preview, for both student and teacher;
  - network blocked;
  - a ReferenceError with file/line → 用 AI 修 → clean run;
  - the loop guard;
  - a multi-file NL edit;
  - ZIP entries, .html and .js exports;
  - an App Builder error → 用 AI 修 (stays a draft);
  - submit → `pending` with nothing live → shown in the admin moderation queue;
  - P1–P7 student and teacher routes, and chat.
- `node scripts/p6-smoke.mjs` → ALL PASSED. This covers the sandbox, template preview, submit → approve → gallery run and the code-lab no-DOM check.
- `node scripts/p7-smoke.mjs` → 1 failure: "literacy dims move after chatting" (only 批判性判斷 moved, and the check needs 2 dimensions). P8 doesn't change literacy. s125's other dimension scores have hit their caps after many smoke runs, so they no longer move.

## Honest limits
- **No real backend or deploy.** "前後端" here means a front end plus `campus.mock`, an in-memory store that is cleared on every run or reload. There is no database, API, Docker or public hosting. 上架 means the school's moderation → gallery path. ZIP export is a static site.
- **The loop guard is a heuristic.** It catches `for` / `while` / `do-while` loops in inline scripts. Recursion without a base case ends with the browser's own stack-overflow error. A hang that is not a loop (rare) is only caught by the load watchdog; whether the tab can recover depends on the browser putting the sandboxed iframe in its own process. Console mode keeps the hard 3 s worker kill.
- **Blocks are deliberately small:** 8 types, ≤20 rules, no conditions or variables beyond counters. Code generated from blocks is read-only; to change it, edit the blocks or write JS in script.js.
- **AI fixes are not guaranteed.** 用 AI 修 depends on the model, and demo-mode fixes are pattern-based. The student can always edit by hand, and the explanation is shown either way.
- **Error lines are for page-level scripts only.** A file/line is given for `script.js` and `blocks.js` errors; inline `<script>` blocks inside index.html give document lines.
