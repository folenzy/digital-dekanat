import { expect, test, type Page } from "@playwright/test";
import { hasNoHorizontalScroll, passwordOf, resetDemoWorld, shoot, signIn } from "./demo";

// Экраны студента на 360 и 1280 px (проекты playwright.config.ts): вход, Сегодня, Пары, Учёба,
// Уведомления, Профиль, О проекте, 404. Скриншоты → docs/screenshots/02-<экран>-<ширина>.png.

const CONCEPT = "Концепт для конкурса · не официальный сервис";
const EXPIRED = "Сессия завершилась — возможно, ночью обновились демо-данные. Войди снова";
/** Колокольчик (в шапке на телефоне, в боковой панели на десктопе): подпись со счётчиком. */
const BELL = /^Уведомления(: \d+ непрочитанн|, новых нет)/;

const widthOf = (page: Page) => page.viewportSize()!.width;

/** Ключ даты по Москве и ближайший будний день — как в демо-мире (изменения расписания на эти дни). */
function mskWorkday(): string {
  let d = new Date(Date.now() + 3 * 3600_000);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d = new Date(d.getTime() + 86_400_000);
  return d.toISOString().slice(0, 10);
}

// Ошибки в консоли браузера ловим во всех тестах, без исключений (кроме 404 документа в тесте 404-страницы).
type ConsoleError = { text: string; url: string };
let consoleErrors: ConsoleError[] = [];
test.beforeEach(({ page }) => {
  consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push({ text: msg.text(), url: msg.location().url });
  });
  page.on("pageerror", (e) => consoleErrors.push({ text: e.message, url: "" }));
});
test.afterEach(() => {
  expect(consoleErrors.map((e) => `${e.text} @ ${e.url}`)).toEqual([]);
});

async function expectFits(page: Page) {
  expect(await hasNoHorizontalScroll(page), "горизонтальная прокрутка").toBe(true);
}

test.describe("вход", () => {
  test("пометка концепта, без тестовых учёток, понятные ошибки", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText(CONCEPT)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Вход в кабинет");
    const html = await page.content();
    expect(html).not.toContain(passwordOf("alina"));
    expect(html).not.toContain("alina.mironova");
    await expectFits(page);
    await shoot(page, "login", widthOf(page));

    // показать/скрыть пароль
    const password = page.getByLabel("Пароль", { exact: true });
    await expect(password).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Показать пароль" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Скрыть пароль" }).click();
    await expect(password).toHaveAttribute("type", "password");

    await page.getByLabel("Логин").fill("alina.mironova");
    await password.fill("точно-не-тот-пароль");
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Неверный" })).toHaveText("Неверный логин или пароль");
    await expect(page.getByLabel("Логин")).toHaveValue("alina.mironova"); // логин после ошибки не стирается
  });

  test("сессия завершилась: понятное пояснение, чужой текст из адреса не выводится", async ({ page }) => {
    await page.goto("/login?reason=expired");
    await expect(page.getByText(EXPIRED)).toBeVisible();
    await shoot(page, "login-expired", widthOf(page));

    await page.goto("/login?reason=%3Cb%3Eвзлом%3C%2Fb%3E");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Вход в кабинет");
    await expect(page.getByText(EXPIRED)).toHaveCount(0);
    expect(await page.content()).not.toContain("взлом");
  });
});

