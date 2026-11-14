# Task 6 report: Обращения — студент и сотрудник, SLA, события, лимиты

**Status:** DONE_WITH_CONCERNS (concerns 1 and 2 need a controller decision; the rest are notes)
**Base:** 2649b3b · **Commits:**
- `e048e3a` feat: частотные лимиты действий и публикация событий realtime
- `6a005ab` feat(appeals): обращения, маршрутизация, SLA, действия сотрудника

## What was implemented
- `src/server/limits.ts`. `reserveAction` follows the reserve-then-count pattern: it inserts the `action_log` row, then counts the rows in the window, its own row included. If the count is over the limit, it deletes its own row and returns null. Each statement autocommits, so the Task 4 bound argument applies here too. `consumeAction` is the boolean wrapper the ruling asked for. `releaseAction(id)` hands a reservation back when the action does not happen: a duplicate create, `not_found`, `bad_transition`, `closed` or `validation` after the lock. `LIMITS`: appeals 10/hour, messages 30/hour per user.
- `src/server/realtime.ts`. `publish(userIds, event)` deduplicates the ids, then sends one `select pg_notify('ns_events', $payload)` with `{userIds, event}`. It throws if the payload is over 7900 bytes, and does nothing when there are no recipients.
- `src/server/appeals/`:
  - `types.ts`. Task 3's `APPEAL_TYPES` is kept unchanged. Added: `isAppealTypeCode`, which uses `Object.hasOwn` so `constructor` and `__proto__` are rejected; input schemas; view types; `APPEAL_TEXT_LIMITS`.
  - `result.ts`. `Result<T>`, `ok`, `fail`, `isUuid`, and Russian field errors (`fieldErrorsOf`, `fieldError`).
  - `sla.ts`. `slaDueAt`, `slaDueForType`, `isAppealOverdue`, `SLA_RUNNING_STATUSES`. No DB access, so it is safe to import on the client.
  - `access.ts`. `studentScope` and `staffScope` put visibility in SQL: `student_id = v.studentId`, or `department_id IN v.departmentIds`. A wrong role or an empty department list gives `false`. Also `lockAppeal` (FOR UPDATE OF appeals) and `runAppealAction`, the shared action flow: reserve the limit → transaction (lock within scope → `check` → `apply` → notification rows) → `publish` after commit → release the reservation on failure.
  - `detail.ts`. List rows and the card (timeline, chat, assignee, discipline name), plus the name formats.
  - `notify.ts`. Recipients, notification rows, `publishSafe` (realtime is best effort after commit), `excerpt`.
  - `service.ts`. Student functions.
  - `staff.ts`. Staff functions.
- `src/server/time.ts`. Added `mskDdMm(d)`, which formats «13.11» in MSK.

