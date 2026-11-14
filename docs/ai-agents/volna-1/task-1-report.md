# Task 1 report

Status: DONE_WITH_CONCERNS. Commit 684192a "chore: каркас Next.js, docker для БД, vitest и playwright".

## Implemented
- Scaffold: create-next-app@16.4.5 in a temp sibling folder, files moved in, temp folder removed. Its README, .git and .gitignore were not kept; its .gitignore entries were merged. `AGENTS.md` from create-next-app is kept (Next writes it itself).
- Exact pinned versions per the task. Extra: `@types/node@24.19.2` (vitest 5.1.0 peer conflicted with ^20), `server-only@0.0.1` (for later tasks), typescript 5.9.3, eslint 9.39.5 and @types/react* pinned exactly.
- `docker-compose.dev.yml`: db :5432 `nasvyazi` (volume), db-test :5433 `nasvyazi_test` (tmpfs), healthchecks.
- `.env.example` with all 8 variables; local `.env` copied from it (not committed, not read).
- `next.config.ts`: `output: "standalone"`, `poweredByHeader: false`.
- vitest: `vitest.config.mts`, `fileParallelism: false`, `server-only` aliased to `tests/setup/empty.ts`, `@` alias, loads `DATABASE_URL_TEST` from .env. `tests/setup/global.ts` only checks the DB connection.
- `playwright.config.ts`: projects mobile-360 and desktop-1280, webServer builds and starts on :3100, testDir `e2e`.
- Scripts: `dev | build | start | lint | test | test:e2e | db:up | db:generate | db:migrate | demo:reset`.
- CLAUDE.md "Команды" filled in.

## TDD evidence
- RED 1 (DB down, no env): `npm test` -> "Unhandled Error: Error: DATABASE_URL_TEST не задан (см. .env.example)" (globalSetup in main process did not see the env; fixed by setting process.env in the config).
- RED 2 (before db:up): `npm test` -> unhandled error from globalSetup (connection failure).
- GREEN after `npm run db:up` (both containers Healthy): `npm test` -> "Test Files 1 passed (1) / Tests 1 passed (1)", no warnings.
- `npm run build` -> success (routes / and /_not-found static). `npx eslint` -> clean.

## Next 16 conventions verified (node_modules/next/dist/docs)
- `middleware.ts` is deprecated and renamed to `proxy.ts` (root or src/), same functionality.
- `instrumentation.ts` (root or src/) exports `register()` and optional `onRequestError`.

## Concerns / deviations
- create-next-app generated `cacheComponents: true` and `partialPrefetching: true` in next.config.ts. I removed them: cacheComponents requires Suspense around all dynamic (DB/cookie) access and would break the build of later pages. Re-enable later only deliberately.
- vitest config named `vitest.config.mts`, not `.ts`: with `.ts` (CJS package) Vite prints a configLoader warning on every run.
- `db:migrate` -> `tsx scripts/migrate.ts`, `db:generate` -> `drizzle-kit generate`, `demo:reset` -> `tsx scripts/demo-reset.ts`: target files do not exist yet (later tasks), not run.
- `e2e/` directory does not exist yet; `test:e2e` not run. Chromium installed via `npx playwright install chromium`.
- Commit trailer uses "Claude Opus 5.5" per global-constraints.md; the session's attribution reminder says "Claude Sonnet 5.5". Controller should confirm.
- `docs/process/LOG.md` has uncommitted controller changes and `prompt-digital-dekanat.md` is untracked; both left untouched and not staged.
- `npm audit` reports vulnerabilities in the transitive tree; not addressed.
