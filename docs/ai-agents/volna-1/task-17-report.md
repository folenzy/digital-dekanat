# Task 17 report — security review, README, лицензии, документы для жюри

Implementer: Claude Opus 5.5. Base 639c1db → head 794487a (7 commits).

## Commits
- 5ccc32c fix(security): lock_timeout у лимитов, границы int4, лог публичного viewer
- ccda440 fix(deploy): /api/internal* целиком, umask 077 у бэкапа, trap в demo-reset
- 801ffca test(e2e): скриншоты только при SCREENSHOTS=1
- d7ee181 docs: README для жюри и LICENSES.md
- 15c4f8f test(e2e): CSRF — серверное действие с чужим Origin не выполняется
- 98ea892 docs: security review, TOOLS, ключевые промпты, снимок первого макета
- 794487a docs: DESCRIPTION.md для жюри

## Security review
Skill `security-review` failed at launch: it diffs against `origin/HEAD`, repo has no remote (`fatal: ambiguous argument 'origin/HEAD...'`). Did the review manually by its methodology on `git diff main...HEAD`; recorded honestly in SECURITY-REVIEW.md / DESCRIPTION.md / TOOLS.md.

Fixes (each RED → GREEN):
1. `src/server/limits.ts` reserveAction: `SET LOCAL lock_timeout = '2s'`; SQLSTATE 55P03 (walks `cause` chain) → `null` (fail closed). Test in `tests/appeals/limits.test.ts`: other tx holds the advisory lock → null in 1.5–5 s, no row. RED: test hung 15 s (timeout).
2. New `src/server/db/ids.ts` (`PG_INT_MAX`, `dbId`, `isDbId`); used for `disciplineId` (types.ts), announcement `facultyId/groupId` (announcements.ts), `listQueue` departmentId (staff.ts). RED: `PostgresError: value "2147483648" is out of range for type integer` in 3 tests (student/staff/realtime). GREEN 58/58.
3. `getViewerForPublicPage`: `console.error` (message only) before `null`. Test spies console.error, asserts called and no cookie value. RED: called 0 times.
4. Caddy `respond /api/internal* 404`; 5. `backup.sh` `umask 077`; 6. `demo-reset.sh` `keeper=""` before trap. New `tests/deploy-config.test.ts` (static checks, RED 3/4 → GREEN). Caddy verified live in `caddy:2` container: `/api/internal`, `/api/internal/`, `/api/internal/demo-reset`, `/API/INTERNAL/…`, `/api/%69nternal/…`, `//api/internal/…` → 404; `/api/health` passes through. `sh -n` on both scripts OK.
7. Added `e2e/idor.spec.ts` CSRF test: replay Alina's real server action with her cookies and `Origin: https://evil.example` → status ≥ 400, no message; control with own Origin → passes. (Server logs Next's "Invalid Server Actions request" for the forged one — expected.)

Everything else from the deferred minors is listed as known limitations in `docs/process/SECURITY-REVIEW.md` (sessions growth/old session on re-login, IPv6 /128, lazy dummy hash, IP counter inflation, double-submit at limit boundary, SSE no per-user cap, markReadByHref GET, not-found 200, /_global-error without nonce, prefetch `missing` without CSP (argued not exploitable), untested concurrency races, probe retry backoff, APP_ORIGIN dead config, sslip.io LE + RU reachability not verified).

## e2e screenshots gate
`e2e/demo.ts`: `screenshotsEnabled()` (`SCREENSHOTS === "1"`), `shoot()` returns early otherwise; flow.spec toast snapshot gated too. Unit test `tests/e2e-screenshots.test.ts` (RED: not a function → GREEN). Command documented in CLAUDE.md and README. Confirmed: two full e2e runs left `docs/screenshots` untouched.

