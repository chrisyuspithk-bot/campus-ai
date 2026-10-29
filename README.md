# Campus AI — P1 MVP + P2

School AI learning platform with one unified UI (no OpenWebUI anywhere). Built with Next.js 16 (App Router) · TypeScript · Tailwind v4 · SQLite (Drizzle ORM + better-sqlite3).

## Quick start

```bash
cd app
npm install
cp .env.example .env.local     # optional: add OPENROUTER_API_KEY
npm run setup                  # create SQLite DB (data/campus.db) + seed demo data
npm run dev                    # http://localhost:3000
```

Without `OPENROUTER_API_KEY` the AI runs in **demo mode**: it streams canned Markdown/KaTeX answers, so every flow can be demoed offline. Quotas still apply.

### Demo logins (password `demo1234` for all)

| Role | Username | Lands on |
|---|---|---|
| Student 阿明 | `s123` | `/s` |
| Teacher 陳老師 (數學) | `t09` | `/t` |
| Admin | `admin` | `/a` |

There are also extra seeded users (`s124`, `s201`, `t12`) so the admin pages have data. The login page has one-click buttons that fill these in.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint (flat config, `eslint-config-next`) |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm run setup` / `npm run db:seed` | Apply migrations + seed. Skips seeding if users already exist |
| `npm run db:reset` | Delete the DB and uploads, then reseed |
| `npm run db:generate` | Generate a new Drizzle migration after editing `src/lib/db/schema.ts` |
| `npm run test:smoke` | Playwright smoke test against a running server (`BASE_URL=http://localhost:3000`). Needs a Chromium for Playwright (`npx playwright install chromium`) |

## Environment

| Var | Default | Notes |
|---|---|---|
| `AUTH_SECRET` | dev fallback | **Required in production.** Signs session JWTs |
| `OPENROUTER_API_KEY` | — | Empty → demo mode |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | Point at a proxy if needed |
| `DATABASE_PATH` | `./data/campus.db` | Uploads go in `uploads/` next to it |
| `APP_URL` | `http://localhost:3000` | Public URL. Its origin is used for every server redirect (basePath `/campus-ai` is added automatically); session cookies are `Secure` only when it is `https`. Also sent to OpenRouter as `HTTP-Referer` |

## What's in P1