### Behaviour, as ruled
- **Create.** Steps in order:
  - zod validation for the subtype; errors are in Russian, keyed by field.
  - `disciplineId` is checked against `enrollments` for `v.studentId`, any semester.
  - Duplicate fast path, no limit spent: the same student, `type_code` and JSON-equal `fields` (`fields = $1::jsonb`, so key order doesn't matter) within 10 s returns the existing `{id, number}`.
  - Reserve the limit.
  - Transaction: `pg_advisory_xact_lock(hashtext('appeals:create'), studentId)`, then re-check for a duplicate. If one is found, the reservation is released and the existing appeal is returned, so a parallel double tap gives one row and spends one limit unit.
  - Insert. Department and `sla_days` come from `appeal_types`; `sla_due_at = addWorkingDays(now, slaDays)`; `created_at = updated_at = now`.
  - Event `submitted`, notifications (`appeal_new`) to every staff member of the department, then publish.
- **Transitions, enforced on the locked row:**
  - take: submitted→in_progress.
  - reply: allowed in submitted|in_progress|needs_info|ready; on submitted it takes the appeal first (events `taken` + `replied`, one notification); in rejected|closed → `closed`.
  - requestInfo: in_progress→needs_info.
  - markReady: in_progress→ready. A certificate needs a pickup `{place 1–120, until > now}`; other kinds need `null`.
  - reject: submitted|in_progress→rejected, reason 5–500, sets `closed_at`.
  - student message: allowed in submitted|in_progress|needs_info|ready, otherwise `closed`. From needs_info it goes to in_progress with a new `sla_due_at` and the event `answered`.
  - confirmReceived: ready→closed, sets `closed_at`.
  - Anything else → `bad_transition`.
- **On every staff action:** `assignee = coalesce(assignee, v.staffId)`; take sets the assignee explicitly; `first_response_at = coalesce(first_response_at, now)`; `updated_at = now`. Any staff member of the department may act. There is no assignee lock.
- **Notification titles to the student:**
  - «Обращение О-… принято в работу» — body «<подтип>: ответим до dd.mm.»
  - «Деканат ответил по обращению О-…»
  - «Нужно уточнение по обращению О-…»
  - «Справка по обращению О-… готова» — body «Забери справку: <место>, до dd.mm.» Non-certificates get «Обращение О-… готово».
  - «Обращение О-… отклонено» — body «Причина: …»
  - Kinds: `appeal_status` / `appeal_message`, the same as the seed. Hrefs: student `/dekanat/<id>`, staff `/staff/appeals/<id>`.
- **Notifications to staff:** «Новое обращение О-…» (`appeal_new`), «Новое сообщение по обращению О-…» and «Студент ответил на уточнение по обращению О-…» (`appeal_message`).
- **Realtime events:**
  - Every successful action with a notification sends `{type:'notification', title, href, appealId}` to the other side.
  - `confirmReceived` creates no notification row; it sends `{type:'appeal_updated', href, appealId}` to the department staff so their queue refreshes.
- **Ordering of checks:**
  - Message functions: UUID check → input validation → limit → visibility (`not_found`) → status.
  - Other actions: the same without the limit.
  - markReady: the pickup format is checked before visibility; whether a pickup is required by kind is checked after the status check. The brief's «markReady на submitted → bad_transition» therefore comes out as `bad_transition` even for a certificate with no pickup.
- **Event kinds for the UI timeline, with stored `text`:**

  | kind | text |
  |---|---|
  | `submitted` | null |
  | `taken` | «Принято в работу» |
  | `replied` | null — the message itself is in the chat |
  | `needs_info` | the question |
  | `answered` | null |
  | `ready` | certificate: «Справка готова. Забрать: <место> до dd.mm», otherwise «Готово» |
  | `rejected` | the reason |
  | `closed` | null |

  These match the seed's `submitted`/`taken`/`needs_info`/`ready`.

## Interfaces for later tasks (exact)
```ts
// src/server/appeals/result.ts (no server-only; safe on the client)
export type AppealError = "not_found" | "bad_transition" | "rate_limited" | "validation" | "closed";
export type Failure = { ok: false; error: AppealError; fieldErrors?: Record<string, string> };
export type Result<T> = { ok: true; value: T } | Failure;
export function ok<T>(value: T): Result<T>;
export function fail(error: AppealError, fieldErrors?: Record<string, string>): Failure;
export function isUuid(x: unknown): x is string;
export function fieldErrorsOf(error: z.ZodError): Record<string, string>; // root error → key "_form"
export function fieldError(key: string, error: z.ZodError): Record<string, string>;
// fieldErrors texts (ready to show): «Заполни поле», «Минимум N символов», «Не больше N символов», «Не больше 5»,
// «Не меньше N», «Укажи число», «Укажи дату», «Выбери один из вариантов», «Проверь значение»,
// plus fixed ones: typeCode «Выбери тип обращения», disciplineId «Выбери дисциплину из своего списка»,
// place «Укажи, где забрать справку» / «Место выдачи указывается только для справок»,
// until «Срок выдачи должен быть позже текущего момента».
// Keys: createAppeal → field names of the subtype; postStudentMessage/replyAppeal → "text";
// requestInfo → "question"; rejectAppeal → "reason"; markReady → "place" | "until".

// src/server/appeals/types.ts (no server-only; safe on the client). Additions to Task 3:
export function isAppealTypeCode(code: unknown): code is AppealTypeCode;
export const APPEAL_TEXT_LIMITS: { message: 2000; rejectReasonMin: 5; rejectReasonMax: 500; pickupPlace: 120 };
export const messageTextSchema;   // z.string().trim().min(1).max(2000)
export const rejectReasonSchema;  // z.string().trim().min(5).max(500)
export const pickupSchema;        // z.object({ place: z.string().trim().min(1).max(120), until: z.date() })
export type Pickup = { place: string; until: Date };
export type AppealStatus = "submitted" | "in_progress" | "needs_info" | "ready" | "rejected" | "closed";
export type AppealEventKind = "submitted" | "taken" | "replied" | "needs_info" | "answered" | "ready" | "rejected" | "closed";
export type AppealTypeInfo = { code: AppealTypeCode; title: string; topic: AppealTopic; kind: AppealKind };
export type DepartmentInfo = { id: number; code: DepartmentCode; name: string };
export type AppealListItem = {
  id: string; number: string; type: AppealTypeInfo; department: DepartmentInfo; status: AppealStatus;
  slaDueAt: Date; overdue: boolean; createdAt: Date; updatedAt: Date;
};
export type AppealEventView = { kind: AppealEventKind; text: string | null; at: Date; actor: "student" | "staff" | "system"; actorName?: string };
export type AppealMessageView = { id: number; body: string; at: Date; author: "student" | "staff"; authorName: string };
export type AppealDetail = AppealListItem & {
  fields: Record<string, unknown>; disciplineName: string | null;
  pickup: { place: string; until: Date } | null; rejectReason: string | null; assignee: string | null;
  events: AppealEventView[]; messages: AppealMessageView[];
};
export type AppealStudentInfo = { fullName: string; faculty: string; group: string; course: number };
export type QueueItem = AppealListItem & { assignee: string | null; student: { fullName: string; group: string } };
export type QueueAppealDetail = AppealDetail & { student: AppealStudentInfo };
export type StaffTab = "new" | "in_progress" | "waiting" | "closed";
export type StaffSummary = { new: number; inProgress: number; overdue: number; avgFirstResponseHoursWeek: number | null };

// src/server/appeals/sla.ts (no DB; safe on the client — wizard «ответ до <дата>»)
export const SLA_RUNNING_STATUSES: readonly ["submitted", "in_progress"];
export function slaDueAt(slaDays: number, from: Date): Date;            // = addWorkingDays
export function slaDueForType(code: AppealTypeCode, from: Date): Date;
export function isAppealOverdue(a: { status: AppealStatus; slaDueAt: Date }, now: Date): boolean;

// src/server/appeals/service.ts (server-only) — student
export type CreatedAppeal = { id: string; number: string };
export type AppealActionResult = Result<{ status: AppealStatus }>;   // new status after the action
export async function createAppeal(v: StudentViewer, typeCode: string, fields: unknown, now?: Date): Promise<Result<CreatedAppeal>>;
export async function listMyAppeals(v: StudentViewer, filter: "active" | "done", now?: Date): Promise<AppealListItem[]>;
  // active = submitted|in_progress|needs_info|ready; done = rejected|closed; order: updated_at desc
export async function getMyAppeal(v: StudentViewer, id: string, now?: Date): Promise<AppealDetail | null>;
export async function postStudentMessage(v: StudentViewer, id: string, text: string, now?: Date): Promise<AppealActionResult>;
export async function confirmReceived(v: StudentViewer, id: string, now?: Date): Promise<AppealActionResult>;

// src/server/appeals/staff.ts (server-only) — staff
export type AppealActionResult = Result<{ status: AppealStatus }>;
export async function listQueue(v: StaffViewer, tab: StaffTab, departmentId?: number, now?: Date): Promise<QueueItem[]>;
  // order: sla_due_at asc, created_at asc (all tabs); foreign departmentId / unknown tab → []
export async function listStaffDepartments(v: StaffViewer): Promise<DepartmentInfo[]>;  // for the department filter
export async function getQueueAppeal(v: StaffViewer, id: string, now?: Date): Promise<QueueAppealDetail | null>;
export async function takeAppeal(v: StaffViewer, id: string, now?: Date): Promise<AppealActionResult>;
export async function replyAppeal(v: StaffViewer, id: string, text: string, now?: Date): Promise<AppealActionResult>;
export async function requestInfo(v: StaffViewer, id: string, question: string, now?: Date): Promise<AppealActionResult>;
export async function markReady(v: StaffViewer, id: string, pickup: Pickup | null, now?: Date): Promise<AppealActionResult>;
export async function rejectAppeal(v: StaffViewer, id: string, reason: string, now?: Date): Promise<AppealActionResult>;
export async function getStaffSummary(v: StaffViewer, now: Date): Promise<StaffSummary>;  // avg rounded to 0.1 h

// src/server/limits.ts (server-only)
export const LIMITS: { appeal: { action: "appeal_create"; limit: 10; windowMs: 3600000 };
                       message: { action: "appeal_message"; limit: 30; windowMs: 3600000 } };
export type LimitSpec = { action: string; limit: number; windowMs: number };
export async function reserveAction(userId: string, action: string, limit: number, windowMs: number, now: Date): Promise<number | null>;
export async function consumeAction(userId: string, action: string, limit: number, windowMs: number, now: Date): Promise<boolean>;
export async function releaseAction(id: number): Promise<void>;
// Call outside a transaction (the reservation must be committed to be visible to parallel requests).

// src/server/realtime.ts (server-only)
export const LIVE_CHANNEL = "ns_events";
export type LiveEvent = { type: "notification" | "appeal_updated" | "announcement"; title?: string; href?: string; appealId?: string };
export type LivePayload = { userIds: string[]; event: LiveEvent };
export async function publish(userIds: string[], event: LiveEvent): Promise<void>; // throws if payload > 7900 bytes

// internal (appeals/*), usable by Task 9 if needed: access.ts (studentScope, staffScope, runAppealAction, addEvent, Tx),
// detail.ts (loadAppealDetail, listColumns, toListItem, studentFullName, staffDisplayName),
// notify.ts (studentHref, staffHref, departmentStaffUserIds, insertNotifications, publishSafe, excerpt).

// src/server/time.ts — added
export function mskDdMm(d: Date): string; // «13.11»
```
Names: a student is «Фамилия Имя Отчество» (as in `Profile.fullName`). A staff member is «Имя Отчество Фамилия» (as in the seed notification «…готовит Ирина Николаевна Белова»).

UI notes:
- `fields.copies` and `fields.disciplineId` must be numbers. The Task 3 schemas don't coerce, so a FormData string gives «Укажи число».
- `pickup.until` must be a `Date`.
- Server Actions should pass `now` explicitly or leave it as the default.

## Tests and results
New files:
- `tests/appeals/student.test.ts` (23)
- `tests/appeals/staff.test.ts` (19)
- `tests/appeals/limits.test.ts` (4)
- `tests/appeals/realtime.test.ts` (5)
- `tests/idor.test.ts`: +6 in the `IDOR: обращения` block.

Brief Step 1 cases:
- `cert_military` → `docs`, `sla_due_at = addWorkingDays(now,1)` = 2026-11-11T15:00Z.
- Double submit within 10 s → one id, including JSON-equal fields with a different key order, and two parallel requests → one row, one `action_log` row.
- 11th appeal in an hour → `rate_limited`, nothing inserted; allowed again after the window; Denis is unaffected; repeats don't consume the limit; 15 parallel creates → ≤10 created, `action_log` = number created.
- `<script>alert(1)</script>`, emoji and `' or 1=1 --` come back byte-for-byte from `fields->>'text'`, `getMyAppeal().fields.text` and the message body.
- requestInfo → student answers on Friday → `in_progress`, `sla = addWorkingDays(answerAt, 2)` = Tue 2026-11-17T15:00Z, event `answered`, staff notified.
- `markReady` on `submitted` → `bad_transition`.

Brief Step 2 (IDOR), plus:
- `getMyAppeal(alina, each of Denis's ids) === null`, with a positive control: Denis sees his own.
- `postStudentMessage(alina, Denis's id)` → `not_found`, and a snapshot of appeals/events/messages/notifications is unchanged.
- `confirmReceived(alina, Denis's ready cert)` → `not_found`, snapshot unchanged.
- `listMyAppeals(alina)` has no ids of Denis's.
- A staff member created in the test with only `docs`:
  - their `listQueue` (all tabs, and the explicit `study` filter) doesn't contain the `study` appeal;
  - `getQueueAppeal` → null;
  - take/reply/requestInfo/markReady/reject → `not_found`, snapshot unchanged;
  - positive control: they do see Alina's `docs` appeal.
- A student viewer cast to `StaffViewer` gets `not_found` / [] / null / an empty summary from every staff function.

Also covered:
- Unknown type and the prototype keys `constructor`, `__proto__` and `toString` → `validation`.
- Russian `fieldErrors`.
- Foreign `disciplineId` → `validation`.
- Invalid UUIDs (`abc`, `''`, an injection string, `…00g`, a number, null) → null, with no Postgres error.
- Overdue status for the student, and none while in `needs_info`.
- Card shape: timeline actors and names, chat, pickup, `disciplineName`.
- Messages in submitted/in_progress/ready don't change status or SLA.
- `closed` for rejected/closed appeals.
- Failed message attempts don't spend the limit.
- 30/hour message limit for a student and for staff (reply + requestInfo).
- Staff queue tabs and order, department filter, queue item shape.
- The staff card has only ФИО/факультет/группа/курс: the JSON dump doesn't contain the record-book number, login, curator, funding, study form or userId.
- take, and a second take → `bad_transition`.
- Reply on submitted takes the appeal implicitly.
- Reply in needs_info/ready keeps the status.
- requestInfo only from in_progress.
- markReady: certificate pickup is required (null and undefined), the place must not be empty, `until` must be in the future and a valid date; a non-certificate with a pickup → `validation`.
- reject: reason 5..500, `closed_at`, `bad_transition` from needs_info/ready.
- `first_response_at` is set only once.
- A colleague in the department can act, and the assignee stays.
- Two parallel takes → exactly one succeeds.
- A new appeal notifies all and only that department's staff.
- `getStaffSummary`:
  - Demo world: `{new:2, inProgress:1, overdue:0, avg:0.7}`.
  - Friday: `overdue: 2`.
  - Eight days later: avg is null.
  - Docs-only staff: `{0,1,0,0.5}`.
  - Staff with no departments: zeros and null.
- `publish`: one NOTIFY with the exact payload; empty recipients → nothing sent; oversize → throws.
- `createAppeal` publishes to Irina; `replyAppeal` on Denis's appeal publishes only to Denis; failed actions publish nothing (checked with a marker event, since NOTIFY arrives in commit order).
- `consumeAction`: sequential limit and window, separation by user and action, 20 parallel requests with limit 5 → ≤5 and rows equal the passes, release.

### TDD evidence
- RED. Tests were written first. `npx vitest run tests/appeals tests/idor.test.ts`:
  ```
  FAIL tests/idor.test.ts            Error: Cannot find package '@/server/appeals/service'
  FAIL tests/appeals/limits.test.ts  Error: Cannot find package '@/server/limits'
  FAIL tests/appeals/realtime.test.ts / staff.test.ts / student.test.ts  Error: Cannot find package '@/server/appeals/service'
  Test Files  5 failed (5)   Tests  no tests
  ```
  This is the expected failure, since none of the modules existed. To be honest about it: the RED came from missing modules, not failed assertions. The first GREEN run of the implementation passed everything (`Test Files 5 passed · Tests 61 passed`). To make sure the tests bite, I ran mutation checks, all of them temporary and reverted:

  | Mutation | Failing tests |
  |---|---|
  | `studentScope` → `true` | 4 IDOR failures: getMyAppeal, listMyAppeals, postStudentMessage, confirmReceived |
  | `staffScope` → `true` for staff | the IDOR «docs-only» test |
  | Advisory lock removed | «двойной тап» fails 3 of 3 runs |
  | Limiter changed to check-then-insert | «15 одновременных» and «20 одновременных при лимите 5» |
  | No `releaseAction` on duplicate | «двойной тап» (`action_log` = 2) |
  | No `releaseAction` on failed action | «в закрытое… closed» (`action_log` ≠ 0) |
  | UUID check removed in getMyAppeal | `PostgresError: invalid input syntax for type uuid` |
  | `FOR UPDATE` removed | «два сотрудника одновременно» fails 2 of 3 runs; it's a timing race, and deterministic with the lock |
- GREEN, after the self-review additions:
  - `npx vitest run tests/appeals tests/idor.test.ts` → `Test Files 5 passed (5) · Tests 62 passed (62)`.
  - `npm test` → `Test Files 17 passed (17) · Tests 156 passed (156)`, run 3 times, all green, about 30 s.
  - `npx tsc --noEmit` → exit 0; `npx eslint src tests` → exit 0; `npm run build` → compiled successfully.
  - No page imports these modules yet, so Next compiles them only via tsc. The UI tasks will be the first to bundle them.

## Files
- New:
  - `src/server/limits.ts`
  - `src/server/realtime.ts`
  - `src/server/appeals/{result,sla,access,detail,notify,service,staff}.ts`
  - `tests/appeals/{student,staff,limits,realtime}.test.ts`
- Modified:
  - `src/server/appeals/types.ts` (additions only)
  - `src/server/time.ts` (`mskDdMm`)
  - `tests/idor.test.ts` (new block, merged the viewer import)

## Self-review findings (fixed)
- `markReady(…, undefined)` would have given a confusing `_form` error. `undefined` is now treated as `null`.
- The card only exposed `fields.disciplineId`, and staff have no way to resolve it, since they have no access to grades. I added `disciplineName`. This is the appeal's own content, not extra student data.
- Added tests that were missing: two parallel takes, failed attempts not spending the limit, `slaDueForType` matching the stored SLA, and positive controls in the IDOR tests.
- The excerpt for notification bodies slices by code points, so it never splits an emoji into a lone surrogate.

## Deviations / decisions (please acknowledge)
1. **Trailing `now: Date = new Date()` on every service function.** The global rule says time-dependent functions take `now`, and Task 4 did the same. It's needed for the SLA, the limits, event times and `overdue`. `listQueue(v, tab, departmentId?, now?)` keeps the brief's argument order. `getStaffSummary(v, now)` takes `now` as required, per the brief.
2. **Extra internal files beyond the plan's four:** `access.ts`, `detail.ts`, `notify.ts`, plus `result.ts`, which the ruling allowed. Each has one job, and without them `service.ts` and `staff.ts` would duplicate the lock, the notification and the publish code.
3. **Extra exports:**
   - `reserveAction` and `releaseAction`, so a reservation is handed back by its exact id, alongside the ruled `consumeAction`;
   - `listStaffDepartments`, for the T14 department filter;
   - `slaDueForType`, for the T13 «ответ до <дата>»;
   - `APPEAL_TEXT_LIMITS` and the input schemas;
   - `AppealDetail.disciplineName`;
   - `department` is `{id, code, name}` rather than only the name.
4. **Staff `replyAppeal` in rejected|closed returns `closed`**, the same as the student. The ruling only fixed this for the student.
5. **Certificate-ready title** is «Справка по обращению О-… готова». This matches the seed's existing notification, while the brief abbreviates it as «Справка готова…». The other four titles start exactly as in the brief.
6. **markReady is strict:** a non-certificate with a non-null pickup → `validation`, and `until` must be after `now`.
7. **`listQueue` sorts every tab by `sla_due_at` asc**, as the brief says literally. For the «Закрытые» tab, most-recent-first may suit T14 better, and the UI can reverse the list.
8. **`confirmReceived`** sends `appeal_updated` (no notification row) to the department staff, so an open queue refreshes. The ruling lists staff notifications only for create and message.

## Concerns
1. **The 30/hour message limit also applies to staff (reply + requestInfo), and the jury shares Irina's account.** If several jurors try the staff cabinet in the same hour, they share 30 messages. The ruling says «per user». The options are to keep it as is, raise the staff limit (for example 120), or not limit staff. **Controller decision needed.**
2. **`publish` throws when a payload is over 7900 bytes**, which is about 190 recipients' uuids. That's fine for appeals, since recipients are the student or the department staff. For announcements in Task 9 there are only four demo students, but Task 9 should chunk recipients or rely on this guard.
3. If a transaction throws after the limit was reserved, the reservation stays (fail-closed). If `appeal_types` is missing a code (a misconfiguration), `createAppeal` throws instead of returning a `Result`.
4. `idor.test.ts` still builds its world once in `beforeAll`. That order dependence was already noted in T5. My block only makes failed mutation attempts, which I verified with snapshots, and creates one extra staff user, so it doesn't add to the problem.
5. For T7 (nudges): student-visible statuses and the needs_info and ready semantics are as above. The seeded `ready` certificate keeps `pickup_place` / `pickup_until`.

---

## Fix report 1 — controller ruling on concern 1 (staff message limit)

**Ruling:** staff 120 messages/hour per user (reply + requestInfo share it); students stay at 30/hour. Concern 3 deviations accepted; concern 2 carried to Task 9 (chunk recipients).

**Change (commit `845eaac`):**
- `src/server/limits.ts`: `LIMITS.staffMessage = { action: "appeal_message", limit: 120, windowMs: 3600000 }`. Students keep `LIMITS.message`, limit 30. The action key is the same, but each user has only one role, so in practice the counters are per user.
- `src/server/appeals/staff.ts`: `replyAppeal` and `requestInfo` use `LIMITS.staffMessage`. `postStudentMessage` is unchanged.

**Test:** `tests/appeals/staff.test.ts` replaces the old 30/hour staff test with «у сотрудника лимит 120 сообщений в час…». It sends 119 replies, then a `requestInfo` as the 120th (ok, so the two share the counter). The 121st reply → `rate_limited`, and so is `requestInfo`. That leaves 120 messages in the DB. After the window, a reply is accepted again. The student test «лимит 30 сообщений в час на пользователя» is unchanged and still passes.
- RED: `npx vitest run tests/appeals/staff.test.ts -t "120"` → `× … AssertionError: expected false to be true` (the 31st reply was rejected under the old 30 limit).
- GREEN: `npx vitest run tests/appeals` → `Test Files 4 passed · Tests 51 passed`. `npm test` → `Test Files 17 passed (17) · Tests 156 passed (156)`. `npx tsc --noEmit` exits 0, and `npx eslint src tests` exits 0.

**Interface update:** `LIMITS: { appeal: 10/h; message: 30/h (student); staffMessage: 120/h (staff, reply + requestInfo) }`.
