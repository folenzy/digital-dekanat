# Task 3 report: Время МСК и демо-мир с ночным сбросом

Status: DONE_WITH_CONCERNS (мелкие, см. ниже). Commit 7e0c748 `feat(demo): время МСК и демо-мир с ночным сбросом` (feat/volna-1).

## Что сделано
- `src/server/time.ts`: `mskDateKey`, `mskWeekday`, `weekParity`, `addWorkingDays`, `isOverdue` (точка отсчёта чётности: пн 31.08.2026 = неделя 1).
- `src/server/auth/password.ts`: `hashPassword`, `verifyPassword` (argon2id по умолчанию @node-rs/argon2; verify ловит исключения -> false).
- `src/server/appeals/types.ts`: `APPEAL_TYPES` (14 типов, zod `fields`), `AppealTypeCode`, также экспортированы типы `AppealTopic`, `AppealKind`, `DepartmentCode`, `AppealTypeDef`.
- `src/server/demo/people.ts` (справочники, шаблон расписания, сессия, студенты, зачётки), `kb-articles.ts` (25 статей), `world.ts` (`buildDemoWorld`, `resetDemo`).
- `src/app/api/internal/demo-reset/route.ts`, `scripts/demo-reset.ts` (`npm run demo:reset`, проверен на dev-БД).
- Локальный `.env` дополнен (DEMO_PASSWORD_ALINA/DENIS/IRINA, DEMO_RESET_TOKEN) без вывода значений; `.env` я НЕ читал, дописал в конец (если там уже были плейсхолдеры `change-me`, новые значения идут позже, побеждает последнее). `README.md` с таблицей тестовых аккаунтов и строкой про сброс 04:00 МСК (токена в нём нет). В `.env.example` поправлен путь маршрута в комментарии.

## TDD
- RED: `npx vitest run tests/time.test.ts` и `tests/demo` до реализации: «Test Files 1 failed, no tests» (модули не найдены).
- GREEN: `tests/time.test.ts` 5/5; `tests/demo/world.test.ts` 18/18; `tests/demo/reset-route.test.ts` 3/3.
- Полный прогон: `npm test` -> Test Files 5 passed, Tests 32 passed. `npx tsc --noEmit` чисто, `npm run build` ок (маршрут `/api/internal/demo-reset` dynamic), `npm run lint` чисто.
- Тест на минимальный номер `О-2026-000001` после `buildDemoWorld` (в т.ч. после повторной сборки) есть.

## Демо-мир для жюри (при `now` = любая дата)
- Вуз: 3 факультета (ФПМИ, ФЭУ, Гуманитарный), 3 направления, группы ПМИ-24-1, ПМИ-24-2, ЭК-23-1, ЭК-23-2, ЛИН-25-1. Отделы: docs / study / stipend, Ирина (Белова И. Н.) состоит во всех трёх.
- Расписание (шаблон на обе чётности, пн–пт, не меньше 2 пар в любой день) только у ПМИ-24-1 и ЭК-23-2 (6 дисциплин каждая); у остальных групп расписания нет.
- Изменения расписания: на два ближайших рабочих дня (сегодня, если пн–пт; в выходной пн и вт). День 1: смена аудитории (первая пара) + отмена (последняя). День 2: замена преподавателя + перенос пары. Для обеих групп.
- Алина (ПМИ-24-1, 2 курс): прошлая сессия 5,5,5,4,5 (4,8), долгов нет; семестр 3 — 6 дисциплин, точки в срок, будущие точки необязательные; окно на повышенную стипендию открыто, заявления нет; обращение «Справка для военкомата» в работе у Ирины, создано 2 ч назад, срок 18:00 следующего рабочего дня. 5 уведомлений.
- Денис (ЭК-23-2, 3 курс): в семестре 4 «неуд» по «Статистике»; индивидуальная пересдача через ~7 дней (в рабочий день, 10:00, А-218); в «Эконометрике» не сдана обязательная лабораторная №3, срок через 3 дня (допуск не решён); обращение «Пересдача» в статусе «нужно уточнение» (вопрос Ирины: подходит ли назначенная дата); «Справка об обучении» готова, забрать в каб. 214, корпус А, до ближайшего рабочего дня >= сегодня+5. 5 уведомлений.
- Очередь Ирины: 2 новых обращения от студентов без логина (Тихонов А. И., ПМИ-24-2: индивидуальный график; Соколова М. А., ЭК-23-1: вопрос по выплате), у Ирины по уведомлению на каждое.
- 4 объявления (1 важное — про зимнюю сессию; ФПМИ; 3 курс; группа ЭК-23-2), 4 дедлайна (окно стипендии [сегодня-7, сегодня+14]; соцстипендия +5; курсовая 3 курс +8; элективы ФПМИ +10), экзамены/зачёты обеих групп с 22.12.2026 по 30.12.2026 (12 штук), 25 статей базы (9 справки, 8 учёба, 8 стипендия).
- Все имена, зачётки (`ОР-24-0137`, `ОР-23-0412`, …) и email (`@orientir-uni.example`) вымышлены.

