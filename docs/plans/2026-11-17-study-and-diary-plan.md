# Успеваемость с порогами, неделя-дневник и раскрытие пары — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** «Семестр» с отметками порогов и «до N нужно ещё», неделя в «Парах» как дневник, раскрытие пары с полным ФИО, темой, заданием и материалами.

**Architecture:** Пороги и ближайшая точка — чистые функции в `src/server/grades.ts`, карточка дисциплины выносится в `src/ui/student/SubjectCard.tsx`. Темы и материалы — новая таблица `lesson_notes`, `loadLessons` в `src/server/schedule.ts` добавляет их в `Lesson.note`. Пара раскрывается встроенным `<details>` в `LessonCard`; неделя использует `LessonList` в компактном режиме без перерывов.

**Tech Stack:** Next.js 16 (App Router, серверные компоненты), Drizzle ORM 0.45 + PostgreSQL 17, CSS Modules на токенах `src/ui/tokens.css`, Vitest (реальная БД), Playwright (360 и 1280 px), axe.

**Spec:** `docs/specs/2026-11-17-study-and-diary-design.md`

## Global Constraints

- Пороги: экзамен и дифзачёт — «3» 55, «4» 70, «5» 85; зачёт — одна отметка «зачёт» 55.
- Тексты (дословно): «До «4» нужно ещё 9», «На «5» уже набрано», «На зачёт уже набрано», «До зачёта нужно ещё N», «Итог: хорошо», «Ближайшая точка: «<название>», до <день месяц>, до +<макс>», «просрочена с <день месяц>», «Остальное — на экзамене» / «Остальное — на зачёте», «Тема пока не указана», «Файлы выдаёт преподаватель», «Пар нет», «вместо <полное ФИО>».
- Типы материалов и подписи: `pdf` — «PDF», `slides` — «Презентация», `link` — «Ссылка», `book` — «Учебник».
- Оформление по `DESIGN.md` («Ведомость»): строки через линию, без новых теней и цветов вне токенов; обе темы; без встроенных скриптов (строгая CSP).
- Данные о парах — только по `v.groupId` из сессии; id из адреса не участвуют.
- Демо: заметки к парам с 7 дней назад по 14 дней вперёд от `now`; у каждой пятой встречи дисциплины (индекс встречи % 5 === 4) темы нет; материалов 0–3.
- Неделя: две колонки от 1024 px, дни по порядку слева направо; перерывы и «окна» — только в «Дне»; преподаватель в строке недели не показывается.
- Коммиты без подписи `Co-Authored-By` (правило автора).

## Review Focus

1. **Горизонтальный жест по строке пары в «Дне»** должен листать день и не раскрывать пару; нажатие без сдвига — раскрывать и не листать. → e2e в задаче 7.
2. **Перенесённая пара** (`moved`) показывает тему своей исходной пары, а не пустую. → тест в задаче 3.
3. **Длинные тексты** (тема в 200 символов, название материала без пробелов) не дают горизонтальной прокрутки на 360 px. → e2e в задаче 7.
4. **Баллы `null` или больше 100** в карточке дисциплины: считаем как 0 и как 100 соответственно, без NaN в тексте. → тесты в задаче 1.
5. **Две раскрытые пары одновременно** и повторное нажатие — сворачивает только свою. → тест компонента в задаче 5.

---

### Task 1: Пороги оценок и ближайшая точка

**Files:**
- Modify: `src/server/grades.ts`
- Test: `tests/grades-goal.test.ts`

**Interfaces:**
- Produces:
  - `type GradeMark = { label: string; at: number }`
  - `gradeMarks(form: ControlForm): GradeMark[]`
  - `type GradeGoal = { kind: "need"; label: string; need: number } | { kind: "reached"; label: string }`
  - `gradeGoal(points: number | null, form: ControlForm): GradeGoal` — баллы приводятся к 0–100; `need` — до ближайшей отметки выше текущих баллов; если все пройдены — `reached` с высшей.
  - `type NearestCheckpoint = { title: string; dueDate: string; maxPoints: number; overdue: boolean }`
  - `nearestCheckpoint(checkpoints: readonly CheckpointView[], today: string): NearestCheckpoint | null` — среди несданных (`score === null`) самая ранняя по `dueDate`; `overdue = dueDate < today`.

