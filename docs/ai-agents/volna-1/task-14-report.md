# Task 14 report: Кабинет сотрудника

**Status:** DONE_WITH_CONCERNS (concerns are product notes; nothing blocks Task 10/15)
**Model:** Claude Opus 5.5. I invoked the `frontend-design` skill first and reused the «Бумага» system: tokens, Card patterns, Tabs, Badge/StatusBadge, Field, EmptyState/ErrorState, PageSkeleton, SubmitButton, and the Task 13 `src/ui/appeals/*` pieces (Timeline, Thread, FieldsSummary, Countdown).
**Note:** the run stopped once on an API rate limit and was resumed. Docker Desktop was not running on resume; I started it and the containers came up healthy.

## Commits (feat/volna-1, not pushed)
- `3d10f33` feat(staff): помощники кабинета сотрудника — прочитать по ссылке, объявления, профиль
- `8129694` feat(ui): тексты и логика кабинета сотрудника — адрес очереди, таймер, ошибки, аудитория
- `58ee68f` feat(ui): очередь сотрудника — талоны с таймером срока, сводка, вкладки, отделы
- `4112dfa` feat(ui): карточка обращения у сотрудника — взять, ответить, уточнить, готово, отклонить
- `721b772` feat(ui): объявления и профиль сотрудника; 404 ведёт сотрудника в очередь
- `8e00868` feat(ui): кабинет сотрудника (e2e + 36 screenshots `04-*`)

## What was implemented

### Access
- `src/app/staff/layout.tsx` calls `requireStaff()` and renders `AppShell role="staff"` with the name «Ирина Белова» (from `getStaffProfile`) and `unreadCount(v)`.
- Every page and every action calls `requireStaff()` itself.
- No action takes `now`, staffId or userId from the client. The appeal id from a form goes only into the viewer-scoped staff functions (`takeAppeal`, `replyAppeal`, `requestInfo`, `markReady`, `rejectAppeal`).

### Queue `/staff` (`page.tsx`, `queue.module.css`, `params.ts`, `loading.tsx`, `error.tsx`)
- **Header:** kicker with the date, h1 «Очередь».
- **Summary:** a region «Сводка по моим отделам» set out like the columns of a deanery register. Four cells: Новых · В работе · Просрочено · «Первый ответ в среднем за неделю».
  - The average is shown as «42 мин» or «1,5 ч», and «—» when there is no data.
  - When something is overdue, that cell turns danger-tint.
  - Mobile is a 2×2 grid; ≥600 px is one row.
- **Departments:** a `nav` «Отдел» with chips «Все отделы · Справки · Учёба · Стипендия» (short labels, full name in `title`). It is shown only if the viewer has more than one department.
  - `?dept=` is accepted only from `v.departmentIds`; anything else means all departments.
- **Tabs:** `?tab=new|in_progress|waiting|closed` («Новые · В работе · Ждут студента · Закрытые») with counts that respect the department filter. They show as a 2×2 grid on a phone.
- **List:** `ul[aria-label=Обращения]` of `QueueCard`s.
  - Sorted by deadline (server order). «Закрытые» is sorted newest first instead (see Deviations).
  - Each tab has its own empty state, and it names the department when a filter is active.
- **QueueCard** (`src/ui/staff/QueueCard.tsx` + `QueueTimer.tsx`): drawn as a queue ticket («талон»).
  - Left side: number | department, type title, «ФИО, группа», StatusBadge and a note: «поступило …», «ведёт Ирина Белова», «вопрос задан …», or the closing time.
  - Right side: a tear-off stub with a live timer in Literata («осталось / 21 ч», «просрочено на / 2 ч»), plus «до завтра, 18:00».
  - The stub appears only while the deadline is running (submitted, in_progress).
  - Overdue: `data-overdue` on the link, a red ticket edge and a danger-tint stub.

