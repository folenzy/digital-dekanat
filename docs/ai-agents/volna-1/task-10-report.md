# Task 10 report: Защитный слой запросов

**Status:** DONE_WITH_CONCERNS (the concerns are minor notes; nothing is blocked)
**Model:** Claude Opus 5.5. I checked the Next 16 docs in `node_modules/next/dist/docs` before writing anything: `02-guides/content-security-policy.md`, `03-file-conventions/proxy.md`, `01-getting-started/16-proxy.md`, `05-config/01-next-config-js/headers.md`, `04-functions/unstable_rethrow.md` and `connection.md`. I also read the nonce parser in Next itself: `dist/server/app-render/get-script-nonce-from-header.js`.

## Commits (feat/volna-1, not pushed)
- `a46e97f` fix(ui): знак на «О проекте» и 404 ведёт на главную по роли; 404 не падает при сбое БД
- `df5e5bf` feat(security): CSP, заголовки, редиректы

## What was implemented

### `src/proxy.ts` (Next 16 Proxy, Node runtime)

**Final CSP string (production).** The nonce is 16 random bytes in base64 (24 characters), new for every request:
```
default-src 'self'; script-src 'self' 'nonce-<nonce>' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
```
- This is exactly the string in the brief.
- In `next dev` only (`process.env.NODE_ENV === "development"`), `script-src` gets ` 'unsafe-eval'` added at the end. The CSP guide requires this for React's dev stack reconstruction. The production build never has it, which both the unit test and the e2e test check.

**How the nonce reaches Next.** This is the CSP guide's own pattern:
- `requestHeaders = new Headers(request.headers)`, then `requestHeaders.set("content-security-policy", csp)` and `set("x-nonce", nonce)`.
- `NextResponse.next({ request: { headers: requestHeaders } })`, then `response.headers.set("content-security-policy", csp)`.
- During SSR, Next parses the request's `content-security-policy` header (`getScriptNonceFromHeaders` takes the first `'nonce-…'` in `script-src`) and puts the nonce on all of its own `<script>` tags, both external chunks and inline flight scripts.
- `'strict-dynamic'` then also trusts the chunks those scripts load.
- `x-nonce` is set as the guide recommends, for a future `<Script nonce>`. Nothing reads it today.

**Anonymous redirect.**
- The rule: if the method is GET or HEAD, the path is not `/login` or `/about`, and `request.cookies.has(SESSION_COOKIE.name)` is false, the proxy answers `NextResponse.redirect(new URL("/login", request.url))`. That is a 307. Next turns a same-host `Location` into a relative one, so the header is `location: /login`.
- Only the cookie's presence is checked. Real auth stays in `requireStudent`/`requireStaff`. A cookie with no session still reaches the layout, which redirects to `/login?reason=expired`; the e2e covers this.
- Non-GET/HEAD requests are not redirected on purpose. A server action POST without a cookie must reach its own `require*()`, and that answers with a redirect the Next client understands. A 307 would make the browser re-POST the action to `/login`.

**Matcher:**
```ts
matcher: [{
  source: "/((?!api/|_next/|favicon\\.ico|icon\\.svg).*)",
  missing: [
    { type: "header", key: "next-router-prefetch" },
    { type: "header", key: "purpose", value: "prefetch" },
  ],
}]
```
- `/api/*` is never touched: SSE answers 401 itself, `/api/health` stays public, and `/api/internal/demo-reset` answers 404 without a token.
- All of `/_next/*` is skipped: static files, fonts (`/_next/static/media`), image optimisation, and HMR in dev.
- `icon.svg` and `favicon.ico` are skipped. The dots are escaped, so look-alike paths such as `/iconXsvg` still go through the proxy (a unit test covers this).
- `next/link` prefetches are skipped, as the guide recommends. They return RSC data, not documents, so they need neither a nonce nor a redirect.

### `next.config.ts`
`headers()` with `source: "/:path*"` sets four headers on every response: pages, the proxy's redirects, API, static files and `/icon.svg`.
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `X-Frame-Options: DENY`

Each header is defined only here and CSP only in the proxy, so no header is sent twice; the e2e checks that each one appears exactly once. HSTS is left to Caddy (Task 16).

