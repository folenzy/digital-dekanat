import { expect, test, type Page } from "@playwright/test";
import { collectConsoleErrors, hasNoHorizontalScroll, resetDemoWorld, shoot, signIn } from "./demo";

// Профиль и настройки: язык обучения, ударения в ФИО, уведомления. На 360 и 1280 px.
// Скриншоты (только с SCREENSHOTS=1) → docs/screenshots/07-<экран>-<ширина>.png.

const ACUTE = "́";
const widthOf = (page: Page) => page.viewportSize()!.width;
const settings = (page: Page) => page.getByRole("navigation", { name: "Настройки профиля" });

/** Плитка ударной гласной: нажимаем на подпись (сам переключатель скрыт для глаз). */
const vowel = (page: Page, letter: string, position: number) =>
  page.locator("label").filter({ has: page.getByRole("radio", { name: `ударение на «${letter}», буква ${position}` }) });

test.beforeEach(() => resetDemoWorld());
test.afterAll(() => resetDemoWorld());

test("профиль: почта, строки настроек и плашка «Заполни профиль»", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await signIn(page, "alina");
  await page.goto("/profile");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Миронова Алина Сергеевна");
  await expect(page.getByText("alina.mironova@orientir-uni.example").first()).toBeVisible();
  await expect(settings(page).getByRole("link")).toHaveText([
    /Язык обучения.*не выбран/, /Ударения в имени.*не указаны/, /Уведомления.*все включены/,
  ]);
  // почта есть, языка и ударений нет — заполнено 1 из 3
  await expect(page.getByRole("heading", { name: /Заполни профиль \(1 из 3\)/ })).toBeVisible();
  expect(await hasNoHorizontalScroll(page)).toBe(true);
  await shoot(page, "profile", widthOf(page), "07");
  expect(errors).toEqual([]);
});

test("язык обучения: выбрал — сохранилось, плашка считает дальше", async ({ page }) => {
  await signIn(page, "alina");
  await page.goto("/profile");
  await settings(page).getByRole("link", { name: /Язык обучения/ }).click();
  await page.waitForURL("**/profile/language");
  await shoot(page, "language", widthOf(page), "07");
  await page.getByRole("radio", { name: "Немецкий" }).check();
  await page.getByRole("button", { name: "Сохранить" }).click();
  await page.waitForURL("**/profile?saved=language");
  await expect(page.getByRole("status").filter({ hasText: "Язык обучения сохранён" })).toBeVisible();
  await expect(settings(page).getByRole("link", { name: /Язык обучения/ })).toContainText("Немецкий");
  await expect(page.getByRole("heading", { name: /Заполни профиль \(2 из 3\)/ })).toBeVisible();
  // значение пережило перезагрузку — оно в базе, а не в адресе
  await page.goto("/profile");
  await expect(settings(page).getByRole("link", { name: /Язык обучения/ })).toContainText("Немецкий");
});

test("ударения: студент расставил — сотрудник видит имя с ударениями", async ({ browser, page }) => {
  const errors = collectConsoleErrors(page);
  await signIn(page, "alina");
  await page.goto("/profile/stress");
  // Миро́нова Али́на Серге́евна
  await vowel(page, "о", 4).click();
  await vowel(page, "и", 3).click();
  await vowel(page, "е", 5).click();
  const stressed = `Миро${ACUTE}нова Али${ACUTE}на Серге${ACUTE}евна`;
  // живой предпросмотр «Другие увидят»
  await expect(page.getByText(stressed, { exact: true })).toBeVisible();
  expect(await hasNoHorizontalScroll(page)).toBe(true);
  await shoot(page, "stress", widthOf(page), "07");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await page.waitForURL("**/profile?saved=stress");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(stressed);
  await expect(settings(page).getByRole("link", { name: /Ударения в имени/ })).toContainText("расставлены");
  await shoot(page, "profile-filled", widthOf(page), "07");

  // сотрудник в своей очереди видит Алину уже с ударениями
  const staff = await browser.newContext({ viewport: page.viewportSize()! });
  const irina = await staff.newPage();
  await signIn(irina, "irina");
  await irina.goto("/staff?tab=in_progress");
  await expect(irina.getByText(stressed).first()).toBeVisible();
  await shoot(irina, "staff-queue-stress", widthOf(page), "07");

  // выключил «Показывать ударения» — имена без знаков
  await irina.goto("/staff/profile/stress");
  await irina.getByRole("checkbox", { name: /Показывать ударения/ }).uncheck();
  await irina.getByRole("button", { name: "Сохранить" }).click();
  await irina.waitForURL("**/staff/profile?saved=stress");
  await irina.goto("/staff?tab=in_progress");
  await expect(irina.getByText("Миронова Алина Сергеевна").first()).toBeVisible();
  await expect(irina.getByText(stressed)).toHaveCount(0);
  await staff.close();
  expect(errors).toEqual([]);
});