### Card `/staff/appeals/[id]` (`page.tsx`, client forms, `appeal.module.css`, `loading/error/not-found.tsx`)
- **Lookup:** `getQueueAppeal`. null or a malformed id → `notFound()` → «Обращение не найдено» + «К очереди».
- **Read on open:** opening the card calls `markReadByHref(v, "/staff/appeals/<id>")`. If anything was marked, `<RefreshOnce/>` calls one `router.refresh()`, so the bell in the layout shows the real count. The layout is not re-rendered on client navigation; after the refresh nothing is marked, so there is no loop.
- **Top state panel:**
  - submitted/in_progress: «Ответить до» date in big Literata, live `Countdown`, overdue note «Срок прошёл — студент тоже видит просрочку.», then «Взять в работу» (`TakeForm`) or «Ведёт <исполнитель>».
  - needs_info: «Ждём ответа студента» (the question, «срок на паузе»).
  - ready: «Справка готова» with «Забрать: …, до …, 17:00».
  - rejected: «Обращение отклонено» with «Причина: …».
- **«Студент»:** only ФИО, Факультет, Группа, Курс (dl, styled like FieldsSummary).
- **Content:** «Что в обращении» (`FieldsSummary who="staff"` → «Вопрос студента»), then «Переписка» (`Thread mine="staff"`) with the reply form «Ответ студенту» / «Ответить». For submitted it adds the hint «Ответ сразу возьмёт обращение в работу». For rejected/closed it shows «Обращение закрыто — написать в него нельзя.»
- **«Решение»** (submitted/in_progress only): `<details name="decision">`, an exclusive accordion that works without JS.
  - «Запросить уточнение» (in_progress): «Вопрос студенту» / «Отправить вопрос».
  - «Готово» (in_progress):
    - certificates get «Где забрать», prefilled «каб. 214, корпус А», and «До какого дня» (`type=date`), defaulting to +5 days with Sat/Sun moved to Monday, between min today and max +90; the server stores 17:00 МСК;
    - other kinds get only «Отметить готовым».
  - «Отклонить»: «Причина отказа» textarea (5–500).
    - The first click («Отклонить обращение») checks the minimum length on the client and then shows an inline confirmation: «Отклонить обращение О-…? Студент сразу получит уведомление…», with [Отмена] and [Да, отклонить] (focused, red).
    - While confirming, the textarea is read-only, so the student gets exactly the text that was confirmed.
    - There are no `window.confirm` dialogs.
- **«Путь обращения»:** Timeline with the next stop as staff sees it.
- **Error copy** (`form-state.ts` `staffFailure`):
  - bad_transition → «Статус уже изменился — обнови страницу»
  - closed → «Обращение закрыто — написать в него нельзя»
  - rate_limited → «Слишком много сообщений — попробуй через несколько минут»
  - not_found → «Обращение не найдено — вернись в очередь и открой его заново»
  - validation → the text under the field (`text`, `question`, `place`, `until`, `reason`); `_form` → general text
  - otherwise → generic
- **Forms are controlled.** React 19 resets uncontrolled form fields after an action, and entered text must survive an error.

### Announcements `/staff/announcements`
- **Form** (`AnnouncementForm.tsx`, client, controlled):
  - Fields: Заголовок, Текст, «Кому» radios (Всем / Факультет / Курс / Группа). Only the chosen dimension shows its select: «Какой факультет», «Какой курс» (1–6), or «Какая группа» (`ПМИ-25-1 (2 курс)`). Then «Важное» with the hint «Закрепится сверху в ленте студентов».
  - Submit goes to `publishAnnouncementAction` → `createAnnouncement`.
  - On success the banner reads `publishedText(n)`: «Опубликовано: увидит 1 студент» / «увидят 3 студента» / «…5 студентов», or «Опубликовано. В этой аудитории пока нет студентов». The form clears and the list refreshes.
  - On error: a focused alert «Проверь отмеченные поля» plus field errors. rate_limited → «Слишком много объявлений за час — попробуй позже».
