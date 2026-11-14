# Task 15 report — сквозные проверки, мобильная версия, доступность

Commit: 697180b test(e2e): сквозные сценарии, IDOR, мобильная версия, доступность

## Карта покрытия (шаг брифа -> тест)
- Flow (два контекста, тост+колокольчик <=5 с, без перезагрузки): НОВЫЙ e2e/flow.spec.ts (маркер __sameDocument; ранее частично staff.spec.ts:258 «справка готова»).
- Чужая карточка студента -> «не найдено»: dekanat.spec.ts:266 (уже было). Подмена id в форме / сырой повтор действия: НОВЫЙ idor.spec.ts (3 теста; контроли: тот же повтор со своими куками работает).
- Алина -> /staff, /staff/appeals/<id> -> 404: staff.spec.ts:363, security-headers.spec.ts:222 (было) + idor.spec.ts:86. Ирина/аноним не вызывают студенческие действия: НОВЫЙ idor.spec.ts:121. Алина не вызывает служебные действия: idor.spec.ts:86.
- Мобильный 360x740 все экраны/статусы, цели >=44: НОВЫЙ mobile.spec.ts (только mobile-360; desktop-1280 игнорирует файл в playwright.config.ts). Старые expectFits в student/dekanat/staff остались.
- «<b>жирный</b> 😀» + 2000 симв.: dekanat.spec.ts:192 (1900) + mobile.spec.ts (обращение и сообщение, >=2000).
- Ночной сброс при открытой вкладке: НОВЫЙ reset.spec.ts (POST demo-reset с токеном из env, вкладка сама приходит на /login?reason=expired за ~26 с через session_end; heartbeat 25 с не конфигурируется, код не менял). Плюс 404 без токена. afterAll пересобирает демо-мир.
- a11y (axe wcag2a/aa/21a/21aa, 0 serious/critical): НОВЫЙ a11y.spec.ts, оба ширины: /login (+expired), /, /schedule(+week), /study (3 вкладки), /dekanat, /dekanat?q, /dekanat/new, cert_military, stip_increased, карточка Алины, карточки Дениса (needs_info, ready), /notifications (+объявления), /profile, /about, форма с ошибкой, /staff (4 вкладки), карточка сотрудника, форма отказа, /staff/announcements, /staff/profile.
- Скриншоты: docs/screenshots/05-realtime-toast-{360,1280}.png (снимок окна, тост закреплён), 05-queue-irina-1280.png, 05-login-a11y-{360,1280}.png.

## Новые вспомогательные
- e2e/db.ts: readRows (только чтение, локальная БД), appealSnapshot. e2e/demo.ts: collectConsoleErrors, waitForEventStream.

## Исправления UI (найдены axe)
1. label-content-name-mismatch: колокольчик в боковой панели (видимое «Уведомления 6» vs подпись «Уведомления: 6 непрочитанных») — число теперь через ::before из data-count (src/ui/Bell.tsx, Bell.module.css); aria-label не менялся.
2. label-content-name-mismatch: ссылка-логотип публичных страниц — подпись «На связи цифровой деканат — на главную» (PublicPage.tsx), пробел между «На связи» и подзаголовком (Logo.tsx). 4 e2e-локатора «На связи — на главную» заменены на regex /^На связи.* на главную$/ (staff.spec.ts, security-headers.spec.ts).
3. color-contrast 4.36:1: подсказка в summary формы «Отклонить» -> var(--muted-strong) (appeal.module.css).

## Результаты
- npx playwright test (свежая prod-сборка): 91 passed (68 прежних + 23 новых; каждый тест падает при ошибке консоли), 4.9 мин.
- npm test: 37 файлов, 399 passed. tsc --noEmit чисто. eslint чисто. build — внутри webServer успешно.
- RED-этап: в e2e первые прогоны flow/idor прошли сразу; осмысленность idor подтверждена контролями (тот же повтор со своими куками увеличивает число сообщений). a11y: был RED (3 нарушения), стал GREEN после правок.

## Замечания
- Коммит содержит и перегенерированные старые скриншоты 02–04 (меняются время/данные при каждом прогоне).
- mobile.spec.ts сам создаёт обращения (отклонённое, закрытое) через UI, т.к. в сиде нет rejected/closed у студентов.
- Заметка для Review: LOG.md не трогал.

## Fix round 1
Changes:
- e2e/reset.spec.ts: `test.use({ trace: "off", video: "off", screenshot: "off" })`; сброс отправляется Node `fetch` (функция nightlyReset), а не page.request. Другого места, где DEMO_RESET_TOKEN идёт через Playwright, нет (grep по e2e: только reset.spec.ts; тест «без токена» шлёт заведомо неверную строку).
- Сужен фильтр консоли: убран совсем, `expect(errors).toEqual([])` строгий (при запуске лишних сообщений нет).
- Новый тест reset: после сброса `page.goto('/dekanat')` -> `/login?reason=expired` + пояснение, без ожидания пинга потока.
- idor.spec.ts: пустую проверку заменил на реальный фрагмент из переписки Дениса «Эта дата вам подходит» (вопрос сотрудника из world.ts).
Evidence 1 (токен не утекает): временно добавил `expect(1).toBe(2)` в быстрый reset-тест, прогнал с html-репортёром -> тест упал; node-скрипт (scratchpad/scan.cjs, печатает только found/not found) по test-results/ и playwright-report/ (4 файла, трейса нет): `not found`. Контроль сканера: положил токен в test-results/control.txt -> `found`, exit 1. Принудительный фейл откатан. Финальный скан после полного прогона: см. ниже.
Evidence 2 (мутационная проверка IDOR): в src/server/appeals/access.ts studentScope временно возвращал sql`true`.
  Команда: `npx playwright test idor --project=desktop-1280`
  Мутация: 1 failed (idor.spec.ts:53 «подмена id…»: снимок обращения Дениса изменился, status needs_info -> in_progress), 2 passed (тесты 2 и 3 проверяют staffScope и роль, studentScope не затрагивают; ожидаемо).
  После отката мутации (git status по src чисто): 3 passed (20.4s). Мутация не закоммичена.
Итог: tsc чисто, eslint чисто, npm test 37 файлов/399 passed, весь e2e на свежей сборке 93 passed (4.9 мин).
