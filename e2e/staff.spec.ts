import { expect, test, type Page } from "@playwright/test";
import { hasNoHorizontalScroll, resetDemoWorld, shoot, signIn } from "./demo";

// Кабинет сотрудника (Ирина Белова): очередь, карточка обращения, объявления, профиль — на 360 и 1280 px.
// Сценарий идёт по шагам над одним демо-миром (взять → ответить → уточнить, отклонить, «готово»),
// поэтому тесты файла последовательные, а демо-мир пересобирается до и после.
// Скриншоты → docs/screenshots/04-<экран>-<ширина>.png.

test.describe.configure({ mode: "serial" });

const widthOf = (page: Page) => page.viewportSize()!.width;
/** Снимок всей страницы с начала: иначе липкие шапка и боковая панель окажутся посреди длинного снимка. */
async function snap(page: Page, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot(page, name, widthOf(page), "04");
}

/**
 * Ошибки консоли запрещены везде. Исключение — 404 на документы, которые в своём тесте и должны быть 404
 * (чужая роль, несуществующее обращение).
 */
type ConsoleError = { text: string; url: string };
let consoleErrors: ConsoleError[] = [];
let allowed404 = new Set<string>();
function watchConsole(p: Page) {
  p.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push({ text: msg.text(), url: msg.location().url });
  });
  p.on("pageerror", (e) => consoleErrors.push({ text: e.message, url: "" }));
}
test.beforeEach(({ page }) => {
  consoleErrors = [];
  allowed404 = new Set();
  watchConsole(page);
});
test.afterEach(() => {
  const unexpected = consoleErrors.filter((e) => {
    const path = e.url ? new URL(e.url).pathname : "";
    return !(allowed404.has(path) && e.text.includes("404"));
  });
  expect(unexpected.map((e) => `${e.text} @ ${e.url}`)).toEqual([]);
});

test.beforeAll(() => resetDemoWorld());
test.afterAll(() => resetDemoWorld());

async function expectFits(page: Page) {
  expect(await hasNoHorizontalScroll(page), "горизонтальная прокрутка").toBe(true);
}

/** Число в сводке над очередью по подписи. */
function figure(page: Page, label: string) {
  return page.getByRole("region", { name: "Сводка по моим отделам" })
    .locator("dt", { hasText: new RegExp(`^${label}$`) })
    .locator("xpath=following-sibling::dd[1]");
}

function queueTab(page: Page, name: string) {
  return page.getByRole("navigation", { name: "Вкладки очереди" }).getByRole("link", { name });
}

/** Карточки обращений текущей вкладки. */
function cards(page: Page) {
  return page.getByRole("list", { name: "Обращения" }).getByRole("link");
}

function bell(page: Page) {
  return page.getByRole("link", { name: /^Уведомления/ });
}

