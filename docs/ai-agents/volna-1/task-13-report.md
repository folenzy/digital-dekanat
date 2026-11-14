# Task 13 report: «Деканат» — Спроси деканат, новое обращение, карточка обращения

**Status:** DONE_WITH_CONCERNS (concerns are notes and small deviations, nothing blocks Task 14)
**Model:** Claude Opus 5.5. The `frontend-design` skill was invoked first. I reused the «Бумага» system (tokens, Card, Button, Badge/StatusBadge, Tabs, Section, EmptyState, ErrorState, PageSkeleton, SubmitButton) and did not invent a second visual language.

## Commits (feat/volna-1, not pushed)
- `d2c12a6` feat(appeals): куда уйдёт подтип и дисциплины для пересдачи
- `1e7a0c6` feat(ui): тексты и логика обращений — мастер в адресе, ошибки, обратный отсчёт
- `4d67d47` feat(ui): части обращения — трек, переписка, поля, срок; поле формы
- `787a92a` feat(ui): обращения в деканат

## What was implemented

### Routes (`src/app/(student)/dekanat/**`)
Every page calls `requireStudent()`. Every action calls `requireStudent()` itself and never takes `now`, studentId or userId from the client.

| Route | Files | What it does |
|---|---|---|
| `/dekanat` | `page.tsx`, `dekanat.module.css`, `loading.tsx`, `error.tsx` | **Ask the deanery** is an ink sheet holding a `next/form` GET form (`?q=`). `searchKb` runs on the server, so it works without JS. Short query (<3 chars): hint «Напиши хотя бы три буквы…» and no search. With an empty query, three example queries are shown as links. **Results:** up to 3 `<article><details>` cards (question + excerpt; the first card is open and shows the full answer, CSS hides the excerpt when open). Each card has «Оформить» → `/dekanat/new?type=<code>` (only if the hit has a valid code; aria-label «Оформить: <подтип>») and «Не помогло — написать сотруднику» → `/dekanat/new?topic=<hit.topic>&text=<the student's query>`. **No hits:** EmptyState «Готового ответа нет» + «Написать сотруднику» → `/dekanat/new?text=<q>`. **Then:** a «Новое обращение» row, and «Мои обращения» (region) with small Tabs `?filter=active|done` and an empty state for each filter. |
| `/dekanat/new` | `new/page.tsx`, `new/AppealForm.tsx` (client), `new/new.module.css`, `loading.tsx`, `error.tsx` | **The wizard state lives in search params**, so it is server-rendered and the browser's back button works (tested). A step indicator (`nav` «Шаги нового обращения», 3 segments; finished steps link back with the text kept). **Step 1:** 3 topic links with an icon and a one-line description. **Step 2:** `?topic=` shows subtypes with `title`, `hint` and «обычно отвечаем за N раб. дн.». **Step 3:** `?type=` shows the form built for the subtype. **Params:** `type`/`topic` are checked with `isAppealTypeCode`/`Object.hasOwn`, so unknown values, `__proto__` and arrays fall back a step. `?text=` is trimmed and capped at 2000 UTF‑16 units without splitting a surrogate pair. `?prefill=1` with `stip_increased` fills `STIPEND_TEMPLATE`. A text from «Не помогло» is shown on steps 1–2 as «Твой вопрос перенесётся в обращение: «…»». **Before submit:** a dashed «label»: `Уйдёт в: <отдел из appeal_types> · ответ до <ruDate(slaDueForType(type, now))>`, plus «Срок считаем в рабочих днях, до 18:00 по Москве…», computed on the server. |
| `/dekanat/[id]` | `[id]/page.tsx`, `[id]/ReplyForm.tsx` (client), `[id]/appeal.module.css`, `[id]/not-found.tsx`, `loading.tsx`, `error.tsx` | **Lookup:** `getMyAppeal` → null → `notFound()`, which renders the page-level not-found «Обращение не найдено» + «К моим обращениям» inside the student shell. **Header:** «← Мои обращения», the `?created=1` banner «Обращение отправлено в «<отдел>». Ответим до <дата>.», number, type title, StatusBadge and department. **State panel by status:** submitted/in_progress → the promised time «Ответим до / завтра, 18:00» in big Literata, a live `Countdown` and «Занимается <assignee>»; overdue → red border, «просрочено на …» in danger, «Срок прошёл — сотрудник видит просрочку…». needs_info → region «Деканат ждёт твоего ответа»: the staff question (author, time) plus the highlighted answer form («Твой ответ» / «Ответить»). ready → «Справка готова», «Забрать: каб. 214, корпус А, до 13 ноября, 17:00» and «Получил». rejected → reason and «Оформить заново». **Then:** «Путь обращения» (timeline), «Что в обращении» (fields with human labels), «Переписка» (thread plus a reply form; hidden for rejected/closed, where it reads «Обращение закрыто — написать в него нельзя…»; while needs_info the form is in the top panel instead). |

