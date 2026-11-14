# Task 4 report — Аутентификация, сессии, лимит попыток

**Status:** DONE_WITH_CONCERNS (concern 1, the Viewer id types, needs the controller to acknowledge it)
**Base:** 7e0c748 · **Commits:**
- `28dabdd` fix(demo): токен сброса сравнивается по sha-256, тест addWorkingDays на полночь МСК
- `91c1a5e` feat(auth): argon2id, сессии в БД, лимит попыток

## What was implemented
- `src/server/auth/session.ts`: the token is 32 random bytes in base64url. Only its sha-256 hex goes in `sessions.token_hash`. TTL is 7 days. `getSessionUser` deletes an expired session and returns null. It updates `last_seen_at` at most once per minute. `createSession` also deletes that user's already-expired sessions. The user-agent is cut to 256 characters.
- `src/server/auth/rate-limit.ts`: keys `pair:<login lowercased>|<ip>` and `ip:<ip>`. The window is 15 minutes, with limits of 5 per pair and 30 per IP. There is no lock by login alone. The check reads the limit-th most recent failure in the window. `retryAfterSec` is the time until that failure leaves the window. When the count equals the limit, that is the oldest failure in the window. If concurrency pushes the count over the limit, this is still the moment the key frees up again. Attempts made while blocked are not recorded and do not extend the block. A success deletes only that pair's failures; the IP counter stays. Each recorded failure also prunes rows older than the window. `clientIp(headers)` takes the first `x-forwarded-for` address if it passes `net.isIP`, else `x-real-ip` if it passes `isIP`, else `'unknown'`. Junk values never reach the key.
- `src/server/auth/login.ts`: `login()` trims and lowercases the login, then checks the limit before any DB or password work. Unknown logins and users with `password_hash = null` are still checked with `verifyPassword` against a lazily created dummy argon2id hash. Users with `login = null` cannot be found by login at all. Wrong password and unknown login give the same `{ok:false, error:'invalid'}`. User messages: `LOGIN_INVALID_MESSAGE` = «Неверный логин или пароль»; `rateLimitedMessage(sec)` = «Слишком много попыток, попробуй через N мин», with N = ceil(sec/60) and at least 1.
- `src/server/auth/viewer.ts`: types `Viewer`, `StudentViewer` and `StaffViewer`. `viewerForUser(userId)` is a pure DB lookup. For a student it joins `students` and `groups` to get studentId, groupId, facultyId and course. For staff it returns staffId and departmentIds sorted ascending. It returns null for an unknown user or one with no profile. `getViewer`, `requireStudent` and `requireStaff` work like this:
  - Without a cookie they `redirect('/login')`.
  - With a cookie but no valid session they `redirect('/login?reason=expired')`.
  - For the wrong role they call `notFound()`.
  - `cookies()` → session → viewer resolution is wrapped in React `cache()`, so it runs once per render.
