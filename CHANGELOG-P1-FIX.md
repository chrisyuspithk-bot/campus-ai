# P1 fix — basePath redirects, HTTP cookie, logout, chat client

Demo: `http://188.245.12.100:3060/campus-ai` (basePath `/campus-ai`, plain HTTP).

## Root causes
- The demo was serving a stale build (10:55); later source fixes (e.g. `withBase()` in the chat client
  and logout forms) had never been rebuilt.
- Next 16 only adds basePath to `redirect()` during rendering. For a no-JS server-action post
  the 303 `Location` is the raw argument (`/s`), and route handlers resolve a relative `Location`
  against the bind address (`http://0.0.0.0:3060`).
- The cookie was `Secure` whenever `NODE_ENV=production`, including on plain HTTP.
- Session JWTs were stateless: logout cleared the cookie, but a copy of the token still worked.

## Changes
- **`src/lib/app-url.ts` (new)**: `publicUrl()` / `absoluteUrl()` build absolute URLs from
  the `APP_URL` origin + basePath (falling back to the request host). `appRedirect()` is the
  basePath-safe replacement for `redirect()`. `secureCookies()` is true only for an https `APP_URL`.
- **Redirects**: the proxy (unauthenticated → `/campus-ai/login?next=…`, logged-in `/login` → home,
  role guards), the login action, `requireUser()`, `/`, logout-all-devices and the teacher
  draft/tutor actions all redirect to absolute `/campus-ai/...` URLs.
- **Cookie**: `campus_session` is `Secure` only when `APP_URL` is https.
- **Logout**: `/campus-ai/api/auth/logout` (GET/POST) revokes the session's `jti` server-side
  (new `revoked_sessions` table, migration `0002_session_revocation`), clears the cookie and
  303s to `http://188.245.12.100:3060/campus-ai/login`. A replayed old cookie now gets
  307 → logout → login on pages and 401 on APIs.
- **Session JWTs** now carry a `jti`. Tokens issued before this change have no `jti`, so they are
  rejected and users must sign in again once.
- **Unprefixed client URLs**: the chat client (`withBase("/api/chat")`), logout forms, the
  top-bar search form (`/campus-ai/search`) and the tutor preview link now include basePath.
- Added missing `f.note.youtube` / `f.note.essay` i18n keys (they came from the in-progress P2
  work and broke `next build`).

## Deploy
```bash
npm run db:seed      # applies migration 0002; skips seeding because data already exists
npm run build
next start -p 3060 -H 0.0.0.0   # .env.local: APP_URL=http://188.245.12.100:3060/campus-ai
```

## Verified (live demo, Playwright + curl)
For each of s123, t09 and admin (password demo1234), with all checks passing:
- Login lands on `/campus-ai/s|t|a` with a 200 response. The cookie is stored without `Secure`.
- The role guard and logged-in `/login` redirect to the user's own `/campus-ai/<home>`.
- Chat sends `POST /campus-ai/api/chat` and gets a 200.
- Logout from the UI goes to `/campus-ai/login` and clears the cookie. Revisiting the home page
  redirects to `/campus-ai/login?next=…`.
- Replaying the old cookie: the page returns 307 (not 200) and the API returns 401.
- No 404s occurred during the run.
- No-JS login from `/campus-ai/me` redirects 307 → `/campus-ai/login?next=%2Fme`, then 303 → `/campus-ai/me`.