- [ ] **Step 1: Write the failing tests** — `gradeMarks("exam")` → `[{label:"3",at:55},{label:"4",at:70},{label:"5",at:85}]`, `graded_credit` так же, `credit` → `[{label:"зачёт",at:55}]`; `gradeGoal(61,"exam")` → `{kind:"need",label:"4",need:9}`; `gradeGoal(55,"exam")` → need «4» 15 (ровно на пороге — порог пройден); `gradeGoal(0,"exam")` → need «3» 55; `gradeGoal(null,"exam")` = как 0; `gradeGoal(85,"exam")` и `gradeGoal(140,"exam")` → `{kind:"reached",label:"5"}`; `gradeGoal(40,"credit")` → need «зачёт» 15; `gradeGoal(60,"credit")` → reached «зачёт». `nearestCheckpoint`: из точек с датами 2026-11-21 (несдана), 2026-11-12 (сдана), 2026-11-30 (несдана) при today 2026-11-17 → «21»-я, `overdue:false`; если несдана и 2026-11-12 → она, `overdue:true`; все сданы → `null`.
- [ ] **Step 2: Run** `npx vitest run tests/grades-goal.test.ts` — Expected: FAIL (функций нет).
- [ ] **Step 3: Implement** функции выше в `src/server/grades.ts`; пороги экзамена брать из тех же чисел, что `preliminaryGrade` (вынести их в одну константу `GRADE_THRESHOLDS`, `preliminaryGrade` использует её же).
- [ ] **Step 4: Run** `npx vitest run tests/grades-goal.test.ts tests/grades-pace.test.ts tests/student-read.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(study): пороги оценок и ближайшая контрольная точка`.

### Task 2: Карточка дисциплины с порогами

**Files:**
- Create: `src/ui/student/SubjectCard.tsx`, `src/ui/student/SubjectCard.module.css` (стили карточки переносятся из `src/app/(student)/study/study.module.css`, перенесённое там удалить)
- Modify: `src/app/(student)/study/page.tsx` (функция `Subject` заменяется на `<SubjectCard>`)
- Test: `tests/ui/subject-card.test.tsx`

**Interfaces:**
- Consumes: `gradeMarks`, `gradeGoal`, `nearestCheckpoint` (задача 1); `ruDateKey` из `src/server/format.ts` («21 ноября»).
- Produces: `SubjectCard({ e, today, riskIds }: { e: EnrollmentView; today: string; riskIds: Set<number> })`.

- [ ] **Step 1: Write the failing tests** (рендер через тот же способ, что в `tests/ui/student-components.test.tsx`): экзамен, 61 балл, точка «Контрольная 2» max 15 до 2026-11-21 при today 2026-11-17 → в тексте «До «4» нужно ещё 9» и «Ближайшая точка: «Контрольная 2», до 21 ноября, до +15»; на полосе три отметки с подписями «3», «4», «5» и атрибутом `data-at` 55/70/85; 90 баллов → «На «5» уже набрано»; `finalGrade:"4"` → «Итог: хорошо», строки «нужно ещё» нет; просроченная точка 2026-11-12 → «просрочена с 12 ноября»; нет несданных точек, экзамен → «Остальное — на экзамене», зачёт → «Остальное — на зачёте»; зачёт 40 баллов → «До зачёта нужно ещё 15» и одна отметка «зачёт»; `role="meter"` с `aria-valuetext`, содержащим «до «4» нужно ещё 9»; список контрольных точек по-прежнему в `<details>`.
- [ ] **Step 2: Run** `npx vitest run tests/ui/subject-card.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** `SubjectCard`: разметка из нынешнего `Subject` + отметки порогов поверх полосы (абсолютное позиционирование по `at`%) + строка из двух фактов под полосой (на 360 px — друг под другом).
- [ ] **Step 4: Run** `npx vitest run tests/ui` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(study): карточка дисциплины — отметки порогов, «до N нужно ещё», ближайшая точка`.

### Task 3: Таблица заметок к парам и чтение в расписании

**Files:**
- Modify: `src/server/db/schema.ts`, `src/server/schedule.ts`
- Create: миграция `drizzle/0002_*.sql` через `npm run db:generate`
- Test: `tests/student-read.test.ts` (новый `describe("заметки к парам")`)