test("очередь: сводка, вкладки со счётчиками, просрочка первой, фильтр по отделу, пустое состояние", async ({ page }) => {
  await signIn(page, "irina");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Очередь");

  // сводка по всем отделам Ирины: три новых (одно просрочено — так засеян демо-мир), одно в работе,
  // первый ответ в среднем за 40 мин
  await expect(figure(page, "Новых")).toHaveText("3");
  await expect(figure(page, "В работе")).toHaveText("1");
  await expect(figure(page, "Просрочено")).toHaveText("1");
  await expect(figure(page, "Первый ответ в среднем за неделю")).toHaveText("42 мин");

  // «Новые»: по сроку, ближайший сверху — просроченный, с красным корешком
  await expect(queueTab(page, "Новые")).toHaveAttribute("aria-current", "page");
  await expect(queueTab(page, "Новые")).toContainText("3");
  await expect(queueTab(page, "Ждут студента")).toContainText("1");
  await expect(cards(page)).toHaveCount(3);
  const late = cards(page).first();
  await expect(late).toContainText("Другой учебный вопрос");
  await expect(late).toContainText("Захаров Никита Павлович, ЛИН-26-1");
  await expect(late).toHaveAttribute("data-overdue", "true");
  await expect(late).toContainText(/просрочено на \d+ (ч|мин|дн(я|ей)|день)/);
  // остальные — в срок: таймер, студент с группой, отдел, статус
  const next = cards(page).nth(1);
  await expect(next).not.toHaveAttribute("data-overdue", "true");
  await expect(next).toContainText("Индивидуальный график");
  await expect(next).toContainText("Тихонов Артём Игоревич, ПМИ-25-2");
  await expect(next).toContainText("Учебный отдел");
  await expect(next).toContainText("Отправлено");
  await expect(next).toContainText(/осталось \d+ (ч|мин|дн(я|ей))/);
  await expect(cards(page).nth(2)).toContainText("Вопрос по выплате");
  await expectFits(page);
  await snap(page, "queue-new");

  await queueTab(page, "В работе").click();
  await expect(page).toHaveURL(/\/staff\?tab=in_progress$/);
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText("Справка для военкомата");
  await expect(cards(page).first()).toContainText("Миронова Алина Сергеевна, ПМИ-25-1");
  await expect(cards(page).first()).toContainText("ведёт Ирина Белова");
  await snap(page, "queue-in-progress");

  await queueTab(page, "Ждут студента").click();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText("Пересдача");
  await expect(cards(page).first()).toContainText("Кравцов Денис Олегович, ЭК-24-2");
  await expect(cards(page).first()).toContainText(/вопрос задан (сегодня|вчера|\d{1,2} [а-я]+), \d{2}:\d{2}/);
  await snap(page, "queue-waiting");

  await queueTab(page, "Закрытые").click();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText("Справка об обучении");
  await expect(cards(page).first()).toContainText("Готово");
  await expectFits(page);
  await snap(page, "queue-closed");

  // фильтр по отделу: «Справки и документы» — в «Новых» пусто, в «В работе» — справка Алины
  await queueTab(page, "Новые").click();
  const depts = page.getByRole("navigation", { name: "Отдел" });
  await depts.getByRole("link", { name: "Справки", exact: true }).click();
  await expect(page).toHaveURL(/\/staff\?dept=\d+$/);
  await expect(depts.getByRole("link", { name: "Справки", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Новых обращений нет" })).toBeVisible();
  await expectFits(page);
  await snap(page, "queue-empty");
  await queueTab(page, "В работе").click();
  await expect(page).toHaveURL(/\/staff\?tab=in_progress&dept=\d+$/);
  await expect(cards(page)).toHaveCount(1);

  // чужой или кривой отдел в адресе → все отделы
  await page.goto("/staff?tab=new&dept=99999");
  await expect(depts.getByRole("link", { name: "Все отделы" })).toHaveAttribute("aria-current", "page");
  await expect(cards(page)).toHaveCount(3);
});

test("просроченная карточка: красный срок и пояснение; открытая карточка гасит своё уведомление", async ({ page }) => {
  await signIn(page, "irina");
  await expect(bell(page)).toHaveAttribute("aria-label", "Уведомления: 3 непрочитанных");

  await cards(page).filter({ hasText: "Другой учебный вопрос" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Другой учебный вопрос");
  await expect(page.getByText(/^просрочено на \d/)).toBeVisible();
  await expect(page.getByText("Срок прошёл — студент тоже видит просрочку.")).toBeVisible();
  // сотрудник видит «Вопрос студента», а не «Твой вопрос»
  await expect(page.getByText("Вопрос студента", { exact: true })).toBeVisible();
  // уведомление о новом обращении прочитано — счётчик колокольчика уменьшился
  await expect(bell(page)).toHaveAttribute("aria-label", "Уведомления: 2 непрочитанных");
  await expectFits(page);
  await snap(page, "card-overdue");
});

test("взять в работу, ответить, запросить уточнение — всё попадает в путь обращения", async ({ page }) => {
  await signIn(page, "irina");
  await cards(page).filter({ hasText: "Индивидуальный график" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Индивидуальный график");
  await expect(page.getByText("Отправлено", { exact: true }).first()).toBeVisible();

  // о студенте — только ФИО, факультет, группа, курс
  const student = page.getByRole("region", { name: "Студент" });
  await expect(student.locator("dt")).toHaveText(["ФИО", "Факультет", "Группа", "Курс"]);
  await expect(student.locator("dd")).toHaveText([
    "Тихонов Артём Игоревич", "Факультет прикладной математики и информатики", "ПМИ-25-2", "2",
  ]);
  await expect(page.getByText("Текст заявления", { exact: true })).toBeVisible();
  await expectFits(page);
  await snap(page, "card-submitted");

  await page.getByRole("button", { name: "Взять в работу" }).click();
  await expect(page.getByText("В работе", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Взять в работу" })).toHaveCount(0);
  const timeline = page.getByRole("region", { name: "Путь обращения" });
  await expect(timeline.getByText("Принято в работу")).toBeVisible();
  await expect(timeline.getByText("Ирина Белова").first()).toBeVisible();
  await expect(page.getByText("Ведёт Ирина Николаевна Белова")).toBeVisible();

  // пустой ответ — ошибка у поля; ответ — справа, поле очищается
  const reply = page.getByLabel("Ответ студенту");
  await page.getByRole("button", { name: "Ответить" }).click();
  await expect(page.getByText("Заполни поле")).toBeVisible();
  await expect(reply).toHaveAttribute("aria-invalid", "true");
  await reply.fill("Здравствуйте! Свободное посещение оформим. Принесите, пожалуйста, справку с места работы в каб. 214.");
  await page.getByRole("button", { name: "Ответить" }).click();
  const mine = page.locator('[data-author="staff"]').last();
  await expect(mine).toContainText("Свободное посещение оформим");
  await expect(mine).toContainText("Ирина Белова");
  await expect(mine).toHaveAttribute("data-mine", "true");
  await expect(reply).toHaveValue("");
  await expect(timeline.getByText("Деканат ответил")).toBeVisible();
  await expectFits(page);
  await snap(page, "card-in-progress");

  // запросить уточнение: статус «Нужно уточнение», вопрос — в панели наверху, решений больше нет
  const decision = page.getByRole("region", { name: "Решение" });
  await decision.locator("summary", { hasText: "Запросить уточнение" }).click();
  await decision.getByLabel("Вопрос студенту").fill("С какого числа нужен свободный график?");
  await decision.getByRole("button", { name: "Отправить вопрос" }).click();
  await expect(page.getByText("Нужно уточнение", { exact: true }).first()).toBeVisible();
  const waiting = page.getByRole("region", { name: "Ждём ответа студента" });
  await expect(waiting).toContainText("С какого числа нужен свободный график?");
  await expect(page.getByRole("region", { name: "Решение" })).toHaveCount(0);
  await expectFits(page);
  await snap(page, "card-needs-info");

  // в очереди — во вкладке «Ждут студента»
  await page.getByRole("main").getByRole("link", { name: "Очередь" }).click();
  await expect(page).toHaveURL(/\/staff\?tab=waiting$/);
  await expect(cards(page).filter({ hasText: "Индивидуальный график" })).toHaveCount(1);
});

test("отклонить с причиной: короткая причина, затем подтверждение в два шага", async ({ page }) => {
  await signIn(page, "irina");
  await cards(page).filter({ hasText: "Вопрос по выплате" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Вопрос по выплате");

  const decision = page.getByRole("region", { name: "Решение" });
  await decision.locator("summary", { hasText: "Отклонить" }).click();
  const reason = decision.getByLabel("Причина отказа");

  // слишком короткая причина — ошибка сразу, без шага подтверждения
  await reason.fill("нет");
  await decision.getByRole("button", { name: "Отклонить обращение" }).click();
  await expect(decision.getByText("Минимум 5 символов")).toBeVisible();
  await expect(decision.getByRole("button", { name: "Да, отклонить" })).toHaveCount(0);

  // первый клик показывает подтверждение; «Отмена» возвращает, причина остаётся
  await reason.fill("Вопрос о сроках выплаты решает бухгалтерия: каб. 105, корпус Б, пн–чт 10:00–16:00.");
  await decision.getByRole("button", { name: "Отклонить обращение" }).click();
  await expect(decision.getByText(/Студент сразу получит уведомление с причиной/)).toBeVisible();
  await decision.getByRole("button", { name: "Отмена" }).click();
  await expect(decision.getByRole("button", { name: "Да, отклонить" })).toHaveCount(0);
  await expect(reason).toHaveValue(/бухгалтерия/);

  await decision.getByRole("button", { name: "Отклонить обращение" }).click();
  await expect(decision.getByRole("button", { name: "Да, отклонить" })).toBeFocused();
  await expectFits(page);
  await snap(page, "reject-confirm");
  await decision.getByRole("button", { name: "Да, отклонить" }).click();

  await expect(page.getByText("Отклонено", { exact: true }).first()).toBeVisible();
  const rejected = page.getByRole("region", { name: "Обращение отклонено" });
  await expect(rejected).toContainText("Причина: Вопрос о сроках выплаты решает бухгалтерия");
  await expect(page.getByRole("region", { name: "Решение" })).toHaveCount(0);
  await expect(page.getByLabel("Ответ студенту")).toHaveCount(0);
  await expect(page.getByText("Обращение закрыто — написать в него нельзя")).toBeVisible();
  await expectFits(page);
  await snap(page, "card-rejected");
});

test("справка готова: место и срок выдачи — студент видит сразу, без перезагрузки", async ({ page, browser }) => {
  // Алина держит открытой карточку своей справки (поток событий подключён)
  const alinaCtx = await browser.newContext({ viewport: page.viewportSize() });
  const alina = await alinaCtx.newPage();
  watchConsole(alina);
  await signIn(alina, "alina");
  await alina.goto("/dekanat");
  const href = await alina.getByRole("region", { name: "Мои обращения" })
    .getByRole("link", { name: /Справка для военкомата/ }).getAttribute("href");
  expect(href).toMatch(/^\/dekanat\/[0-9a-f-]{36}$/);
  const stream = alina.waitForResponse((r) => new URL(r.url()).pathname === "/api/events");
  await alina.goto(href!);
  await stream;
  await expect(alina.getByRole("heading", { level: 1 })).toHaveText("Справка для военкомата");
  await expect(alina.getByText("Ответим до", { exact: true })).toBeVisible();
  await alina.evaluate(() => {
    (window as unknown as { __sameDocument: boolean }).__sameDocument = true;
  });

  await signIn(page, "irina");
  await queueTab(page, "В работе").click();
  await cards(page).filter({ hasText: "Справка для военкомата" }).click();
  const decision = page.getByRole("region", { name: "Решение" });
  await decision.locator("summary", { hasText: "Готово" }).click();
  await expect(decision.getByLabel("Где забрать")).toHaveValue("каб. 214, корпус А");
  await expect(decision.getByLabel("До какого дня")).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  await decision.getByRole("button", { name: "Отметить готовой" }).click();

  await expect(page.getByText("Готово", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/^Забрать: каб\. 214, корпус А, до \d{1,2} [а-я]+, 17:00$/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Решение" })).toHaveCount(0);
  await expectFits(page);
  await snap(page, "card-ready");

  // у Алины: тост и обновлённая карточка в том же документе
  await expect(alina.getByText(/^Справка по обращению О-\d{4}-\d{6} готова$/)).toBeVisible();
  await expect(alina.getByRole("heading", { name: "Справка готова" })).toBeVisible();
  await expect(alina.getByText(/^Забрать: каб\. 214, корпус А, до /)).toBeVisible();
  expect(await alina.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument)).toBe(true);
  await alinaCtx.close();
});

test("объявление для ПМИ-25-1: проверка полей, публикация, Алина его видит", async ({ page }) => {
  await signIn(page, "irina");
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("link", { name: "Объявления" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Объявления");
  const list = page.getByRole("region", { name: "Опубликованные" });
  await expect(list.getByRole("article")).toHaveCount(4);
  await expectFits(page);
  await snap(page, "announcements");

  // пустая форма — ошибки у полей, ничего не опубликовано
  await page.getByRole("button", { name: "Опубликовать" }).click();
  await expect(page.getByText("Проверь отмеченные поля")).toBeVisible();
  await expect(page.getByLabel("Заголовок")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Минимум 10 символов")).toBeVisible();
  // «Группа» без выбранной группы — ошибка у списка групп
  await page.getByLabel("Группа", { exact: true }).check();
  await page.getByLabel("Заголовок").fill("ПМИ-25-1: консультация переносится");
  await page.getByLabel("Текст").fill("Консультация по математическому анализу переносится на пятницу, 16:00, ауд. А-301.");
  await page.getByRole("button", { name: "Опубликовать" }).click();
  await expect(page.getByText("Выбери группу")).toBeVisible();

  await page.getByLabel("Какая группа").selectOption({ label: "ПМИ-25-1 (2 курс)" });
  await page.getByLabel("Важное").check();
  await page.getByRole("button", { name: "Опубликовать" }).click();
  await expect(page.getByText("Опубликовано: увидит 1 студент")).toBeVisible();
  await expect(page.getByLabel("Заголовок")).toHaveValue("");
  const top = list.getByRole("article").first();
  await expect(top).toContainText("ПМИ-25-1: консультация переносится");
  await expect(top).toContainText("Кому: ПМИ-25-1");
  await expect(top).toContainText("Важное");
  await expect(list.getByRole("article")).toHaveCount(5);
  await expectFits(page);
  await snap(page, "announcements-published");

  await page.context().clearCookies();
  await signIn(page, "alina");
  await page.goto("/notifications?tab=announcements");
  await expect(page.getByText("ПМИ-25-1: консультация переносится")).toBeVisible();
});

test("профиль сотрудника: ФИО, должность, отделы, «Выйти»", async ({ page }) => {
  await signIn(page, "irina");
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("link", { name: "Профиль" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Белова Ирина Николаевна");
  await expect(page.getByText("Специалист единого деканата")).toBeVisible();
  const deps = page.getByRole("region", { name: "Отделы" });
  await expect(deps.getByRole("listitem")).toHaveText(["Справки и документы", "Учебный отдел", "Стипендиальный отдел"]);
  await expectFits(page);
  await snap(page, "profile");

  await page.getByRole("button", { name: "Выйти" }).click();
  await page.waitForURL("**/login");
  await page.goto("/staff");
  await page.waitForURL("**/login");
});

test("чужая роль — страница не найдена: студенту кабинет сотрудника, сотруднику экраны студента", async ({ page }) => {
  await signIn(page, "irina");
  await queueTab(page, "Закрытые").click();
  const card = cards(page).first();
  const href = await card.getAttribute("href");
  const title = (await card.getByRole("heading", { level: 3 }).textContent())!;
  expect(href).toMatch(/^\/staff\/appeals\/[0-9a-f-]{36}$/);

  await page.context().clearCookies();
  await signIn(page, "alina");
  for (const path of ["/staff", href!, "/staff/announcements", "/staff/profile"]) {
    allowed404.add(path);
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
    await expect(page.getByRole("heading", { name: "Страница не найдена" })).toBeVisible();
    // ни очереди, ни карточки, ни следа чужого обращения
    await expect(page.getByText(title)).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Вкладки очереди" })).toHaveCount(0);
  }
  await expectFits(page);
  await snap(page, "student-404");

  await page.context().clearCookies();
  await signIn(page, "irina");
  for (const path of ["/", "/dekanat", "/schedule"]) {
    allowed404.add(path);
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
    await expect(page.getByRole("heading", { name: "Страница не найдена" })).toBeVisible();
    // «На главную» ведёт сотрудника в его очередь, а не на чужую главную
    await expect(page.getByRole("link", { name: "На главную", exact: true })).toHaveAttribute("href", "/staff");
    await expect(page.getByRole("link", { name: "На связи — на главную" })).toHaveAttribute("href", "/staff");
  }
});

test("кривое и несуществующее обращение — «Обращение не найдено» в кабинете сотрудника", async ({ page }) => {
  await signIn(page, "irina");
  for (const path of ["/staff/appeals/not-a-uuid", "/staff/appeals/00000000-0000-4000-8000-000000000000"]) {
    allowed404.add(path);
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Обращение не найдено" })).toBeVisible();
    await expect(page.getByRole("link", { name: "К очереди" })).toHaveAttribute("href", "/staff");
  }
  await expectFits(page);
  await snap(page, "not-found");
});