test("в демо-мире у одной студентки ударения уже расставлены — их видно в очереди сразу", async ({ page }) => {
  await signIn(page, "irina");
  await expect(page.getByText(`Соколо${ACUTE}ва Мила${ACUTE}на Андре${ACUTE}евна`).first()).toBeVisible();
});

test("ударения можно снять: «не указывать»", async ({ page }) => {
  await signIn(page, "alina");
  await page.goto("/profile/stress");
  await vowel(page, "и", 3).click();
  await page.getByRole("button", { name: "Сохранить" }).click();
  await page.waitForURL("**/profile?saved=stress");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Миронова Али${ACUTE}на Сергеевна`);

  await page.goto("/profile/stress");
  await page.getByRole("group", { name: "Имя" }).getByRole("radio", { name: "не указывать" }).check();
  await page.getByRole("button", { name: "Сохранить" }).click();
  await page.waitForURL("**/profile?saved=stress");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Миронова Алина Сергеевна");
});

test("уведомления: выключенная категория пропадает из колокольчика и возвращается обратно", async ({ page }) => {
  await signIn(page, "alina");
  await page.goto("/notifications");
  const list = page.getByRole("main");
  const before = await list.getByRole("listitem").count();
  expect(before).toBeGreaterThan(0);

  await page.goto("/profile/notifications");
  await expect(page.getByText("Ответы деканата по обращениям")).toBeVisible();
  await shoot(page, "notifications-settings", widthOf(page), "07");
  await page.getByRole("checkbox", { name: /Объявления деканата/ }).uncheck();
  await page.getByRole("checkbox", { name: /Изменения в расписании/ }).uncheck();
  await page.getByRole("button", { name: "Сохранить" }).click();
  await page.waitForURL("**/profile?saved=notifications");
  await expect(settings(page).getByRole("link", { name: /Уведомления/ })).toContainText("выключено: 2 из 3");

  await page.goto("/notifications");
  const after = await list.getByRole("listitem").count();
  expect(after).toBeLessThan(before);

  // включил обратно — ничего не потерялось
  await page.goto("/profile/notifications");
  await page.getByRole("checkbox", { name: /Объявления деканата/ }).check();
  await page.getByRole("checkbox", { name: /Изменения в расписании/ }).check();
  await page.getByRole("button", { name: "Сохранить" }).click();
  await page.waitForURL("**/profile?saved=notifications");
  await page.goto("/notifications");
  await expect(list.getByRole("listitem")).toHaveCount(before);
});

test("расписание: тип занятия плашкой, перерывы между парами, легенда цветов", async ({ page }) => {
  await signIn(page, "alina");
  await page.goto("/schedule?view=week");
  const main = page.getByRole("main");
  // у каждой пары есть плашка типа с полным названием для скринридера
  await expect(main.locator("article [data-type]").first()).toBeVisible();
  await expect(main.getByText(/^(Перерыв|Окно)$/).first()).toBeVisible();
  await page.goto("/schedule");
  await expect(page.getByRole("list", { name: "Обозначения типов занятий" }).getByRole("listitem"))
    .toHaveText(["Лекция", "Практика", "Лабораторная", "есть изменения"]);
  expect(await hasNoHorizontalScroll(page)).toBe(true);
  await shoot(page, "schedule-day", widthOf(page), "07");
});

test("сохранённый параметр ?saved= не выводит ничего, кроме известных сообщений", async ({ page }) => {
  await signIn(page, "alina");
  await page.goto("/profile?saved=%3Cb%3Eвзлом%3C%2Fb%3E");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.content()).not.toContain("взлом");
});