test.describe("Алина", () => {
  test("Сегодня: приветствие, повышенная стипендия, обращения, дедлайны", async ({ page }) => {
    await signIn(page, "alina");
    await expect(page.getByRole("heading", { level: 1 }))
      .toHaveText(/^(Доброе утро|Добрый день|Добрый вечер|Доброй ночи), Алина$/);
    await expect(page.getByText("Ты проходишь на повышенную стипендию")).toBeVisible();
    await expect(page.getByRole("link", { name: "Подать в 1 тап" }))
      .toHaveAttribute("href", "/dekanat/new?type=stip_increased&prefill=1");
    await expect(page.getByRole("heading", { name: "Мои обращения" })).toBeVisible();
    await expect(page.getByText("Справка для военкомата").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Скоро дедлайны" })).toBeVisible();
    await expect(page.getByText("Приём заявлений на повышенную академическую стипендию")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Объявление деканата" })).toBeVisible();
    await expectFits(page);
    await shoot(page, "today", widthOf(page));

    // вошедшего студента страница входа отправляет домой
    await page.goto("/login");
    await page.waitForURL((url) => url.pathname === "/");
  });

  test("Пары: день и неделя, чётность, изменения было → стало", async ({ page }) => {
    await signIn(page, "alina");
    await page.goto("/schedule");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Пары");
    await expect(page.getByText(/^(нечётная|чётная) неделя$/i)).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Дни недели" }).getByRole("link")).toHaveCount(6);
    await expectFits(page);

    // изменения демо-мира — на ближайший будний день
    const day = mskWorkday();
    await page.goto(`/schedule?view=day&date=${day}`);
    await expect(page.getByText("Новая аудитория", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Отменена", { exact: true }).first()).toBeVisible();
    await expect(page.locator("del").first()).toBeVisible(); // старая аудитория зачёркнута
    await expectFits(page);
    await shoot(page, "schedule-day", widthOf(page));

    await page.getByRole("link", { name: "Неделя", exact: true }).click();
    await expect(page).toHaveURL(/view=week/);
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(6);
    await expectFits(page);
    await shoot(page, "schedule-week", widthOf(page));

    // мусор в адресе не ломает страницу
    await page.goto("/schedule?view=month&date=2026-02-30");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Пары");
  });

  test("Учёба: сводка «Всё идёт хорошо», семестр, сессия, зачётка", async ({ page }) => {
    await signIn(page, "alina");
    await page.goto("/study");
    await expect(page.getByText("Всё идёт хорошо", { exact: true })).toBeVisible();
    await expect(page.getByText("4,8", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Математический анализ" })).toBeVisible();
    await expect(page.getByText(/^Предварительно — отлично/).first()).toBeVisible();
    await expectFits(page);
    await shoot(page, "study", widthOf(page));

    await page.getByRole("link", { name: "Сессия", exact: true }).click();
    await expect(page).toHaveURL(/tab=session/);
    await expect(page.getByText("Экзамен").first()).toBeVisible();
    await expectFits(page);
    await shoot(page, "study-session", widthOf(page));

    await page.getByRole("link", { name: "Зачётка", exact: true }).click();
    await expect(page).toHaveURL(/tab=history/);
    await expect(page.getByRole("heading", { name: "2 семестр" })).toBeVisible();
    await expectFits(page);
    await shoot(page, "study-history", widthOf(page));
  });

  test.describe("уведомления (меняют данные — свой свежий демо-мир)", () => {
    test.beforeAll(() => resetDemoWorld());
    // и вернуть свежий мир следующим тестам: их скриншоты должны показывать непрочитанные
    test.afterAll(() => resetDemoWorld());

    test("открыть, прочитать всё, объявления", async ({ page }) => {
      await signIn(page, "alina");
      await page.goto("/notifications");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Уведомления");
      const bell = page.getByRole("link", { name: BELL });
      await expect(bell).toHaveAttribute("aria-label", "Уведомления: 4 непрочитанных");
      await expectFits(page);
      await shoot(page, "notifications", widthOf(page));

      // открыть уведомление: отмечается прочитанным и ведёт по ссылке
      await page.getByRole("button", { name: /Изменение в расписании/ }).click();
      await page.waitForURL((url) => url.pathname === "/schedule");
      await expect(page.getByRole("link", { name: BELL }))
        .toHaveAttribute("aria-label", "Уведомления: 3 непрочитанных");

      await page.goto("/notifications");
      await page.getByRole("button", { name: "Прочитать всё" }).click();
      await expect(page.getByRole("link", { name: BELL }))
        .toHaveAttribute("aria-label", "Уведомления, новых нет");
      await page.getByRole("link", { name: "Непрочитанные", exact: true }).click();
      await expect(page.getByText("Новых уведомлений нет")).toBeVisible();

      await page.getByRole("link", { name: "Объявления", exact: true }).click();
      await expect(page).toHaveURL(/tab=announcements/);
      await expect(page.getByRole("heading", { name: "Зимняя сессия начинается 22 декабря" })).toBeVisible();
      await expect(page.getByText("Важное").first()).toBeVisible();
      await expectFits(page);
      await shoot(page, "announcements", widthOf(page));
    });
  });

  test.describe("карточка обращения гасит уведомления о нём (меняет данные — свой свежий демо-мир)", () => {
    test.beforeAll(() => resetDemoWorld());
    test.afterAll(() => resetDemoWorld());

    test("после открытия карточки счётчик колокольчика уменьшается", async ({ page }) => {
      await signIn(page, "alina");
      const bell = page.getByRole("link", { name: BELL });
      await expect(bell).toHaveAttribute("aria-label", "Уведомления: 4 непрочитанных");
      await page.goto("/dekanat");
      await page.getByRole("link", { name: /Справка для военкомата/ }).first().click();
      await page.waitForURL(/\/dekanat\/[0-9a-f-]{36}$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Справка для военкомата");
      await expect(page.getByRole("link", { name: BELL })).toHaveAttribute("aria-label", "Уведомления: 3 непрочитанных");
    });
  });

  test("Профиль, О проекте, выход", async ({ page }) => {
    await signIn(page, "alina");
    await page.goto("/profile");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Миронова Алина Сергеевна");
    await expect(page.getByText("2 курс, ПМИ-25-1", { exact: true })).toBeVisible();
    await expect(page.getByText("ОР-25-0137")).toBeVisible();
    await expect(page.getByText("Ковалёва Марина Анатольевна")).toBeVisible();
    await expectFits(page);
    await shoot(page, "profile", widthOf(page));

    await page.getByRole("link", { name: "О проекте" }).click();
    await page.waitForURL("**/about");
    await expect(page.getByText(CONCEPT).first()).toBeVisible();
    await expect(page.getByText(/в\s04:00\sМСК/).first()).toBeVisible();
    await expect(page.getByText(/argon2id/).first()).toBeVisible();
    await expectFits(page);
    await shoot(page, "about", widthOf(page));

    await page.goto("/profile");
    await page.getByRole("button", { name: "Выйти" }).click();
    await page.waitForURL("**/login");
    await page.goto("/study");
    await page.waitForURL((url) => url.pathname === "/login");
  });
});

test("Денис: на «Сегодня» деканат ждёт ответа, в «Учёбе» — «Есть долги»", async ({ page }) => {
  await signIn(page, "denis");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/, Денис$/);
  await expect(page.getByText(/Ответь на вопрос по обращению/)).toBeVisible();
  await expectFits(page);
  await shoot(page, "today-denis", widthOf(page));

  await page.goto("/study");
  await expect(page.getByText("Есть долги", { exact: true })).toBeVisible();
  await expect(page.getByText(/Статистика/).first()).toBeVisible();
  await expectFits(page);
  await shoot(page, "study-denis", widthOf(page));
});

test("несуществующая страница — «Страница не найдена» со ссылкой домой", async ({ page }) => {
  // аноним с неизвестного адреса уходит на вход (e2e/security-headers.spec.ts), 404 видит вошедший
  await signIn(page, "alina");
  const res = await page.goto("/takoy-stranitsy-net");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Страница не найдена" })).toBeVisible();
  await expect(page.getByRole("link", { name: "На главную", exact: true })).toHaveAttribute("href", "/");
  await expect(page.getByText(CONCEPT)).toBeVisible();
  await expectFits(page);
  await shoot(page, "not-found", widthOf(page));
  // сам ответ 404 браузер пишет в консоль — это ожидаемо
  consoleErrors = consoleErrors.filter((e) => !(new URL(e.url || "x:/").pathname === "/takoy-stranitsy-net" && e.text.includes("404")));
});