- **List «Опубликованные»** (`listAllAnnouncements`): newest first. Each item shows «Кому: ПМИ-25-1» / «всем студентам», a «Важное» badge, and the full text. Important items get an accent frame. The footer shows the time and the author.

### Profile `/staff/profile`
- Initials, h1 ФИО, the position as subtitle.
- Sheet «Отделы» (list) with a note.
- «О проекте» and «Выйти» (`logoutAction`).

### Shared changes (small, outside `src/app/staff/**`, each needed by the cabinet)
- `src/server/notifications.ts`: `markReadByHref`.
- `src/server/announcements.ts`:
  - `listAllAnnouncements`, `listAudienceOptions`;
  - `createAnnouncement` now returns `{ id, recipients }` (additive);
  - the audience label code moved into `audienceText()` (shared with `listAnnouncementsFor`).
- `src/server/profile.ts`: `getStaffProfile`.
- `src/ui/appeals/labels.ts` + `FieldsSummary`: an optional `who: "student" | "staff"`, so staff sees «Вопрос студента» instead of «Твой вопрос». The default is unchanged.
- `src/ui/appeals/time-left.ts`: `shortCountdown`. `use-now.ts` (new) holds the ticking hook; `Countdown` uses it, with the same behaviour as before.
- `src/ui/Button.tsx`: optional `ref` prop (React 19), used to focus «Да, отклонить».
- `src/app/not-found.tsx` (now async, uses `getViewer()`) + `src/ui/PublicPage.tsx` (`home` prop): for staff, «На главную» and the logo lead to `/staff`. The student `/` is a 404 for staff, so the old link looped and its prefetch logged a 404.
- `e2e/demo.ts`:
  - `ACCOUNTS.irina`;
  - `signIn` waits for `/staff` for Irina;
  - `localDatabaseUrl()` was extracted from `resetDemoWorld` with the same local-only guard.
- `e2e/db.ts` (new): `makeOverdue(typeCode, minutes)`, for the local DB only.

## Tests and results
- **Unit (Vitest):**
  - `tests/staff-cabinet.test.ts` (9, real DB):
    - `markReadByHref` marks only its own unread notifications with that href. Alina's row with the same href stays unread. A repeat call returns 0. A student viewer gets 0 for Irina's href. Empty or foreign href → 0.
    - `listAllAnnouncements`: order, audience labels, author. A forged non-staff viewer → [].
    - `listAudienceOptions`: 3 faculties, courses 1–6, 5 groups with course and facultyId.
    - `getStaffProfile`: exact object for Irina; a non-staff viewer → null.
    - `createAnnouncement.recipients`: ПМИ-25-1 → 1; all → 4.
  - `tests/ui/staff.test.ts` (19):
    - `shortCountdown`; `parseQueueParams` (junk, `__proto__`, `toString`, arrays, foreign/garbage dept, `1e0`); `queueHref`; `tabOfStatus`; `QUEUE_TABS`;
    - `avgResponseText`; `publishedText` plural forms; `pickupDefaultKey` (weekend roll, 21:30Z boundary); `parsePickupUntil` (17:00 МСК, invalid dates, +90 limit);
    - `staffFailure` for every code; `audienceFromForm` (only the chosen dimension, missing values, `__proto__`); `announcementFailureState`;
    - `fieldRows(…, "staff")`.
  - `tests/ui/staff-components.test.tsx` (4): QueueCard markup, the overdue flags, no stub for waiting/closed, escaping.