### Actions (`src/app/(student)/dekanat/actions.ts`, `"use server"`)
- `createAppealAction(prev: AppealFormState, form: FormData): Promise<AppealFormState>`:
  - `typeCode` from the form is checked with `isAppealTypeCode`;
  - `fieldsFromForm(type, form)` takes only that subtype's fields, with numbers as numbers;
  - calls `createAppeal(v, type, fields)`;
  - failure → `appealFailureState`; success → `redirect('/dekanat/<id>?created=1')`.
- `postMessageAction(prev: MessageFormState, form: FormData): Promise<MessageFormState>`:
  - calls `postStudentMessage(v, appealId, text)`;
  - success → `refresh()` and `{ok:true, sent+1}`; failure → `{ok:false, error, sent}`.
- `confirmReceivedAction(form: FormData): Promise<void>`: calls `confirmReceived` then `refresh()`. It is a plain server-component form with SubmitButton, so it works without JS.

### Error copy
- **Appeal form** (`form-state.ts`):
  - validation → per-field texts from `fieldErrors` plus the summary «Проверь отмеченные поля» (`role=alert`). Focus moves to the first `aria-invalid` field. `typeCode`/`_form` errors are shown as the general text.
  - rate_limited → «Слишком много обращений за час — попробуй позже».
  - anything else → «Не получилось отправить, попробуй ещё раз».
- **Message:**
  - closed → «Обращение закрыто — написать в него нельзя».
  - rate_limited → «Слишком много сообщений, попробуй через несколько минут».
  - validation → the field error.
  - anything else → generic.
- **Forms use `noValidate`.** Browser validation bubbles would be in the system language; the server's Russian texts are shown instead.

### Shared pieces (outside the brief's file list, on purpose — Task 14's staff card needs the same)
- **`src/ui/appeals/`:**
  - `Timeline` is the track. A done stop is an ink dot; the current stop is coloured by kind (terracotta, ok, warn or danger) with a halo; the next stop is a dashed circle with sr-only «Дальше:». Event text is shown only for `ready` and `rejected`; the question and the replies live in the thread.
  - `Thread`: own messages on the right (`data-mine`) on accent-tint, staff on the left on paper, with author and time.
  - `FieldsSummary`.
  - `Countdown` (client): the first frame uses the server's `now`, so there is no hydration mismatch, then it ticks every 60 s.
  - `AppealListCard` (a list row; the Today page now uses it too, and its styles moved out of `today.module.css`).
  - `labels.ts`, `time-left.ts`.
- **`src/ui/Field.tsx` + `Field.module.css`:** `Field`, `FieldGroup`, `fieldAria()`; the input/select/textarea/radio-option classes match the login form.
- **`src/ui/Section.tsx`:** optional `id`, which makes the section a named region via `aria-labelledby`. This is backward compatible.
- **All user and seeded text is rendered as React text** with `white-space: pre-wrap; overflow-wrap: anywhere` (field values, the full answer, the thread, the question, the reason, timeline text).

### Other
- **Nudge copy** (`src/server/nudges.ts`) is now «<подтип>: деканату нужно уточнение. Ответь, и мы продолжим работу.» (copy only).
- **Removed** the Task 12 console exemption for `/dekanat` prefetch 404s in `e2e/student.spec.ts`. The filter there is now plain «no console errors», and the 404 test keeps its own document filter. All 18 student e2e tests pass without it.
- **`e2e/demo.ts`:** `shoot(page, name, width, series = "02")`, so the deanery screenshots go to `03-*`.