- `src/server/auth/cookie.ts` (**new file, not in the plan's list**): `SESSION_COOKIE`. It has no dependencies, so Task 10's `proxy.ts` can import the cookie name without pulling in the db client or `server-only`.
- `src/app/(auth)/login/actions.ts` (`"use server"`): `loginAction` validates with zod: login trimmed, 3–64 characters; password 1–128 characters. It reads the IP via `clientIp(await headers())`, then sets the cookie with `SESSION_COOKIE` and the session expiry. It redirects to `/staff` for staff and `/` for students. `logoutAction` deletes the session row and clears the cookie with the same attributes, including Secure, so the browser accepts the deletion of a `__Host-` cookie. It then redirects to `/login`.
- Task 3 follow-ups:
  - (a) `tests/time.test.ts`: `addWorkingDays(2026-11-06T21:30Z, 1)` → `2026-11-09T15:00:00.000Z`.
  - (b) `demo-reset/route.ts` now runs `timingSafeEqual` on the sha-256 digests of both tokens. The lengths are always equal, so there is no length branch.

## Interfaces for later tasks (exact)
```ts
// src/server/auth/viewer.ts   (import "server-only")
export type StudentViewer = { userId: string; role: "student"; studentId: number; groupId: number; facultyId: number; course: number };
export type StaffViewer   = { userId: string; role: "staff"; staffId: number; departmentIds: number[] };
export type Viewer = StudentViewer | StaffViewer;
export async function viewerForUser(userId: string): Promise<Viewer | null>;
export async function getViewer(): Promise<Viewer | null>;
export async function requireStudent(): Promise<StudentViewer>; // no cookie → /login; dead session → /login?reason=expired; staff → notFound()
export async function requireStaff(): Promise<StaffViewer>;     // same, student → notFound()

// src/server/auth/session.ts  (import "server-only")
export type Role = "student" | "staff";            // (typeof roleEnum.enumValues)[number]
export type SessionUser = { userId: string; role: Role };
export const SESSION_TTL_MS: number;               // 7 days
export async function createSession(userId: string, userAgent?: string | null, now?: Date): Promise<{ token: string; expiresAt: Date }>;
export async function getSessionUser(token: string, now?: Date): Promise<SessionUser | null>;
export async function destroySession(token: string): Promise<void>;

// src/server/auth/login.ts    (import "server-only")
export type LoginResult =
  | { ok: true; token: string; role: Role; expiresAt: Date }
  | { ok: false; error: "invalid" }
  | { ok: false; error: "rate_limited"; retryAfterSec: number };
export const LOGIN_INVALID_MESSAGE: string;        // «Неверный логин или пароль»
export function rateLimitedMessage(retryAfterSec: number): string; // «Слишком много попыток, попробуй через N мин»
export async function login(loginName: string, password: string, ip: string, now: Date, userAgent?: string | null): Promise<LoginResult>;

// src/server/auth/rate-limit.ts (import "server-only")
export const LOGIN_WINDOW_MS: number; export const PAIR_LIMIT: 5; export const IP_LIMIT: 30;   // (typed as number)
export function clientIp(headers: Headers): string;
// (fix round 1: replaced checkLoginLimit/recordLoginFailure/clearLoginFailures, see Fix report 1)
export type LoginAttempt = { pair: string; pairId: number; ipId: number; now: Date };
export type AttemptStart = { limited: true; retryAfterSec: number } | { limited: false; attempt: LoginAttempt };
export async function beginLoginAttempt(login: string, ip: string, now: Date): Promise<AttemptStart>;
export async function failLoginAttempt(attempt: LoginAttempt): Promise<void>;
export async function succeedLoginAttempt(attempt: LoginAttempt): Promise<void>;

// src/server/auth/cookie.ts   (no deps; safe for proxy.ts)
export const SESSION_COOKIE: {
  readonly name: string;  // "__Host-ns_session" if COOKIE_SECURE === "true", else "ns_session"
  options(expires: Date): { httpOnly: true; sameSite: "lax"; path: "/"; secure: boolean; expires: Date };
};

// src/server/auth/password.ts (from Task 3, unchanged)
export function hashPassword(password: string): Promise<string>;
export async function verifyPassword(hashed: string, password: string): Promise<boolean>;

// src/app/(auth)/login/actions.ts ("use server")
export type LoginFormState = { error: string } | null;
export async function loginAction(_prev: LoginFormState, formData: FormData): Promise<LoginFormState>; // fields: login, password
export async function logoutAction(): Promise<void>;
```
Task 12 usage: `const [state, action, pending] = useActionState(loginAction, null)` in a client form with `name="login"` and `name="password"`, and render `state?.error`. Logout: `<form action={logoutAction}><button>Выйти</button></form>`.

## Deviations from the brief (please acknowledge)
1. **Viewer ids are `number`, not `string`.** The brief's types say `studentId/groupId/facultyId/staffId: string` and `departmentIds: string[]`. Task 2 created all of these as integer identity PKs; only `users.id` is a uuid, so `userId: string` is kept. String ids would force every later task to convert, as in `eq(students.id, Number(v.studentId))`, and TS would reject `appeal.studentId === viewer.studentId`. Later task briefs should use `number`.
2. **`loginAction(prevState, formData)`, not `loginAction(formData)`.** The Next 16 forms guide says a function used with `useActionState` receives `prevState` first. Task 12 needs `useActionState` for the pending button and the error text, and passing the action directly keeps the form working without JS.
3. **`login()` and `createSession()` take extra optional parameters.** `login()` takes an optional `userAgent`. `createSession` and `getSessionUser` take an optional trailing `now` (default `new Date()`), per the global "time-dependent functions accept `now`" rule. The `ok` result also includes `expiresAt` for the cookie.
4. Extra file `src/server/auth/cookie.ts`, for the reason given above.

## Tests and results
New files: `tests/auth/session.test.ts` (8), `login.test.ts` (12), `login-timing.test.ts` (3), `viewer.test.ts` (4), `cookie.test.ts` (2), `client-ip.test.ts` (3); plus one new assertion in `tests/time.test.ts`.

The brief's Step 1 cases are all covered:
- success;
- wrong password and unknown login give an identical `invalid`;
- the 6th attempt from a pair returns `rate_limited` with `retryAfterSec: 600`, even with the correct password;
- the same login from another IP still signs in, and so does another login from the same IP;
- `token_hash` is sha-256 and the raw token appears nowhere in the `sessions` dump;
- an expired session returns null and is deleted;
- login-less students (`login = null`) and a user with a login but `password_hash = null` cannot sign in.

Also covered:
- IP limit of 30, and other IPs still work;
- blocked attempts don't extend the block, and sign-in works again after the window;
- success resets the pair counter;
- logins are case-insensitive;
- `last_seen_at` throttling;
- `destroySession`;
- user-agent truncation;
- `viewerForUser` for Alina, Denis, Irina, an unknown user and a user without a profile;
- the cookie name and options for each `COOKIE_SECURE` value;
- `clientIp` parsing and junk values;
- `login-timing.test.ts` spies on the real `verifyPassword` with `vi.mock` passthrough. It checks that an unknown login and a hash-less user each call it exactly once with a `$argon2id$` hash, and that a blocked pair never calls it.

**Mutation checks** (temporary edits, reverted):
- Skipping the dummy verify → 2 failures in `login-timing.test.ts`.
- Making the pair key login-only → 2 failures in `login.test.ts`, including the "нет DoS по логину" test.

### TDD evidence
- RED: `npx vitest run tests/auth` →
  ```
  FAIL tests/auth/client-ip.test.ts  Error: Cannot find package '@/server/auth/rate-limit'
  FAIL tests/auth/cookie.test.ts     Error: Cannot find package '@/server/auth/cookie'
  FAIL tests/auth/login-timing.test.ts / login.test.ts  Error: Cannot find package '@/server/auth/login'
  FAIL tests/auth/session.test.ts    Error: Cannot find package '@/server/auth/session'
  FAIL tests/auth/viewer.test.ts     Error: Cannot find package '@/server/auth/viewer'
  Test Files  6 failed (6)
  ```
  This is the expected failure: none of the modules existed yet.
- The first GREEN run had 1 failure, and it was a bug in the test, not the code. After `drizzle(testSql)`, the shared postgres.js client returns timestamptz as a string, so `.getTime is not a function`. I switched that assertion to a drizzle select.
- GREEN: `npx vitest run tests/auth` → `Test Files 6 passed (6) · Tests 32 passed (32)`.
- Full run: `npm test` → `Test Files 11 passed (11) · Tests 64 passed (64)` on the committed state. `npx tsc --noEmit` → exit 0; `npx eslint src tests` → exit 0; `npm run build` → success.
- The time test and the reset-route refactor are regression and refactor work, so they went green immediately. The existing reset-route tests, including the wrong-length token, stay green.

### Manual end-to-end check in the real app (temporary pages, not committed)
`actions.ts` isn't imported by any page yet, so `next build` alone wouldn't compile it. To check it, I added temporary pages: a `/login` page with a `useActionState` form, `/whoami` (requireStudent) and `/staff` (requireStaff). I seeded the **test** DB through `resetDemo` with the fixture passwords from the test files, then ran `next dev -p 3123` with `DATABASE_URL` set to the test DB and drove it in the browser:
- anonymous `/whoami` and `/staff` → 307 to `/login`;
- a garbage `ns_session` cookie → 307 to `/login?reason=expired`;
- wrong password → «Неверный логин или пароль»;
- Alina → redirect to `/`; the cookie is not visible to `document.cookie` (httpOnly); `/whoami` showed `{"role":"student","studentId":1,"groupId":1,"facultyId":1,"course":2,…}`; `/staff` → HTTP 404;
- the session row had a 64-char hash, a 7-day TTL and the user-agent; the pair failure was cleared and the `ip:` failure kept;
- logout → `/login`; the session row was deleted; `/whoami` then redirected to plain `/login`, so the cookie really was cleared;
- Irina → `/staff`, with `departmentIds [1,2,3]`; `/whoami` → 404;
- deleting all sessions (simulating the nightly reset) → `/staff` went to `/login?reason=expired`;
- 5 wrong attempts for Denis → «Неверный…» ×5, then the 6th → «Слишком много попыток, попробуй через 15 мин».

The dev log had no errors. Next's dev action logger prints FormData as `{}`, so passwords don't reach the log. A production `next build` with the temp pages in place also compiled the `"use server"` file, including its `export type`. Afterwards I deleted the temp pages, stopped the dev server, and rebuilt to regenerate `.next/types`. Nothing temporary was committed. The test DB is rebuilt by the tests themselves.

## Self-review findings (fixed)
- Removed an unused `ORDER BY` in the session test.
- Simplified an empty-login branch in `login()`: the query always runs, and an empty name simply matches nothing.

## Concerns / notes for later tasks
1. **Viewer id types**: see deviation 1. The controller should carry `number` into later briefs.
2. **XFF trust (Task 16 must verify).** `clientIp` trusts the first `x-forwarded-for` address, so the IP limits only hold when Caddy overwrites client-supplied XFF and the app port is not reachable directly. Otherwise an attacker can rotate a fake XFF and bypass the IP and pair limits.
   - Observed in dev: Next itself supplied XFF `::ffff:127.0.0.1`.
   - Task 16 should check Caddy's `reverse_proxy` header behaviour (`trusted_proxies`) and that the app container publishes no port.
3. **Rate-limit race (corrected in fix round 1).** The original wording was wrong. Check-then-record was not atomic, and the same hole existed for the IP limit. N parallel POSTs all passed both checks, so the "bounded by the IP limit" claim did not hold. This is now fixed by reserving the attempt before verification (see Fix report 1). At most `PAIR_LIMIT` and `IP_LIMIT` password checks per window are possible, even under concurrency.
4. `login_attempts.success` is never written as `true`, since only failures are recorded. The column stays for possible auditing.
5. Users at the start of a fresh process: the first unknown-login request pays for creating the dummy hash plus a verify (about 2× argon2). Every later request takes comparable time.
6. Spec §7.1 says «через N минут», but the plan and controller say «через N мин». I followed the plan.
7. React `cache` only dedupes within a render pass. In Server Actions every `requireStudent()` call queries again, which is expected per the Next docs.

---

## Fix report 1 — Important-1: check-then-act race in the login rate limit

**Problem (confirmed):** `checkLoginLimit` ran before the user lookup and argon2, and `recordLoginFailure` ran only after them. N parallel POSTs all passed both checks.

**RED** (new tests against the old code): `npx vitest run tests/auth/login.test.ts`
```
× 20 одновременных неверных попыток с одной пары: не больше 5 проверок пароля   AssertionError: expected 20 to be less than or equal to 5
× 40 одновременных попыток по разным логинам с одного IP: не больше 30 проверок пароля   AssertionError: expected 40 to be less than or equal to 30
× после неудач в окне параллельный всплеск добирает только остаток лимита   AssertionError: expected 10 to be less than or equal to 2
Tests  3 failed | 12 passed (15)
```
All 20, 40 and 10 attempts got through, which reproduces the hole for both the pair limit and the IP limit.

**Fix: option (a), reserve the attempt before verifying the password.** I chose it over advisory locks because it needs no transaction and doesn't hold a DB connection across argon2. It also doesn't serialize every login from a shared NAT IP.
- `rate-limit.ts`: `checkLoginLimit`, `recordLoginFailure` and `clearLoginFailures` are replaced by `beginLoginAttempt`, `failLoginAttempt` and `succeedLoginAttempt`.
  - `beginLoginAttempt(login, ip, now)` first inserts failure rows for the pair and IP keys, `RETURNING id, key`. Then, for each key, it reads up to `limit+1` failures in the window, own row included. If there are more than `limit`, the attempt is limited: it deletes its own two rows by id, so blocked attempts still don't extend the block. It returns `rate_limited`, with `retryAfterSec` taken from the `limit`-th most recent failure other than its own. Otherwise it returns the `attempt` with its row ids.
  - `failLoginAttempt(attempt)` keeps the reserved rows as recorded failures and prunes rows older than the window.
  - `succeedLoginAttempt(attempt)` deletes all failures for the pair key, plus only its own IP row by id. The IP counter is not reset by a success.
- `login.ts` runs: begin → (if limited, return) → lookup + `verifyPassword` (dummy hash for unknown or hash-less users) → fail or succeed → `createSession`. If anything throws after the reservation, the rows stay as failures, so it fails closed.

**Why the bound holds:** each statement autocommits under READ COMMITTED, and the count query starts after the request's own insert has committed. Take the requests that pass, ordered by the commit of their insert. The k-th one sees the k−1 earlier passing rows, which are never deleted while they are still failures, plus the persisted failures and its own row. So it can pass only if persisted + k ≤ limit, which caps password verifications per window at `limit` for each key.

The bound is strict, not exact: in a tight burst, attempts that would have been within the limit can also be rejected, because every in-flight reservation is counted. It fails closed and only affects the bursting pair or IP. A diagnostic run, not committed, of 3 rounds with the same `now` gave:
- pair burst: 0/20 `invalid` each round;
- IP burst: 1, 2 and 4 out of 40 `invalid`.

Sequential behaviour is unchanged and exact: the 6th attempt is limited with `retryAfterSec: 600`, attempts while blocked aren't counted, success resets the pair, and the IP limit is 30 with `retryAfterSec: 840`.

**New tests** in `tests/auth/login.test.ts`:
- 20 concurrent wrong attempts from one pair → at most 5 `invalid`, the rest `rate_limited`, and pair rows in the DB equal the `invalid` count;
- 40 concurrent attempts across different logins from one IP → at most 30 `invalid`, the rest `rate_limited`, and IP rows equal the `invalid` count;
- 3 sequential failures followed by a burst of 10 → at most 2 `invalid`, and pair rows equal 3 + `invalid`.

**GREEN:**
- `npx vitest run tests/auth` → `Test Files 6 passed (6) · Tests 35 passed (35)`.
- `tests/auth/login.test.ts` repeated 5× → `15 passed (15)` every time.
- `npm test` → `Test Files 11 passed (11) · Tests 67 passed (67)`.
- `npx tsc --noEmit` → exit 0; `npx eslint src tests` → exit 0; `npm run build` → compiled successfully.

**Report corrections:**
- Concern 3 is reworded.
- The rate-limit interface block above is updated with the new exports.
- One correction to the "What was implemented" section: a success now also deletes its own `ip:` reservation row. Earlier IP failures stay.