**Interfaces:**
- Produces:
  - таблица `lessonNotes` (`lesson_notes`): `id` identity, `groupId` → groups, `date` date(string), `pair` integer 1–6 (check), `topic` text null, `task` text null, `materials` jsonb `LessonMaterial[]` not null default `[]`; `unique(group_id, date, pair)`.
  - `type LessonMaterial = { title: string; kind: "pdf" | "slides" | "link" | "book" }`
  - `type LessonNote = { topic: string | null; task: string | null; materials: LessonMaterial[] }`
  - `Lesson.note: LessonNote | null` (новое обязательное поле).

- [ ] **Step 1: Write the failing tests** (мир `buildDemoWorld(db, TUE, pw)`, затем вставка заметок прямо в `lesson_notes` для группы Алины и Дениса): заметка на группу Алины, 2026-11-10, пара 1 → `getDay(alina, TUE)[0].note` равна вставленной; та же дата и пара для группы Дениса не видна Алине; перенесённая в среду пара (`moved`, из теста «среда: … перенос пары») показывает заметку, вставленную на её **исходный** номер; отменённая пара 3 во вторник отдаёт свою заметку; пара без заметки → `note: null`; `getWeek` отдаёт заметки по всем дням.
- [ ] **Step 2: Run** `npx vitest run tests/student-read.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** схему, `npm run db:generate`, в `loadLessons` третий запрос `lessonNotes` по `groupId` и `inArray(date, keys)`; ключ сопоставления `${date}:${origPair}` для шаблонных пар и `${date}:${pair}` для `extra`.
- [ ] **Step 4: Run** `npx vitest run tests/student-read.test.ts tests/idor.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(schedule): заметки к парам — тема, задание, материалы`.

### Task 4: Вымышленные темы и материалы в демо

**Files:**
- Create: `src/server/demo/lesson-notes.ts`
- Modify: `src/server/demo/world.ts`
- Test: `tests/demo/world.test.ts`

**Interfaces:**
- Consumes: `lessonNotes`, `LessonMaterial` (задача 3).
- Produces: `LESSON_NOTES: Record<string /* название дисциплины из демо */, { topic: string; task?: string; materials: LessonMaterial[] }[]>` — для каждой дисциплины расписания демо не меньше 5 записей; `buildDemoWorld` заполняет `lesson_notes`.

- [ ] **Step 1: Write the failing tests:** после `buildDemoWorld(db, now)` для обеих групп есть заметки на каждый день с парами в окне `now-7 … now+14`; каждая заметка соответствует реальной паре (слот шаблона на этот день недели и чётность или `extra`-изменение); у дисциплины пятая по счёту встреча в окне — `topic === null`; у каждой заметки `materials.length` от 0 до 3; ни одного реального вуза или ФИО — названия только из справочника.
- [ ] **Step 2: Run** `npx vitest run tests/demo/world.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement:** справочник (вымышленные темы по дисциплинам демо, задания коротко, материалы вида «Методичка к лабораторной 3» / `pdf`); генерация через существующие `lessonsOn(group, key)` и `shiftKey`, индекс встречи считается по дисциплине и группе от начала окна. Очистка таблицы при сбросе уже происходит (truncate всех таблиц `public`).
- [ ] **Step 4: Run** `npx vitest run tests/demo tests/student-read.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(demo): вымышленные темы, задания и материалы пар на три недели`.

### Task 5: Пара раскрывается

**Files:**
- Modify: `src/ui/student/LessonCard.tsx`, `src/ui/student/LessonCard.module.css`, `src/ui/student/labels.ts` (подписи типов материалов)
- Test: `tests/ui/student-components.test.tsx`

**Interfaces:**
- Consumes: `Lesson.note`, `LessonMaterial` (задача 3).
- Produces: `LessonCard` рендерит `<details>`; `<summary>` — нынешняя строка пары; `MATERIAL_KIND_LABEL: Record<LessonMaterial["kind"], string>`.