- **E2E** `e2e/staff.spec.ts`: 9 serial scenarios × 2 projects = **18 passed**.
  1. **Queue:** summary 2/1/0/«42 мин»; tab counts and `aria-current`; cards (timer, «ФИО, группа», department, status); each tab; department filter → empty «Новых обращений нет»; `dept=99999` → all departments.
  2. **Overdue:** after `makeOverdue`, «Просрочено 1», the card sorts first with `data-overdue` and «просрочено на 2 ч». On the card: the full countdown, the note and «Вопрос студента». The bell goes from «2 непрочитанных» to «1 непрочитанное».
  3. **Take → reply → request info:**
    - The student block holds exactly ФИО/Факультет/Группа/Курс.
    - Take → «В работе», timeline «Принято в работу · Ирина Белова», «Ведёт Ирина Николаевна Белова».
    - Empty reply → «Заполни поле» and `aria-invalid`. The reply lands on the right (`data-mine`) and the field clears.
    - Request info → «Нужно уточнение», panel «Ждём ответа студента», no «Решение».
    - The back link leads to `?tab=waiting`.
  4. **Reject:** «нет» → «Минимум 5 символов» with no confirm step. «Отмена» keeps the text. Confirm → «Отклонено», reason panel, no forms.
  5. **Ready + realtime:** Alina keeps her card open in a second context, with the SSE response awaited. Irina marks the certificate ready: prefilled place, date, «Забрать: каб. 214, корпус А, до … 17:00». Alina gets the toast «Справка по обращению О-… готова» and «Справка готова» on the card, in the same document (a window marker survives).
  6. **Announcement:** empty form → errors. «Группа» with no group chosen → «Выбери группу». Choosing ПМИ-25-1 + «Важное» → «Опубликовано: увидит 1 студент», the form clears, a new first item «Кому: ПМИ-25-1» «Важное», 5 items. Alina sees it in `/notifications?tab=announcements`.
  7. **Profile:** ФИО, должность, 3 отдела; «Выйти» → `/login`; `/staff` → `/login`.
  8. **Wrong role:**
    - Alina opening `/staff`, a staff card, `/staff/announcements` or `/staff/profile` gets **HTTP 404** «Страница не найдена», with no trace of the appeal and no queue tabs.
    - Irina opening `/`, `/dekanat` or `/schedule` gets **HTTP 404**, and «На главную» and the logo lead to `/staff`.
  9. **Malformed or nil uuid** → «Обращение не найдено» + «К очереди».
  - In every scenario: no horizontal scroll and no console errors, with the same filter as dekanat.spec.
- **Commands (final tree):**
  - `npm test` → **Test Files 35 passed · Tests 380 passed**
  - `npx playwright test` (all specs) → **54 passed (1.5m)** (18 student + 18 dekanat + 18 staff)
  - `npx tsc --noEmit` → exit 0. `npx eslint .` → exit 0.
  - `npm run build` → `✓ Compiled successfully`, routes `ƒ /staff`, `ƒ /staff/announcements`, `ƒ /staff/appeals/[id]`, `ƒ /staff/profile`.

### TDD evidence
- **Server helpers RED:** `npx vitest run tests/staff-cabinet.test.ts` → `Tests 9 failed (9)` with `TypeError: getStaffProfile is not a function` / `listAudienceOptions is not a function` (and so on). Expected, because the functions did not exist. **GREEN:** `Tests 9 passed (9)`.
- **Pure helpers RED:** `npx vitest run tests/ui/staff.test.ts` → failed to import `@/app/staff/params` (no tests ran). Expected, because the modules did not exist. **GREEN:** `Tests 18 passed`.
- **Second RED:** I added the «Вопрос студента» test first → `1 failed | 18 passed`, Expected «Вопрос студента», Received «Твой вопрос». GREEN after adding `who`.
- **E2E RED:** `npx playwright test e2e/staff.spec.ts --project=desktop-1280 -g "очередь: сводка"` → h1 Expected «Очередь», Received «Страница не найдена», plus console `404 … /staff`. Expected, because the route did not exist.
- **Not TDD:** `tests/ui/staff-components.test.tsx` was written after QueueCard. A mutation check (stub always rendered) → `1 failed | 3 passed`; reverted → 4 passed.
- **Failures along the way:**
  - My own strings: «вопрос задан» instead of «ждём ответа с», which I changed for grammar. Fixed in the test.
  - A strict-mode clash: the select placeholder «Выбери группу» duplicated the error text. Placeholders are now «Группа не выбрана» and so on.
  - A strict-mode clash on «На главную»: the logo has the same accessible name prefix, so I added `exact`.
  - A tab emptied by earlier steps: the access test now uses «Закрытые».
