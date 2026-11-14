# Fix report: the rate limiter denies an entire burst (flaky test)

**Status:** DONE_WITH_CONCERNS (minor concerns, see the last section)
**Commit:** `c855a88` fix(limits): точный лимит действий под параллельными запросами
**Model:** Claude Opus 5.5

## 1. Reproduction (systematic-debugging, phase 1)

**Diagnostic 1.** I added temporary instrumentation to `reserveAction` that records the `n` each call saw, plus a temporary test file `tests/appeals/zz-diag-burst.test.ts`. Each round fires 20 concurrent `consumeAction(limit 5)` calls into an empty window. There were 20 rounds with a warm pool and 20 with a cold pool (`vi.resetModules` and `sql.end()` between rounds). Neither file was committed; both were removed with `git checkout` / `rm`.

```
WARM passed [3,1,1,0,0,1,0,0,0,0,2,0,0,1,0,0,0,0,0,1]   minN [4,2,2,12,12,4,8,10,7,10,3,9,12,3,14,8,12,12,11,4]
COLD passed [4,3,1,1,1,1,2,0,0,2,1,1,3,1,2,2,4,1,3,2]   minN [5,5,5,1,1,4,5,6,10,3,2,2,3,1,2,2,4,5,4,2]
WARM sample n seen: 4,5,5,7,8,9,11,15,15,16,16,16,16,18,18,18,18,18,19,19
```

- With a warm pool, 12 of 20 rounds let **0 of 20** through. With a cold pool, 2 of 20 did.
- **Not one round reached exactly 5**; the maximum was 4.
- In rounds with 0 passes, the smallest `n` seen was already above the limit, so every request counted the others' reservations.

**Diagnostic 2.** I ran the existing `tests/appeals/limits.test.ts` alone 15 times: **4 of 15 failed**. The brief's "passes when run alone" is wrong; it flakes alone too.

## 2. Root cause

The controller's hypothesis is confirmed.

- reserve-then-count with autocommitted statements counts every in-flight reservation in the window, including ones that will be deleted a moment later as rejections.
- Under a burst, the inserts get ahead of the counts. A request sees `n > limit` even when, once the others are rejected, it would have been within the limit.
- The upper bound (≤ limit) holds, but the lower bound does not: 0 passes is a normal outcome. The old test asserted `passed > 0`, hence the flake.

Same cause, two more places:

- **createAppeal, 15 parallel creates, limit 10.** RED gave 6 of 10 (the old test only checked `> 0`).
- **Double tap on the last available appeal** (9 of 10 used). Both requests reserve and both see 11 > 10, so **neither creates anything**. RED: `expected 15 to be 16`. This is the Task 6 review minor at the boundary.

## 3. Fix

`src/server/limits.ts` › `reserveAction`. The signature is unchanged and no caller changed. In one transaction:

1. `select pg_advisory_xact_lock(hashtext('limits'), hashtext(userId || ':' || action))`
2. count the `action_log` rows in the window
3. if `n >= limit`, return `null` (nothing is written, so a rejection does not extend the limit); otherwise insert and return `id`.

`consumeAction` and `releaseAction` are unchanged: `consumeAction` is still `reserveAction !== null`, and `releaseAction` is still a delete by id.

**Deadlock analysis:**
- **Separate key space.** The limiter uses the two-int lock form with first key `hashtext('limits')` = 482554876. createAppeal uses `hashtext('appeals:create')` = -176128724 (both checked in the DB), so the two never collide.
- **No lock held across connections.** `reserveAction` takes only its own lock and commits before anything else. All three callers call it outside a transaction: `createAppeal` (before its tx with the `appeals:create` lock), `runAppealAction` (before the tx with `FOR UPDATE`) and `createAnnouncement`. No connection holds one lock while waiting on another.
- **Pool exhaustion.** Pool max is 10, and a burst of 20 parks up to 10 transactions on the lock. The lock holder works only on its own connection and never waits for a second one, so the queue drains.

**createAppeal semantics stay correct:**
- The reservation commits before the tx.
- A duplicate is still caught by the advisory lock plus re-check, and its reservation is released.
- A double tap away from the boundary still gives one id and one `action_log` row (the existing test passes).
- At the boundary, exactly one appeal is now created. The second response is either the same appeal (if it ran after the first committed) or `rate_limited` (if it reserved before the first was created). Before the fix, both requests could get `rate_limited` and nothing was created.

## 4. TDD

**Production changes the tests are meant to catch:** (a) reserve-then-count with no lock means under-admission; (b) check-then-insert with no lock means over-admission.

**Tests:**
- `tests/appeals/limits.test.ts`:
  - «20 одновременных запросов при лимите 5: проходят ровно 5, записей столько же». 10 rounds per test, `passed === 5`, rows = 5.
  - New: «после 3 записей в окне всплеск из 10 при лимите 5 добирает ровно остаток». 10 rounds, `passed === 2`, rows = 5.
- `tests/appeals/student.test.ts`:
  - «15 одновременных разных обращений: создано ровно 10, остальные rate_limited». 5 rounds, each 2 h later than the last (outside the window); exactly 10 created, 5 × `rate_limited`, `action_log` = 10 per round.
  - New: «двойной тап на последнем доступном обращении: создаётся ровно одно». 5 rounds; 9 sequential creates, then 2 parallel identical ones. Exactly one row is added, `action_log` = 10, all ok responses share one id, and the rest are `rate_limited`.