### `src/app/layout.tsx`
The root layout now calls `await connection()` (the guide's "Forcing dynamic rendering"). Every page was already `ƒ`. This guarantees that a future page cannot quietly become static, which would serve scripts without a nonce that the browser then blocks.

### Task 14 follow-ups
- **`src/ui/nav.ts`:** `homeHref(role: ShellRole | null)`. A student gets `/`, staff get `/staff`, and an anonymous viewer gets `/login`.
- **`src/server/auth/viewer.ts`:** `getViewerForPublicPage()`. It wraps `getViewer()` in try/catch. A DB or session error gives `null` (treated as anonymous). Next's own control-flow errors (redirect, notFound, the dynamic-rendering signal) are rethrown with `unstable_rethrow`, so the page is not silently prerendered.
- **`src/app/not-found.tsx`:** uses both helpers. A DB failure now gives a working 404 page with the anonymous link instead of a crash.
- **`src/app/about/page.tsx`:** now async and uses both helpers. The logo leads staff to `/staff`, students to `/`, and anonymous visitors to `/login`. The «В кабинет» button is unchanged (`/login`, which already redirects a signed-in user home).

### Changes to existing e2e specs
- **`e2e/student.spec.ts`, «несуществующая страница»:** the test now signs in as Alina first. An anonymous visitor to an unknown address is now redirected to `/login` per the brief, which `security-headers.spec` covers.
- **`e2e/staff.spec.ts`, profile test:** added Irina → «О проекте» → the logo's href is `/staff` → back.

## Tests and results (final tree)
- **`npm test`:** Test Files **37 passed**, Tests **397 passed**. That is 381 before this task, plus 11 in `tests/proxy.test.ts`, 4 in `tests/auth/public-viewer.test.ts` and 1 in `nav.test.ts`.
- **`npx playwright test` (full suite, fresh build by the webServer, nothing reused):** **68 passed (1.7m)**. That is 54 existing plus 14 new (7 tests × 2 projects). Every existing spec fails on any console error, and they all passed under the CSP. That shows the CSP blocks no scripts, fonts, styles, images, server actions, prefetches or the SSE stream (the realtime toast test in `staff.spec` included).
- **`npx tsc --noEmit`:** exit 0. **`npx eslint .`:** exit 0.
- **`npm run build`:** `✓ Compiled successfully`, `ƒ Proxy (Middleware)`. Every page is `ƒ`; only `○ /icon.svg` is static.

### `e2e/security-headers.spec.ts` (each test runs at 360 and 1280)
Every test collects console errors and `securitypolicyviolation` events.
1. **`/login`:**
   - The CSP equals the policy above character for character, so it has no `'unsafe-eval'`.
   - The four headers appear exactly once each.
   - Every `<script>` tag in the raw HTML carries `nonce="<the header's nonce>"`.
   - A second request gets a different nonce.
2. **Signed-in pages:**
   - Alina: `/`, `/schedule`, `/study`, `/dekanat`, `/dekanat/new`, `/notifications`, `/profile`.
   - Irina: `/staff`, `/staff/announcements`, `/staff/profile`.
   - On each page: status 200, the headers and the CSP. The page's `/api/events` stream answers 200; the client opens it only after hydration, which proves Next's scripts ran and `connect-src` allows SSE. Zero CSP violations.
   - Alina's `/about` logo leads to `/`.
3. **Injected-XSS simulation:**
   - `page.route` serves the real `/login` response with its headers, plus an inline `<script>window.__injected = true</script>` that has no nonce.
   - The browser blocks it: `__injected` stays undefined, there is exactly one violation `script-src-elem inline`, and the console logs the CSP message (expected here).
   - Next's scripts still work: the password toggle needs JS and it switches.
4. **Anonymous visitor:**
   - `/`, `/schedule`, `/study`, `/dekanat`, `/dekanat/<uuid>`, `/notifications`, `/profile`, `/staff`, `/staff/appeals/<uuid>`, `/staff/profile` and `/takoy-stranitsy-net` all return 307 with `location: /login`, and the redirect carries the security headers.
   - In the browser, `/schedule` and `/staff` land on «Вход в кабинет».
   - `/about` returns 200 with the CSP and its logo leads to `/login`.
   - `/icon.svg` and a `/_next/static/*.js` chunk return 200 (not redirected) with the security headers.
5. **Cookie present, session invalid:** the proxy lets the request through, and the layout sends the browser to `/login?reason=expired`.
6. **API:**
   - `/api/health` is not redirected (no 307, no `location`).
   - `POST /api/internal/demo-reset` without a token returns 404 with no redirect.
   - `/api/events` anonymously returns 401 with no redirect and with the security headers.
7. **Student on `/staff`:** HTTP 404 «Страница не найдена», and the 404 response carries the CSP.

### `tests/proxy.test.ts` (Vitest, `next/experimental/testing/server`)
- **Matcher** (`unstable_doesMiddlewareMatch`; the docs say `unstable_doesProxyMatch`, but 16.4.5 exports the middleware name):
  - matches pages, `/` and unknown paths, and the look-alike paths `/apixyz`, `/iconXsvg`, `/faviconXico`;
  - does not match `/api/*`, `/_next/static|image`, `icon.svg(?…)`, `favicon.ico`, or prefetch headers.
- **CSP:**
  - the exact string;
  - the nonce has the form `^[A-Za-z0-9+/]{22}==$`;
  - the same CSP and nonce reach the render through the `x-middleware-request-*` overrides;
  - 20 calls give 20 unique nonces;
  - `'unsafe-eval'` appears only when `NODE_ENV=development`.
- **Redirect:**
  - anonymous page requests go to `/login`, and the query string is not kept;
  - `/login`, `/login?reason=expired` and `/about` are open;
  - POST is not redirected; HEAD is;
  - with a cookie the request passes;
  - under `COOKIE_SECURE=true` it is `__Host-ns_session` that counts, not `ns_session`.

### TDD evidence
- **Proxy unit tests:**
  - RED: `npx vitest run tests/proxy.test.ts` → `Error: Cannot find package '@/proxy'` (no tests ran). Expected, because the module did not exist.
  - GREEN, first run: `11 passed`, after I fixed my own assertion. NextURL writes `127.0.0.1` as `localhost`, so the test now compares the redirect's path, not its host.
  - A second RED during self-review: adding look-alike paths gave `AssertionError: /iconXsvg: expected false to be true`, because of the unescaped dots. I escaped the matcher → `11 passed`.
- **E2E:**
  - RED: before `proxy.ts`/`next.config.ts` existed, `npx playwright test e2e/security-headers.spec.ts --project=desktop-1280` → `7 failed` (no `nosniff`, CSP length 0, no 307, the injected script ran, and so on). For that run I moved `tests/proxy.test.ts` aside, because `next build` type-checks it and `@/proxy` was missing; then I put it back.
  - One of those 7 failures was a race in my own test: the open shell's LiveEvents reconnected after I changed the cookie and called `location.assign("/login?reason=expired")`. I fixed the test by going to `/about` (no stream there) before changing the cookie.
  - GREEN: 14 passed, then the full suite **68 passed**.
- **`homeHref` / `getViewerForPublicPage`:**
  - RED: `TypeError: homeHref is not a function` and `getViewerForPublicPage is not a function` (5 failed).
  - GREEN: 10 passed.

### Extra checks (manual, not committed)
- **Encoded and dot-segment paths:** I probed with `curl --path-as-is`: `/_next/../login`, `/_next/%2e%2e/login`, `/api/%2e%2e/login`, `/api/../login`, `/%5Fnext/static/../../login`, `/icon.svg/../login`. Each came back 200 HTML **with** the CSP, because Next normalises the path before matching. `//login` and `/login/` give a 308 to `/login`.
- **`next dev`:** the CSP carries `'unsafe-eval'`.
  - Against `next dev`: `student.spec` passed 9/9 and `dekanat.spec` 8/9. Neither showed a CSP violation.
  - The dekanat failure is a test race: `goto("/login")` was aborted by LiveEvents' 401 → `location.assign`.
  - `staff.spec` fails its first test the same way every time in dev. It clicks the department chip before the «Новые» navigation has committed, so the URL is `?tab=closed&dept=1`. It logged no console errors.
  - In dev, `security-headers.spec` fails by design, because it asserts the exact production policy without `'unsafe-eval'`.
  - Everything passes on the production build. These dev-only races existed before this task: `/api/events` and client navigation do not go through the proxy.

## Files
- **New:** `src/proxy.ts`, `tests/proxy.test.ts`, `tests/auth/public-viewer.test.ts`, `e2e/security-headers.spec.ts`.
- **Modified:** `next.config.ts`, `src/app/layout.tsx`, `src/app/not-found.tsx`, `src/app/about/page.tsx`, `src/server/auth/viewer.ts`, `src/ui/nav.ts`, `tests/ui/nav.test.ts`, `e2e/student.spec.ts`, `e2e/staff.spec.ts`.
- The e2e runs regenerated the `02/03/04-*` screenshots with new timestamps only. This task changes no UI, so I restored them with `git checkout -- docs/screenshots`.
- `prompt-digital-dekanat.md` (untracked, the user's file) was not touched.

## Self-review findings (fixed)
- The matcher's dots were unescaped (`favicon.ico` would also have skipped `/faviconXico`). I escaped them and added a test.
- A try/catch around `getViewer()` would have swallowed Next's dynamic-rendering signal at build time, letting a page be prerendered as anonymous. I added `unstable_rethrow`, and a test shows a redirect error is rethrown.
- Static headers live only in `next.config.ts` and CSP only in the proxy. That avoids duplicates such as `DENY, DENY`, which browsers reject; the e2e asserts exactly one of each.

## Concerns / notes for the controller
1. **`/api/health` does not exist yet** (the plan creates it in Task 16), so today it returns 404. The e2e only checks that it is **not redirected**. Once Task 16 adds the route, it could also assert `200 {"ok":true}`.
2. **Some HTML 404s have no CSP:** `/api/<unknown>`, `/_next/<unknown>`, `/favicon.ico` (no such file exists). These are outside the matcher by design (the brief says API answers for itself and static files are skipped). They echo nothing from the request and still carry nosniff, XFO and the other headers. **Optional hardening, if wanted:** a fixed `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` for `/api/:path*` in `next.config.ts`. It would not collide with the proxy, because the proxy never runs on `/api`. I did not add it because the brief asks for exactly one policy.
3. **`object-src 'none'`** (which the Next guide includes) is not in the brief's policy. `default-src 'self'` already limits plugins to same-origin. It is a one-word addition if the controller wants it.
4. **Two dev-only test races** existed before this task (details above): `staff.spec` department chip, and `goto("/login")` versus LiveEvents' `location.assign`. Both pass on the production build that e2e uses.
5. **Task 13's carry** ("not-found under (student) returns HTTP 200, could check malformed ids in the proxy") was not in this dispatch, and I did not implement it.

## Interfaces later tasks can rely on
```ts
// src/proxy.ts — Next 16 Proxy
export function proxy(request: NextRequest): NextResponse;   // CSP+nonce or 307 → /login
export const config: { matcher: [...] };                       // skips /api/, /_next/, favicon.ico, icon.svg, prefetch

// src/ui/nav.ts
export function homeHref(role: ShellRole | null): string;     // "/" | "/staff" | "/login"

// src/server/auth/viewer.ts
export async function getViewerForPublicPage(): Promise<Viewer | null>; // never throws app errors; not for authorization
```
- **Request headers available to server components:** `x-nonce` (the nonce) and `content-security-policy`.
- **Task 16 (Caddy):** keep the app's headers (Caddy should add HSTS, not replace these). `flush_interval -1` for `/api/events` is unaffected, because the proxy does not touch `/api`.

## Addendum: controller rulings 2 and 3 (commit `b4d628b`)

**Changes**
- **`src/proxy.ts`:** the CSP now includes `object-src 'none'`, in both production and `next dev`. The final production string is:
  `default-src 'self'; script-src 'self' 'nonce-<nonce>' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
  In dev, `'unsafe-eval'` is still added at the end of `script-src`.
- **`next.config.ts`:** the `/api/:path*` rule sets `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`.
  - The proxy never runs on `/api`, so API responses get exactly one CSP.
  - Probed with `curl --path-as-is`: `/api/events` 401 and `/api/nope` 404 get the API CSP once. Dot-segment paths like `/api/../login`, `/api/%2e%2e/login` and `/api/%2E%2E/about` are normalised to pages and get only the page CSP. No response anywhere had two CSP headers.
- **`e2e/security-headers.spec.ts`:**
  - The page policy now includes `object-src 'none'`.
  - The new helper `expectApiCsp` asserts exactly one API CSP on `/api/health`, on `POST /api/internal/demo-reset` (404) and on `/api/events` (401). Those three also get the four security headers checked.
  - It also asserts the API CSP on the live SSE response (200) of every cabinet page in the «кабинеты» test, and that test still sees zero violations. The EventSource keeps working, because it obeys the page's `connect-src`, not the CSP of its own response.
- **`tests/proxy.test.ts`:** updated to the new policy string.

**TDD**
- RED, unit: `npx vitest run tests/proxy.test.ts` → 2 failed (exact-CSP and dev-CSP).
- RED, e2e: `npx playwright test e2e/security-headers.spec.ts --project=desktop-1280` on the old build → 5 failed. The errors were the missing `object-src 'none'` and no CSP on `/api/health`.
- GREEN, unit: 11 passed.

**Verification (final tree)**
- `rm -rf .next`, then `npx playwright test` with a fresh build by the webServer → **68 passed (1.8m)**. The realtime SSE test «справка готова… без перезагрузки» passes at 360 and 1280.
- `npx tsc --noEmit` exit 0. `npx eslint .` exit 0. `npm run build` exit 0 (`ƒ Proxy (Middleware)`).
- `npm test` → 397 passed in 5 of 7 full runs.

**Pre-existing flake, not caused by this task**
- In 2 of the 7 full runs, `tests/appeals/limits.test.ts` › «20 одновременных запросов при лимите 5» failed with `expected 0 to be greater than 0` at line 51: no concurrent request got through.
- Run alone, the file passed 8 of 8 times.
- Neither that test nor `src/server/limits.ts` is touched by Task 10. It is probably the unexplained flaky test from Task 8 in progress.md, and it fails safe (it rejects rather than lets requests through). Suggest the final review looks at it.

The e2e runs rewrote the screenshots again; I restored them with `git checkout -- docs/screenshots`.