## Tests and results
- **E2E** `e2e/dekanat.spec.ts`: 9 scenarios × 2 projects (360 and 1280). The file resets the demo world in `beforeAll` and `afterAll`, because it mutates data.
  1. **Search to card.** Alina enters a short query → hint. «справка в военкомат» → the first answer is «Как получить справку для военкомата?», open with the full text, ≤3 cards, and the exact «Не помогло» href. «Оформить» → `?type=cert_military`. The label line matches `^Уйдёт в: Справки и документы · ответ до \d{1,2} [а-я]+$`. An empty submit → «Заполни поле» and `aria-invalid`. Filling the form and submitting → the card shows the exact banner, «Отправлено», «Ответим до» and «осталось …». In «Мои обращения» the new appeal shows «Отправлено» and «Ответ … до 18:00».
  2. **No hits:** `?q=абракадабра` → «Готового ответа нет» → «Написать сотруднику» → step 1.
  3. **Wizard:** «Новое обращение» → step 1 → «Учебные вопросы» (step 2, «обычно отвечаем за 2 раб. дня») → «Пересдача» (step 3). The discipline select has only Alina's own disciplines (Матан yes, Статистика no). Then `goBack()` → step 2; junk `type=__proto__&topic=constructor` → step 1. «Не помогло» from «когда приходит стипендия» → step 2 «Стипендия» → «Вопрос по выплате» → «Твой вопрос» is prefilled with the query.
  4. **Stipend nudge:** «Подать в 1 тап» on Today → prefilled «Прошу рассмотреть возможность назначения…» → submit → banner «…в «Стипендиальный отдел»…». The nudge then disappears from Today.
  5. **Double click:** a `dblclick()` on «Отправить» → exactly one «Справка об обучении» in the list.
  6. **Raw text:** an appeal with `<b>жирный</b> 😀` + a 1900-char word renders literally, there is no `<b>` element in `main`, and nothing scrolls sideways. A message `<i>курсив</i> 🎓` + a 1990-char word lands on the right with «Алина Миронова», the field clears, there is no `<i>`, and nothing scrolls sideways.
  7. **In-progress card:** the countdown, a timeline with «Принято в работу» and «Ирина Белова», and the fields shown with human labels.
  8. **Denis:** the needs_info card (question, «Статистика»). He answers → «В работе», the panel disappears, his message appears and the countdown is back. His ready certificate shows «Забрать: каб. 214, корпус А, до …». «Получил» → «Закрыто», the form is hidden, «Обращение закрыто — написать в него нельзя», and the appeal is listed under «Завершённые».
  9. **Not found:** Alina opens Denis's appeal id, then `not-a-uuid`, then a nil uuid → «Обращение не найдено» + «К моим обращениям» → `/dekanat`, with no trace of «Пересдача».
  - **Every scenario:** `scrollWidth <= clientWidth`, and no console errors.
- **Unit tests (Vitest):**
  - `tests/ui/dekanat.test.ts` (20): wizard params (junk, prototype keys, arrays, prefill, text trim/cap/surrogate), `wizardHref`, initial values (template, text → text, text → comment ≤500 for certificates), `fieldsFromForm` (numbers, NaN, empty comment dropped, `disciplineId` only for retake, extra fields dropped), `formValues`, the error copy, `writeToStaffHref`, countdown (minutes, hours, days, overdue, equal), labels, short names, field rows.
  - `tests/ui/appeal-parts.test.tsx` (4): Timeline markup, the next stop, event text only for ready/rejected and escaped; Thread `data-mine` for each side and escaped `<script>`; FieldsSummary escaped and empty.
  - `tests/dekanat-read.test.ts` (6): `getAppealRoute` for the three departments and an unknown code → null; `listAppealDisciplines` gives Denis debt first and then the 6 current disciplines, without passed ones; Alina has no debts and no foreign disciplines; a staff viewer → []; a picked discipline passes `createAppeal`.
- **Commands (final tree):**
  - `npx playwright test` → **36 passed (1.3m)** (18 dekanat + 18 student).
  - `npm test` → **Test Files 32 passed · Tests 348 passed**.
  - `npx tsc --noEmit` → exit 0. `npx eslint .` → exit 0.
  - `npm run build` → `✓ Compiled successfully`, with routes `ƒ /dekanat`, `ƒ /dekanat/[id]`, `ƒ /dekanat/new`.