- **Flaky realtime test, investigated before fixing:**
  - Symptom: 1 run in 3 had Alina's toast arrive while her card never showed «Справка готова».
  - Evidence: the captured RSC requests carried `referer: /dekanat`.
  - Cause: a race in my test. `expect("В работе")` was already satisfied on the *list* page, so `reload()` sometimes reloaded `/dekanat` before the client navigation committed.
  - Fix: `goto(href)` directly, wait for the SSE response, then assert the card's h1.
  - Result: 3/3 stable runs, and green in both full runs. There was no app bug.

### Screenshots (`docs/screenshots/04-*-{360,1280}.png`, 36 files)
`queue-new`, `queue-in-progress`, `queue-waiting`, `queue-closed`, `queue-empty`, `queue-overdue`, `card-overdue`, `card-submitted`, `card-in-progress`, `card-needs-info`, `reject-confirm`, `card-rejected`, `card-ready`, `announcements`, `announcements-published`, `profile`, `student-404`, `not-found`.

I reviewed the 360 and 1280 shots and fixed what I found:
- the department chips took three rows on a phone, so I switched to short labels;
- the kicker's separator dangled when the department wrapped, so the kicker is two lines on a phone;
- «просрочено на» broke in the stub, so the stub is wider;
- the «Важное» hint overflowed its box at ≥600 px, because Field's `.option` gets `flex: 1 1 0` inside a column form;
- the sticky sidebar and header were drawn mid-page in full-page shots, so `snap` scrolls to the top first.

The full run regenerated the `02-*`/`03-*` screenshots only with new times; I restored them so the diff stays focused.

## Design notes (frontend-design)
- **The one bold device is the queue ticket («талон электронной очереди»).** A tear-off stub sits behind a dashed perforation with notches. It carries the running deadline in Literata, and only while the deadline runs. Overdue turns the stub and the ticket edge red. This continues Task 13's «appeal as a parcel»: there a label and tracking, here a queue ticket.
- **Summary as a register row:** ruled columns, Literata figures, a red cell only when something is overdue. The brief asks for a summary, so I avoided big-KPI cards.
- **Everything else stays quiet and reused:** paper sheets, status-coloured panels, the same timeline and thread as the student card, and an exclusive `details` accordion for the decision, so only one form shows at a time.