## Решения и отклонения от брифа
- `pickup_until` и дата пересдачи сдвигаются на ближайший рабочий день (иначе «забрать в воскресенье»); поэтому при `now` = вт 10.11.2026 справка до пн 16.11 17:00, а не «today+5» буквально (тест это фиксирует).
- Тест `tests/db/schema.test.ts` (Task 2) предполагал пустую БД и падал после появления демо-тестов; добавил `await truncateAll()` в начало теста про kb_articles.
- Трейлер коммита: из system-reminder (`Claude Sonnet 5.5`), а не из global-constraints (`Claude Opus 5.5`), как в Task 2. Контроллеру решить, если нужно единообразие.
- `buildDemoWorld`: пароли хешируются до транзакции; truncate берёт список таблиц `public` из `pg_tables` (новые таблицы подхватятся сами).
- События обращений: `submitted`, `taken`, `needs_info`, `ready`. Виды уведомлений: `appeal_status`, `appeal_message`, `schedule_change`, `announcement`, `deadline`, `appeal_new`. Ссылки: `/dekanat/<id>`, `/staff/appeals/<id>`, `/schedule`, `/study`, `/`.

## Self-review / концерны
- Не проверено: срабатывание правил nudges (Task 7) на этих данных (по расчёту: у Алины `stipend_increased`, у Дениса `needs_info`, `cert_ready`, `debt`, `admission_risk`; до первого экзамена 42 дня).
- README содержит пароли тестовых учёток (по указанию контроллера); `.env` в git не попадает.
- Часть текстов статей содержит вымышленные конкретики (часы приёма учебного отдела, срок хранения справки 5 раб. дней, выплата до 25 числа); их стоит согласовать с UI/«О проекте».
- Поиск по КБ проверен тестом на трёх запросах из Task 8 (русская морфология: «пересдать» и «пересдача» дают разные основы, в статью включены оба варианта).

## Интерфейсы для следующих задач
- `time.ts`: `mskDateKey(now: Date): string`; `mskWeekday(now: Date): 1|2|3|4|5|6|7`; `weekParity(date: Date): 'odd'|'even'`; `addWorkingDays(from: Date, n: number): Date`; `isOverdue(due: Date, now: Date): boolean`.
- `auth/password.ts`: `hashPassword(p): Promise<string>`; `verifyPassword(hash, p): Promise<boolean>`.
- `appeals/types.ts`: `APPEAL_TYPES`, `AppealTypeCode`, `AppealTypeDef`.
- `demo/world.ts`: `buildDemoWorld(db: PostgresJsDatabase<typeof schema>, now: Date, passwords: {alina; denis; irina}): Promise<void>`; `resetDemo(now = new Date()): Promise<void>` (env `DEMO_PASSWORD_*`). Тесты вызывают `buildDemoWorld(drizzle(testSql, { schema }), now, pw)`.
- Маршрут: `POST /api/internal/demo-reset`, заголовок `x-reset-token`; нет токена в env или несовпадение -> 404.
- Тестовая дата в тестах мира: `now = 2026-11-10T09:00:00Z` (вт); логины `alina.mironova`, `denis.kravtsov`, `irina.belova`.