### TDD evidence
- **E2E RED:** `npx playwright test e2e/dekanat.spec.ts --project=desktop-1280 -g "ответ из базы"` failed at `toHaveText("Деканат")`. The console showed `Failed to load resource: … 404 (Not Found) @ http://127.0.0.1:3100/dekanat`. Expected, because the route did not exist.
- **Unit RED:** `npx vitest run tests/ui/dekanat.test.ts` → failed to import `@/app/(student)/dekanat/wizard` (no tests ran). `npx vitest run tests/dekanat-read.test.ts` → failed to import `@/server/appeals/catalog`. Expected, because the modules did not exist.
- **GREEN:**
  - `tests/ui/dekanat.test.ts` → 20 passed on the first implementation.
  - `tests/dekanat-read.test.ts` → 5 of 6 at first. The failure was my wrong assumption about the demo data: Denis also has «Профессиональный иностранный язык» in semester 5. I fixed the expectation → 6 passed.
- **First full e2e run:** 8 of 9 passed. The failure was my locator: `getByLabel("Спроси деканат")` also matched the section labelled by the same heading. I removed the redundant region (the form is already `role=search`) and used `getByRole("searchbox")` → 18/18.
- **Not TDD:** `tests/ui/appeal-parts.test.tsx` was written after the components. Its only failure was a wrong expectation in the test (the `</time>` between the time and the name).

### Screenshots (`docs/screenshots/03-*-{360,1280}.png`, 20 files)
`ask`, `ask-empty`, `wizard-1`, `wizard-2`, `wizard-3`, `card-created` (with the banner), `card-in-progress`, `card-needs-info`, `card-ready`, `not-found`. I reviewed the 360 and 1280 shots. After that review I fixed four things:
- On a phone the search button hid the input text, so the magnifier icon is hidden under 600 px.
- «Не помогло — написать сотруднику» wrapped as a centred two-line pill; it is now left-aligned link-style text.
- The examples line is no longer repeated under results.
- Topic icons are top-aligned on mobile.

The `02-*` screenshots were regenerated by the run (time-dependent text, and the new needs_info copy on `today-denis`).

## Design notes (frontend-design)
- **One idea across three screens: the appeal as a parcel.** The wizard ends with a dashed «label» (where it goes and by when). The card's centre is the promised time in big Literata with a live countdown. «Путь обращения» is a tracking line with a dashed next stop.
- **«Спроси деканат»** is the only ink surface on `/dekanat`. Ink already means «деканат говорит с тобой» on Today («Деканат пишет первым»).
- **Everything else is quiet** and reuses existing patterns: paper sheets with ruled rows (fields like «Скоро дедлайны»), accent frames for «needs your action», status-coloured frames for ready/rejected.

## Self-review findings (fixed)
- `listAppealDisciplines` deduplicated twice (a Set of ids plus a filter); simplified to one Map.
- `Countdown` called `setState` synchronously in an effect; the first tick is now `setTimeout(…, 0)`.
- `countdown.ts` and `Countdown.tsx` clashed on Windows (case-insensitive FS, TS1149); the pure module was renamed to `time-left.ts`.
- A redundant region/label on the ask section (see TDD).
- The examples line under results and the mobile layout issues (see screenshots).

## Deviations / decisions (please acknowledge)
1. **The retake discipline select = past-session debts + current semester**, not only current enrollments. The main retake case is a past debt: Denis's Статистика (semester 4) would otherwise be unselectable. The options are grouped «Долги» / «Текущий семестр». `createAppeal` already accepts any own enrollment. New server function: `listAppealDisciplines` in `grades.ts`.
2. **«Не помогло» carries the student's own query** as `text`, not the KB question.
3. **For certificates** the carried `?text=` goes into «Комментарий» (≤500): certificates have no `text` field.
4. **Banner wording:** «Обращение отправлено в «Справки и документы». Ответим до …» uses quotes, because «в Справки и документы» is ungrammatical. Same for the other two departments.
5. **Department names come from the DB** via the new `getAppealRoute(code)` (`src/server/appeals/catalog.ts`, catalog data, no Viewer). This is the same table `createAppeal` routes by.
6. **needs_info:** the answer form is in the top panel together with the question, and the regular message form is hidden while needs_info. Without this the same form would appear twice.
7. **Shared UI** is in `src/ui/appeals/*` and `src/ui/Field*`, plus the small `Section` `id` and the Today refactor to `AppealListCard`. All of it is beyond the brief's file list, for reuse in Task 14.
8. **Timeline names:** short names on both sides, «Ирина Белова» and «Алина Миронова». The promise panel shows the full assignee name «Ирина Николаевна Белова».