## Self-review findings (fixed)
- **Equal-specificity overrides across CSS modules** (`.important` vs Field's `.option` in a media query) are bundle-order dependent; raised to `.form .important`.
- **Uncontrolled inputs** would have been reset by React 19 after an error; all action forms are controlled.
- **`staffFailure` for validation without fieldErrors** now falls back to the generic text, never an empty message.
- **Bell count:** without RefreshOnce it stayed stale after opening a card, because the layout is not re-rendered on client navigation. The e2e now checks it.

## Deviations / decisions (please acknowledge)
1. **«Закрытые» are sorted by `updatedAt` desc** (most recently closed first). The other tabs keep the server's order by deadline. Task 6 already flagged that this tab may suit it better.
2. **Department chips use short labels** («Справки», «Учёба», «Стипендия»), with the full name in `title`. The card kicker still shows the full department name.
3. **The root 404 is async** and reads the viewer, so staff get `/staff` as «главная». This is outside `src/app/staff/**`, but without it staff hit a 404 → `/` → 404 loop, plus a console 404 from prefetching `/`.
4. **`createAnnouncement` returns `recipients`** (additive), to power «Опубликовано: увидит N …».
5. **«Решение» is an exclusive `<details name>` accordion.** «Готово» and «Запросить уточнение» appear only in `in_progress`, as Task 6's transitions allow. A submitted appeal shows «Отклонить» plus a note to take it first.
6. **Pickup «до»** = 17:00 МСК of the chosen date, at most 90 days ahead (checked in the action before `markReady`). This matches the seed (17:00) and the single window's hours on «О проекте».
7. **Audience errors take priority:** if the audience is incomplete, the action returns that error without calling `createAnnouncement`. Title and body errors then appear on the next submit. This avoids publishing on a partial form.

## Concerns
1. **The demo world has no overdue appeal**, so the jury will not see the red ticket unless time passes. The e2e creates one with `e2e/db.ts`. **Proposal (controller ruling):** seed one more submitted appeal from a student without a login, created about 3 working days ago with a 1-day SLA, so it is overdue all day after the 04:00 reset. Cost: update the `getStaffSummary` demo-world expectation (`new: 3, overdue: 1`) and the e2e counts.
2. **`markReadByHref` runs during the card's GET render** (a side effect on view). It is idempotent and scoped to the viewer. Default `<Link>` prefetch stops at `loading.tsx`, so it does not trigger it. A stricter alternative would be a POST action fired from the client on mount.
3. **«Обращение не найдено» on `/staff/appeals/<bad>` returns HTTP 200,** the same as Task 13's carry: `loading.tsx` streams first. Wrong-role pages return a real 404, as the e2e asserts.
4. **No screenshot of a staff card in status `closed`:** the demo world has none until a student presses «Получил». That flow is in dekanat.spec.
5. **The announcement limit is 10/hour per user (Task 9),** and the jury shares Irina. The e2e uses 2 per run.

## Interfaces later tasks can rely on
```ts
// src/server/notifications.ts
export async function markReadByHref(v: Viewer, href: string): Promise<number>;

// src/server/announcements.ts
export type StaffAnnouncementView = AnnouncementView & { author: string };          // «Ирина Белова»
export async function listAllAnnouncements(v: StaffViewer): Promise<StaffAnnouncementView[]>; // non-staff → []
export type AudienceOptions = {
  faculties: { id: number; code: string; name: string }[]; courses: number[];      // [1..6]
  groups: { id: number; name: string; course: number; facultyId: number }[];        // by course, name
};
export async function listAudienceOptions(): Promise<AudienceOptions>;
export async function createAnnouncement(v, input, now?): Promise<Result<{ id: number; recipients: number }>>;

// src/server/profile.ts
export type StaffProfile = { fullName: string; firstName: string; lastName: string; initials: string; position: string; departments: string[] };
export async function getStaffProfile(v: StaffViewer): Promise<StaffProfile | null>;

// src/app/staff/actions.ts ("use server"; all call requireStaff())
takeAction, replyAction, requestInfoAction, markReadyAction, rejectAction: (prev: StaffActionState, form: FormData) => Promise<StaffActionState>;
  // fields: appealId; text | question | reason; place + until (YYYY-MM-DD) for certificates
publishAnnouncementAction(prev: AnnouncementFormState, form: FormData): Promise<AnnouncementFormState>;
  // fields: title, body, audience=all|faculty|course|group, facultyId | course | groupId, important=on

// src/app/staff/params.ts
parseQueueParams(sp, departmentIds): { tab: StaffTab; dept: number | undefined };
queueHref({ tab, dept? }): string;   // "/staff", "/staff?tab=waiting&dept=3"
// src/app/staff/form-state.ts
StaffActionState, staffFailure(f), parsePickupUntil(key, now), audienceFromForm(form), AnnouncementFormState, announcementFailureState(f, values, seq?)

// src/ui/staff/labels.ts
QUEUE_TABS, tabOfStatus(status), DEPT_SHORT, avgResponseText(h), publishedText(n),
PICKUP_PLACE_DEFAULT, PICKUP_HOUR ("17:00"), PICKUP_MAX_DAYS (90), pickupDefaultKey(now)
// src/ui/staff/QueueCard.tsx — QueueCard({ appeal: QueueItem, now }) → <a href="/staff/appeals/<id>" data-overdue>
// src/ui/appeals/time-left.ts — shortCountdown(due, now): { label, value, text, overdue }
// src/ui/appeals/use-now.ts — useNow(serverNow: string, everyMs = 60000): Date  ("use client")
// src/ui/appeals/FieldsSummary — who?: "student" | "staff";  labels.fieldRows(a, who?), textLabel(kind, who?)
// src/ui/PublicPage — home?: string;  src/ui/Button — ref?: Ref<HTMLButtonElement>

// e2e
ACCOUNTS.irina; signIn(page, "irina") waits for /staff; localDatabaseUrl(); e2e/db.ts makeOverdue(typeCode, minutes)
```

---

## Fix report 1: controller ruling on concern 1 (seeded overdue appeal)

**Commit:** `6260649` feat(demo): просроченное обращение в очереди сотрудника

**Changes:**
- `src/server/demo/people.ts`: a new fictional student without a login, `zakharov` (Захаров Никита Павлович, ЛИН-26-1, the Гуманитарный факультет). His group had no students before, so audience counts for existing groups do not change.
- `src/server/demo/world.ts`: a `submitted` `study_other` appeal («Другой учебный вопрос», учебный отдел, SLA 2 working days).
  - `created = mskAt(workdaysBefore(today, slaDays + 1), "11:20")`, using a new local helper `workdaysBefore`.
  - `sla_due_at = addWorkingDays(created, 2)` = 18:00 of the previous working day. It is therefore overdue at any time of day on any weekday or weekend day, including the 04:00 reset.
  - An event «submitted» and an `appeal_new` notification to Irina (`/staff/appeals/<id>`).
  - Its number is О-2026-000006: it is inserted last, so the existing numbers keep their values.
- Irina's queue now holds 3 submitted appeals (one overdue) and she has 3 unread notifications.

**Tests:**
- `tests/demo/world.test.ts`:
  - «в очереди Ирины 3 новых…»: types, logins null, departments; every submitted appeal has an unread notification for Irina.
  - New: «ровно одно просроченное обращение» at Tue 12:00, Sun 12:00, Mon 00:30 and Fri 17:59 МСК. Each case has exactly one row (study_other, Захаров), with `sla_due_at = addWorkingDays(created, 2)` falling on a date before `now`.
  - RED: the new tests run against the old seed (`git stash` of world/people) → `2 failed | 17 passed`, «expected [stip…, …(1)] to deeply equal […(2)]». GREEN: `tests/demo` → 22 passed.
- Updated for the new world:
  - `tests/appeals/staff.test.ts`: new-tab order starts with study_other; summary `{new:3, inProgress:1, overdue:1}`; Friday overdue 3.
  - `tests/appeals/student.test.ts`: the next created number is О-2026-000007.
  - `tests/student-read.test.ts`: Irina has 3 notifications / 3 unread.
  - `tests/staff-cabinet.test.ts`: 3 hrefs, unread counts; «всем» → 5 recipients.
- `e2e/staff.spec.ts`:
  - The overdue scenario now uses the seeded appeal. The queue test checks summary 3/1/1, 3 cards, the first one «Другой учебный вопрос», «Захаров Никита Павлович, ЛИН-26-1», `data-overdue`, «просрочено на …».
  - The card test checks the bell going from «3 непрочитанных» to «2 непрочитанных».
  - `e2e/db.ts` (`makeOverdue`) was deleted as no longer used.
- Screenshots: all `04-*` were regenerated. `04-queue-overdue-*` were deleted, because they now duplicated `04-queue-new-*`, which shows the red ticket (viewed: on Sunday 8 Nov it shows «просрочено на 2 дня, до 6 ноября, 18:00»).

**Commands:**
- `npx vitest run tests/demo` → 22 passed.
- `npm test` → Test Files 35 passed · **Tests 381 passed**.
- `npx playwright test e2e/staff.spec.ts` → 18 passed; full `npx playwright test` → **54 passed**.
- `npx tsc --noEmit`, `npx eslint e2e` → clean; `npm run build` → ✓ Compiled successfully.