- [ ] **Step 1: Write the failing tests:** корневой элемент карточки — `details`, в `summary` — название дисциплины и время; в раскрытой части: полное ФИО («Лебедев Сергей Павлович»), тема, задание, материалы с подписями типов («PDF», «Презентация»), «Файлы выдаёт преподаватель», аудитория и корпус; `note: null` → «Тема пока не указана», материалов и пометки нет; замена преподавателя → новое полное ФИО и «вместо <полное ФИО прежнего>»; преподаватель «уточняется» → «преподаватель уточняется»; отменённая пара раскрывается и показывает причину (`change.note`); две карточки рендерятся независимыми `details`.
- [ ] **Step 2: Run** `npx vitest run tests/ui/student-components.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement:** `<details>`/`<summary>` без JS; маркер раскрытия — значок lucide `ChevronDown` с поворотом через `[open]`; `summary` без системного треугольника; фокус `summary` виден (`:focus-visible` по токенам).
- [ ] **Step 4: Run** `npx vitest run tests/ui` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(schedule): пара раскрывается — полное ФИО, тема, задание, материалы`.

### Task 6: Неделя как дневник

**Files:**
- Modify: `src/ui/student/LessonList.tsx` (+ `.module.css`), `src/ui/student/LessonCard.tsx` (компактная строка), `src/app/(student)/schedule/page.tsx` и `schedule.module.css`
- Test: `tests/ui/schedule-view.test.tsx`

**Interfaces:**
- Consumes: `LessonCard` (задача 5).
- Produces: `LessonList` получает проп `gaps?: boolean` (по умолчанию `true`); в компактной карточке нет строки преподавателя.

- [ ] **Step 1: Write the failing tests:** `LessonList` с `compact` и `gaps={false}` не рендерит строк «Перерыв» / «Окно»; компактная карточка показывает номер, время, предмет, плашку типа, аудиторию и не показывает преподавателя в `summary` (в раскрытой части он есть); метка изменения («перенос», «замена», «отменена» — из `CHANGE_META`) есть в компактной строке.
- [ ] **Step 2: Run** `npx vitest run tests/ui/schedule-view.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement:** в режиме «Неделя» каждый день — блок с заголовком `ruDayTitle` и меткой «сегодня»; пары — `LessonList compact gaps={false}`; день без пар — строка «Пар нет» внутри блока (вместо нынешнего `EmptyState` в неделе); сетка дней: одна колонка, от 1024 px — `grid-template-columns: 1fr 1fr`, порядок DOM пн→сб.
- [ ] **Step 4: Run** `npx vitest run tests/ui` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(schedule): неделя как дневник — блоки дней, короткие строки, две колонки на компьютере`.

### Task 7: Сквозная проверка, доступность, показ автору

**Files:**
- Create: `e2e/study-diary.spec.ts`
- Modify: `e2e/a11y.spec.ts` (новые состояния в обеих темах)

- [ ] **Step 1: Write the e2e** (проекты 360 и 1280 из `playwright.config`): Алина, «Пары» → «День»: нажать первую пару → видно полное ФИО и «Тема…» или тему; нажать снова — свернулась; провести пальцем по строке пары влево (как в `e2e/swipe.spec.ts`) → сменился день, пара не раскрылась (Review Focus 1); «Неделя»: блоки дней, на 1280 две колонки (`getComputedStyle(...).gridTemplateColumns` из двух значений), на 360 одна; раскрыть пару в неделе; нет горизонтальной прокрутки (`scrollWidth <= clientWidth`) при раскрытой паре с длинной темой (Review Focus 3, тему подставить через `lesson_notes` в тестовой БД); «Учёба → Семестр»: видны отметки «3», «4», «5» и текст «нужно ещё» или «уже набрано».
- [ ] **Step 2: Add axe-состояния:** раскрытая пара в «Дне», неделя с раскрытой парой, «Семестр» — светлая и тёмная тема.
- [ ] **Step 3: Run** `npm test` и `npm run test:e2e` и `npm run lint` и `npx tsc --noEmit` — Expected: всё зелёное (до правок: 584 unit, 146 e2e).
- [ ] **Step 4: Показ автору:** собрать и запустить локально, во встроенном браузере снять «Семестр», «День» с раскрытой парой, «Неделю» — на 360 и 1280 px, в светлой и тёмной теме; отправить автору. **На сервер не выкладывать и в `main` не сливать до его одобрения.**
- [ ] **Step 5: Commit** `test(e2e): раскрытие пары, неделя-дневник, пороги в семестре; axe в обеих темах` и запись в `docs/process/LOG.md` по итогам.
