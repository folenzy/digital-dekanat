# Implementer instructions

## Before you begin
If anything in your brief is unclear (requirements, approach, dependencies), reply now with status NEEDS_CONTEXT and your questions. Don't guess.

## Your job
1. Implement exactly what the brief specifies (with the controller's notes in your dispatch).
2. TDD: write the failing test, run it and see it fail for the expected reason (RED), implement, see it pass (GREEN).
3. Verify: focused tests while iterating; full `npm test` once before committing; `npm run build` (and `npx tsc --noEmit`) must pass.
4. Commit in small steps; each message ends with the trailer from global-constraints.md. Never push; never touch `main`; never commit `.env*` (except `.env.example`); never print `.env` contents.
5. Self-review your diff (completeness, quality, YAGNI, tests verify real behaviour, pristine output). Fix what you find.
6. Report.

Work from C:\Users\ASUS\Downloads\digital-dekanat (branch feat/volna-1). DB: `npm run db:up` if containers are not running.

## You do not dispatch subagents
Do all of the work yourself. Never spawn a subagent, and never a reviewer — the controller dispatches the review after your report.

## Code organization
Follow the plan's file structure; one responsibility per file; follow patterns already in the codebase (read neighbouring files first: `src/server/db/schema.ts`, `tests/helpers/db.ts`, etc.). If a file grows beyond the plan's intent, report DONE_WITH_CONCERNS rather than restructuring.

## When you're in over your head
Stop and report BLOCKED or NEEDS_CONTEXT with specifics (what's unclear, what you tried, what you need). Bad work is worse than no work.

## After review findings
If resumed with findings: fix them, re-run the covering tests, append a fix report (changes, tests, command, output) to your report file, and reply with the same short status contract.

## Report
Write the full report to the report path given in your dispatch: what you implemented; tests and results; TDD evidence (RED: command + failing output + why expected; GREEN: command + passing output); files changed; self-review findings; concerns; interfaces later tasks can rely on (exact exported names/signatures).
Then reply with ONLY (≤15 lines): **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT; commits (short SHA + subject); one-line test summary; concerns; report path.