## Concerns / notes
1. **«Обращение не найдено» returns HTTP 200, not 404.** `(student)/loading.tsx` starts streaming before `notFound()` runs (`node_modules/next/dist/docs/.../loading.md` «Status codes»). Next adds `noindex`, and the UI is the 404 page. Checked with a throwaway spec: `/dekanat/not-a-uuid` → 200, nil uuid → 200. A real 404 would need a check before streaming, for example malformed ids in `proxy.ts` (Task 10); foreign ids still need the DB. The e2e console filter already allows a 404 on those documents, in case that changes.
2. **Not covered by e2e:**
   - the overdue look (red countdown and border): the demo world has no overdue appeal at render time; `countdown()` is unit-tested and the CSS is `data-overdue`;
   - the rejected panel: no rejected appeal in the demo world;
   - the rate-limited copy and the empty-message validation: unit-tested only;
   - the live update when staff acts: `LiveEvents` → `router.refresh()` from Task 9; this needs Task 14 to try end to end.
3. **The double-click test** passes on both protections at once: the button disables while pending, and `createAppeal` deduplicates for 10 s. The e2e cannot tell which one caught it.
4. **Wording:** «Получил» is masculine, as in the brief. The stipend template avoids gendered verbs.
5. **`docs/process/LOG.md` was not touched**, per the global constraints; the controller keeps it.

## Interfaces later tasks can rely on
```ts
// src/server/appeals/catalog.ts (server-only)
export type AppealRoute = { department: DepartmentInfo; slaDays: number };
export async function getAppealRoute(code: AppealTypeCode): Promise<AppealRoute | null>;

// src/server/grades.ts
export type AppealDiscipline = { id: number; name: string; debt: boolean };
export async function listAppealDisciplines(v: StudentViewer, now: Date): Promise<AppealDiscipline[]>;

// src/ui/appeals/* (server-safe components unless noted)
export function Timeline(p: { events: AppealEventView[]; now: Date; next?: string }): JSX.Element;
export function Thread(p: { messages: AppealMessageView[]; now: Date; mine: "student" | "staff" }): JSX.Element; // li[data-author][data-mine]
export function FieldsSummary(p: { appeal: Pick<AppealDetail, "fields" | "disciplineName" | "type"> }): JSX.Element | null;
export function AppealListCard(p: { appeal: AppealListItem; now: Date }): JSX.Element; // links to /dekanat/<id> (student)
export function Countdown(p: { due: string; serverNow: string; className?: string }): JSX.Element; // "use client"; <time data-overdue>
// time-left.ts
export type Countdown = { text: string; overdue: boolean };
export function countdown(due: Date, now: Date): Countdown; // «осталось 5 ч 12 мин» / «просрочено на 2 ч 10 мин»
// labels.ts
export const TOPIC_META: Record<AppealTopic, { title: string; text: string }>;
export const TOPICS: AppealTopic[];
export function isTopic(x: unknown): x is AppealTopic;
export function slaPhrase(days: number): string;            // «обычно отвечаем за 2 раб. дня»
export function textLabel(kind: AppealKind): string;        // «Текст заявления» | «Твой вопрос»
export const FORMAT_LABEL: Record<string, string>;
export function personShortName(fullName: string, role: "student" | "staff"): string; // «Ирина Белова»
export const EVENT_LABEL: Record<AppealEventKind, string>;
export function fieldRows(a): { label: string; value: string }[];

// src/ui/Field.tsx
export function Field(p: { id: string; label: ReactNode; hint?: ReactNode; error?: string; optional?: boolean; children: ReactNode }): JSX.Element;
export function FieldGroup(p: { id: string; legend: ReactNode; error?: string; children: ReactNode }): JSX.Element;
export function fieldAria(id: string, o: { hint?: boolean; error?: string }): { "aria-invalid"?: true; "aria-describedby"?: string };
// Field.module.css classes: input, select, textarea, option, label, hint, error

// src/ui/Section.tsx — Section({ title, action?, children, className?, id? }) — id → aria-labelledby (region)

// src/app/(student)/dekanat/wizard.ts / form-state.ts (student-only)
parseWizardParams(sp), wizardHref({topic?, type?, text?}), typesOfTopic(topic), STIPEND_TEMPLATE,
formFieldNames(type), initialValues(type, text, prefill), formValues(type, form), fieldsFromForm(type, form);
AppealFormState, appealFailureState(f, values), MessageFormState, messageFailureText(f), writeToStaffHref(topic, q)

// e2e/demo.ts
export async function shoot(page, name, width, series = "02"): Promise<void>;
```