**RED** (old code): `npx vitest run tests/appeals/limits.test.ts tests/appeals/student.test.ts -t "одновременн|всплеск|двойной тап"`
```
× 20 одновременных запросов при лимите 5 …          expected { round: 0, passed: 2 } to deeply equal { round: 0, passed: 5 }
× после 3 записей в окне всплеск из 10 …            expected { round: 0, passed: 1 } to deeply equal { round: 0, passed: 2 }
× 15 одновременных разных обращений …               expected { round: 0, created: 6 } to deeply equal { round: 0, created: 10 }
× двойной тап на последнем доступном обращении …    expected 15 to be 16
Tests  4 failed | 1 passed | 24 skipped
```
Every failure is under-admission, as expected.

**GREEN:** the same files after the fix → `Test Files 2 passed (2) · Tests 29 passed (29)`.
- Timing: burst 20×10 rounds in 509 ms; remainder in 365 ms; 15 parallel ×5 in 860 ms; boundary double tap ×5 in 1001 ms.

**Mutation check:** I disabled the lock line in the fix (`if (0) await tx.execute(...)`), giving check-then-insert, then restored the file from a copy.
```
expected { round: 0, passed: 14 } to deeply equal { round: 0, passed: 5 }
expected { round: 0, passed: 10 } to deeply equal { round: 0, passed: 2 }
expected { round: 0, created: 14 } to deeply equal { round: 0, created: 10 }
```
The tests catch over-admission as well, not just under-admission.

## 5. Stability and checks

| Check | Result |
|---|---|
| `tests/appeals/limits.test.ts` ×10 (each run already loops 10 rounds) | 0/10 failed (before the fix: 4/15) |
| `tests/auth/login.test.ts` ×8 | 0/8 failed |
| `npm test` run 1 | 37 files, 399 tests passed |
| `npm test` run 2 | 37 files, 399 tests passed |
| `npm test` run 3 | 37 files, 399 tests passed |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run build` | exit 0 |

## 6. Decision on the login limiter (`beginLoginAttempt`): leave as is

**Measurement.** A temporary diagnostic, not committed and deleted, ran 5 rounds with the same `now`:
- pair burst: **1, 2, 0, 0, 0** `invalid` out of 20 (limit 5);
- IP burst: **2, 8, 4, 2, 5** out of 40 (limit 30).

It fails closed, as Task 4 described.

**Why I did not change it:**
1. **It is an auth control, and it errs in the safe direction.** The upper bound ≤ limit is proven (the passer that counts last sees all the other passers' rows, plus its own). Exactness adds no security.
2. **Legitimate traffic does not hit it.** A false rejection needs more than 5 in-flight attempts for one login+IP, or more than 30 failures plus in-flight attempts for one IP. A rejection writes nothing, so it does not extend the block («попытки во время блокировки не продлевают её» holds).
3. **The endpoint is unauthenticated.** An exact scheme would need a transaction with two advisory locks (pair, then IP). The IP lock serializes every login reservation from one IP, and each waiter holds a pool connection (max 10). A flood from one address would park the pool on the lock and slow the whole application. The current lock-free scheme runs in parallel and does no argon2 work for rejected attempts.
4. **Its tests are deterministic.** They assert only the upper bound, `invalid + limited = N` and rows = `invalid`, so there is no flake (0/8 in the loop, 3/3 full runs green).

**Known cosmetic issue (not fixed):** under a burst, a rejected attempt can show «попробуй через 15 мин» even though nothing was recorded and it could retry at once. This only affects bursting clients.

## 7. Files

- `src/server/limits.ts`: `reserveAction` as one transaction with the advisory lock; doc comment updated.
- `tests/appeals/limits.test.ts`: exact count, repeated; new remainder test.
- `tests/appeals/student.test.ts`: 15 parallel → exactly 10, repeated; new boundary double-tap test.

## 8. Self-review and concerns

- **Interfaces unchanged:** `reserveAction(userId, action, limit, windowMs, now): Promise<number | null>`, `consumeAction(...): Promise<boolean>`, `releaseAction(id): Promise<void>`, `LIMITS`, `LimitSpec`. They must still be called outside a transaction.
- **Concern 1 (minor, perf).** Requests for one user+action are now serialized. Each takes about 2.5 ms (begin, lock, count, insert, commit; measured as 20×10 in 509 ms), so roughly 400 per second per pair. A flood from the public demo account would park up to 10 pool connections on the lock and add latency for others. The old scheme had no lock wait but also gave no exact limit. Acceptable for the prototype; possible mitigations are `SET LOCAL lock_timeout` or a rate limit in Caddy.
- **Concern 2 (Task 6 minor, partly fixed).** On a double tap at the limit boundary, the second response can still be `rate_limited` instead of the existing appeal. It is no longer possible for nothing to be created. A full fix would move the reservation inside the createAppeal transaction (`appeals:create` lock → `findDuplicate` → reservation in the same tx, lock order appeals → limits). I did not do it: the brief requires keeping the `reserveAction`/`releaseAction` semantics of createAppeal, and this is a separate decision for the controller.
- I did not touch `prompt-digital-dekanat.md` (an untracked file in the repo root).