| Route | Spec | Notes |
|---|---|---|
| `/login` | 01 | SSO button (shows "not configured" in demo), username/password, show/hide password, "remember this device" (30-day vs 12h session cookie), 繁中/Eng switch, generic error (no account enumeration), disabled-account error. Signed-in users are redirected to their role home |
| Global chrome | draft §2 | Top bar (logo · search · 🔔 P3 · `[AI]` · avatar menu with quota/settings/logout), role-based left nav with fixed P1–P6 groups (later phases gray + `Px` badge, never links), collapsible right **AI panel** that carries page context and can "放大" into `/ai/c/:id`. Announcement banner from `/a`. Mobile: nav drawer |
| `/ai`, `/ai/c/:id` | 03 | History (pinned/today/yesterday/earlier/archived; search covers titles and message text; pin/rename/delete) · messages (Markdown + GFM tables + KaTeX, copy / regenerate / 👍👎 / TTS) · settings (mode, model picker from the role whitelist, RAG/search/image/TTS toggles gated by `/a/features`, text-file attachments, quota bar). Streaming with Stop. Local draft survives errors. Quota exhausted → input disabled plus an explanation. Safety-filtered messages show a policy notice and a "通知老師" button. Voice input where the browser supports it |
| `/ai?tutor=<slug>` | 03/04 | Tutor mode: persona locked (fixed title, guided system prompt, the tutor's model whitelist, RAG on by default). Asks for confirmation before leaving. `&preview=1` lets teachers preview drafts; previews stay out of history |
| `/s` | 02 | Greeting, P3 to-do placeholder, tutor cards, recent chats, P2 shortcuts (studio / essay / create / files), first-login guide, quota ≥80% banner |
| `/s/tutors` | 04 | Published tutors (unpublished shown as gray 未開放), level filter, intro modal (will / won't / topics) |
| `/t` | 05 | Quick actions, recent 5 drafts, recent chats, locked P3/P4 preview cards |
| `/t/drafts`, `/t/drafts/:id` | 06 | Filter by type, subject and status, plus search. ⋯ menu: rename, duplicate, archive, export `.md`, delete. Editor: AI chat on the left with "插入到草稿", Markdown edit/preview on the right, Ctrl/Cmd+S, warns on unsaved changes. "送去題庫" locked (P3) |
| `/t/tutors` | 07 | Tutor list + editor (name, levels, strategy, blurb, will/won't, topics, model whitelist, advanced system prompt), knowledge-base upload and indexing, preview as student, publish/unpublish, delete |
| `/a` | 08 | Live KPIs for today (active users, chats, messages, blocks, average quota), service status, entry cards, announcement + school name |
| `/a/features` | 09 | Per-role switches; changes reach every user's nav and chat tools on their next request. P2+ modules locked |
| `/a/models` | 10 | OpenRouter model catalog (display name ↔ model id, roles, enabled), image model, per-role daily/monthly/image quotas, per-user exceptions, 7-day usage chart |
| `/a/users` | 11 | Search, role filter, monthly usage %, batch (disable/enable, set role, reset quota), manual add, CSV import, SSO sync placeholder, **year-end tool** (archive read-only or delete all student chats; requires typing CONFIRM) |
| `/me` | 12 | Avatar, display name (updates the top bar immediately), read-only email, 繁中/English, default model, P3 notifications placeholder, change password, log out, log out all devices |
| `/search`, `/help` | draft §6 | Global search (tutors, chats, teacher drafts), help page |
| `/s/*`, `/t/*`, `/a/*` (P3+) | — | Direct URLs to locked modules show "此功能將於 Px 開放" instead of a 404 |

## What's in P2

All P2 tools run in demo mode without an OpenRouter key: studio outputs, essay rubric feedback and Create Lab pages are built locally from the student's own text, through the same quota/safety gate as real AI calls (`src/lib/ai/run.ts` → `runStructured`).

| Route | Spec | Notes |
|---|---|---|
| `/s/studio` | 13 | Source = pasted text, upload (PDF/Word/text), or an item from My files. Makes a **mind map**, **flashcards** or a **quiz**, plus **video notes** from a YouTube link (behind the `youtube` switch, with a copyright notice). Recent outputs list. Every output is saved to My files |
| `/s/studio/mindmap/:id` | 13 | SVG map with draggable nodes (positions saved), zoom, reset, export `.svg`, click a node for its note, right-hand "AI 加分枝" (attaches to the best-matching node), → flashcards (local, no AI) / → quiz |
| `/s/studio/flashcards/:id` | 13 | Flip cards, 懂／唔記得, progress saved; the end screen suggests weak cards → "練習弱項" makes a quiz from just those |
| `/s/studio/quiz/:id` | 13 | Practice mode (not an exam): instant feedback + explanation per question, score history; "存錯題簿" locked (P4) |
| `/s/studio/youtube/:id` | 13 | Embedded video (`youtube-nocookie`), summary, clickable timeline |
| `/s/essay`, `/s/essay/:id` | 14 | List with status (草稿／AI已評／已交老師／老師已發回). Editor: task, subject, type, suggested length, live word count; **AI 初評** with fixed rubric (內容／組織／語法／詞彙 1–5 → grade), highlights and *guided* improvements; every assessment is a version (v1, v2 …) you can flip between; submit to teacher locks the essay; teacher grade + comment shown when returned. The `essay` switch turns it off for students (e.g. formal assessments) |
| `/t/grading/essay` | 41 | Queue (待覆核／已發回) · essay text · latest AI first pass + teacher rubric scores and comment → 發回學生 (audited) |
| `/s/create`, `/s/create/:id` | 15 | Poster / mini web page / slide outline. Chat on the left; every turn returns the full HTML, rendered on the right in a **script-less sandboxed iframe** (also sanitised server-side). Desktop/mobile preview, export `.html`, "分享到檔案庫"; code view locked (P6) |
| `/s/library` | 16 | My files: studio outputs, essays, Create Lab projects and uploads. Filter by type and folder, search, upload (multi-file), open in the original tool, download uploads, "送去工作室", ⋯ rename / move to folder / delete. Year-end policy notice |
| `/t/studio`, `/t/studio/:kind/:id` | 42 | Same studio for teachers, plus **worksheets** (school template, Markdown edit/preview) and teacher drafts as a source. "存為草稿" puts a worksheet into 草稿庫; "入題庫" locked (P3) |
| `/a/safety` | 17 | Risk inbox: open / resolved / escalated, level filter. The list masks users (`s***`) and never shows user text; the detail view shows the excerpt, model, rule and blocked/flagged. 標已處理 / 通知訓導 / 重開 with a note (audited) |
| `/a/policies` | 18 | Keyword/regex rules by category (自傷／欺凌／色情／作弊／暴力／其他), block vs flag, level, on/off; invalid regexes rejected. **測試一句話** shows which rule would fire. Built-in rules are copied in on first visit. Tool allowlist → `/a/features`; exam-period policy note (P3) |
| `/a/logs` | 19 | Activity log (sign-ins, feature/model/quota/user changes, tutor publish/unpublish/delete, policy and safety actions, essay returns, exports). Filter by action and date range, CSV export (UTF-8 BOM, formula-safe) |

P2 notes:

- **Feature switches.** `studio`, `essay`, `create` and `youtube` are on for students and teachers after the upgrade (`npm run db:seed` turns them on once, then respects `/a/features`).
- **Safety.** Chat, studio, essay and Create Lab input all go through `checkSafety`. Flagged or blocked hits open a case in `/a/safety`; blocked input never reaches the model.
- **Session revocation.** Logout stores the session's `jti` in `revoked_sessions`, so a copied cookie stops working right away (see `CHANGELOG-P1-FIX.md`).
- **Still locked:** P3–P6 modules (practice, assignments, classes, question bank, wrong-answer book, progress, scan, videos …).

## Architecture notes

- **Auth.** bcrypt-hashed passwords, HS256 JWT in an httpOnly cookie (`jose`). `src/proxy.ts` (Next 16's renamed middleware) handles the coarse gate: redirect to `/login`, role prefix (`/s`, `/t`, `/a`), `/` → role home. The data-access layer (`src/lib/auth/dal.ts`) re-checks the user on every request (still exists, not disabled, role unchanged, `tokenVersion` matches for "log out all devices"). Every server action and route handler authorizes itself.
- **AI.** `POST /api/chat` loads or creates the conversation, checks features, model whitelist and quota (429 when exhausted), runs a minimal safety filter, builds the system prompt (school policy + tutor strategy + RAG excerpts + draft/page context), then streams plain text from OpenRouter SSE. When the stream ends (or is aborted) it saves the answer and records token usage, using the provider-reported count when available. Image generation uses the configured image model (non-streaming).
- **Quotas** are counted in our own DB (`usage` table, per user per day) against role limits or a per-user exception. They are checked on every request; nothing depends on OpenWebUI.
- **RAG (P1).** Text files (`.txt .md .csv .html .json .tex`) are chunked into `tutor_chunks` and retrieved with keyword scoring (Latin words + CJK bigrams). PDF/Word are stored but marked "unsupported" until a parser lands in P2.
- **i18n.** `src/lib/i18n/dict.ts`; zh-Hant is the source and the `en` table must provide every key (type-checked). The language comes from the user's profile, or a cookie on the login page.
- **Rendering.** Next 16 enables Cache Components by default in new apps. It's turned off here because every page is per-user, so the app uses classic dynamic rendering.

## Known P1 limitations

- SSO/OIDC is UI-only; it needs the school's IdP settings at deployment.
- The safety filter is keyword/regex based (managed in `/a/policies`); there is no ML classifier.
- TTS and voice input use the browser's Web Speech APIs.
- Attachments in chat are text files only (inlined into the prompt).
