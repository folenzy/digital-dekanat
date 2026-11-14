# Fix: rate limiter denies an entire burst (flaky test)

## Symptom
`tests/appeals/limits.test.ts` › «20 одновременных запросов при лимите 5» fails in ~2 of 7 full `npm test` runs with `expected 0 to be greater than 0` — none of 20 concurrent requests got through although the limit is 5. Passes when run alone. Seen as an "unexplained flaky test" since Task 8.

## Controller's hypothesis (verify, don't trust)
`consumeAction` in `src/server/limits.ts` uses reserve-then-count: insert own `action_log` row, count rows in the window including it, if over the limit delete own row and reject. Under a burst all 20 rows are inserted before any count runs, so every request sees ≥ 20 > 5 and rejects → 0 successes. Failing closed is safe for abuse, but a legitimate burst can be fully denied, and the «двойной тап» idempotency path at the limit boundary is affected (Task 6 review minor).

## Required outcome
- Exact limit under concurrency for `consumeAction`: of N concurrent calls with limit L and an empty window, exactly min(N, L) succeed. Suggested approach: one transaction per call — `pg_advisory_xact_lock(hashtext(userId || ':' || action))` (or two-int form), count in window, insert only if below limit. Keep `reserveAction`/`releaseAction` semantics used by createAppeal (Task 6) correct — read src/server/appeals/service.ts before changing.
- Decide (and justify in the report) whether the login limiter in `src/server/auth/rate-limit.ts` (Task 4: `beginLoginAttempt`) needs the same change. It currently fails closed under bursts by design; the Task 4 tests assert «не больше 5 invalid». If you change it, tests must assert exactness (exactly 5 invalid for 20 concurrent wrong attempts) and the «попытки во время блокировки не продлевают её» property must hold.
- Tests: make the concurrency tests assert exact counts and run them repeatedly (e.g. 10× loop inside the test or `--repeat`), so the flake cannot hide. Show RED (the exact-count test failing against current code) before the fix.
- Full `npm test` 3 times in a row green; tsc; eslint.