## Documents
- `README.md` (rewritten), `LICENSES.md` (prod deps from `npm ls --omit=dev --depth=0`, licenses read from each package.json; fonts OFL-1.1 with attribution from LICENSE; Lucide ISC; images node MIT / postgres PostgreSQL License / caddy Apache-2.0 — no license files inside the images, stated "по сайтам проектов"; dev deps; original logo).
- `docs/process/SECURITY-REVIEW.md`, `docs/process/TOOLS.md` (rewritten: skills, subagent roles × models × counts, tools), `docs/process/DESCRIPTION.md`.
- `prompts/01-brainstorm-dialog.md` (from LOG), `02-implementer-template.md`, `03-reviewer-template.md` (verbatim copies with a Russian header), `04-example-dispatch-task6.md` (marked as structure summary — the exact dispatch text was not stored), `05-fix-round-example.md` (T4 race with real RED output, T9 tab bypass, round table).
- New screenshot `docs/screenshots/00-mockup-style-options-1280.png` — rendered the original mockup HTML with Playwright; variant A heading shows the Cyrillic fallback (Fraunces failure).

Counts used (from ledger): 18 implementer runs (8 Sonnet: T1,2,3,5,7,8,9,15; 10 Opus: T4,6,10,11,12,13,14,fix-limits,16,17), 17 first reviews (14 Sonnet, 3 Opus: T4,6,10), 6 re-reviews, 6 fix rounds in 5 tasks (T4 1, T8 1, T9 2, T12 1, T15 1). Commit trailers on branch: Opus/Sonnet as recorded.

## Verification (after all changes)
- `npm test` → Test Files 42 passed (42), Tests 416 passed (416), exit 0.
- `rm -rf .next && npx playwright test` → 95 passed (5.9m), exit 0 (earlier run before the CSRF test: 93/93; `idor.spec.ts` alone 8/8).
- `npx tsc --noEmit` exit 0; `npm run lint` exit 0; `npm run build` Compiled successfully.
- Local prod compose (`docker compose -f deploy/docker-compose.yml up -d --build --wait`, existing local deploy/.env, not read): all healthy; via Caddy `/api/health` 200, `/api/internal` 404, `POST /api/internal/demo-reset` 404, `/login` 200 with CSP nonce + HSTS; `backup.sh` → new dump `-rw-------` (old dump from before the fix `-rw-r--r--`); `demo-reset.sh` → ok. Stack stopped afterwards (`stop`, volumes kept).

## Concerns / for the controller
- `docs/process/LOG.md` NOT edited (global constraint: controller-only). Controller should add a T17 entry (security-review skill failure + manual review, 6 fixes, CSRF test, results).
- Not verified: deploy to VPS, Let's Encrypt for sslip.io, access from Russia without VPN — marked ⚠️ in the DESCRIPTION checklist; README link is a placeholder.
- Untracked `prompt-digital-dekanat.md` in repo root is the user's file — left untouched, not committed.
- DESCRIPTION.md commit count "57" is as of this task; will drift with later commits.

## Fix round 1 (docs honesty) — 423fd31
- Important: DESCRIPTION.md «Честность исполнителей» and TOOLS.md TDD row — mutation proof only for T5 (owner filter removed → IDOR test failed, per LOG/task-5-report); T9 openly admitted no RED phase, no mutation.
- Minor 1: T12 round reworded in DESCRIPTION.md and prompts/05 table — review findings: unguarded e2e reset, pace logic in page untested, EmptyState «0» (refuted by implementer, re-review agreed); the «неуд» divergence is credited to the implementer's own first report + controller ruling.
- Minor 2: prompts/04 — staff 30/h limit raised by implementer as concern 1 («Decision needed», task-6-report.md:3, Fix report 1 ruling 120/h); FOR UPDATE / double-tap review wording kept, attributed to LOG.md:79 (only confirmed source).
- Minor 3: LICENSES.md — `@node-rs/argon2-win32-x64-msvc` 2.2.2 MIT (its package.json), `@node-rs/argon2-linux-x64-musl` 2.2.2 MIT (`npm view`, used in the Docker image; not installed locally). Corrected wording.
- Minor 4: commit count → «около 60».
Docs-only change; no code touched, tests not re-run.
