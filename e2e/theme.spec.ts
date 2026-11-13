import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { collectConsoleErrors, hasNoHorizontalScroll, resetDemoWorld, shoot, signIn } from "./demo";

// Тема оформления: светлая по умолчанию, тёмная по выбору. На 360 и 1280 px.
// Скриншоты (только с SCREENSHOTS=1) → docs/screenshots/08-<экран>-<ширина>.png.

const widthOf = (page: Page) => page.viewportSize()!.width;
const settings = (page: Page) => page.getByRole("navigation", { name: "Настройки профиля" });
const themeOf = (page: Page) => page.locator("html").getAttribute("data-theme");
const bgOf = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
/** Карточка темы: нажимаем на подпись (сам переключатель скрыт для глаз). */
const option = (page: Page, name: string) =>
  page.locator("label").filter({ has: page.getByRole("radio", { name: new RegExp(`^${name}`) }) });

async function chooseTheme(page: Page, name: "Светлая" | "Тёмная", base = "/profile") {
  await page.goto(`${base}/theme`);
  await option(page, name).click();
  await page.getByRole("button", { name: "Сохранить" }).click();
  await page.waitForURL(`**${base}?saved=theme`);
}

async function seriousViolations(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({
      rule: v.id,
      nodes: v.nodes.slice(0, 4).map((n) => `${n.target.join(" ")} :: ${n.failureSummary?.split("\n").slice(1, 3).join(" ")}`),
    }));
}

test.beforeAll(() => resetDemoWorld());

test("по умолчанию тема светлая — та, что была до появления выбора", async ({ page }) => {
  await page.goto("/login");
  expect(await themeOf(page)).toBe("light");
  expect(await bgOf(page)).toBe("rgb(255, 255, 255)");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#FFFFFF");
});

test("студент включает тёмную тему: она держится между страницами и после перезагрузки", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await signIn(page, "alina");
  await page.goto("/profile");
  await expect(settings(page).getByRole("link", { name: /Оформление/ })).toContainText("светлая");
  await settings(page).getByRole("link", { name: /Оформление/ }).click();
  await page.waitForURL("**/profile/theme");
  await expect(page.getByRole("radio", { name: /^Светлая/ })).toBeChecked();
  expect(await hasNoHorizontalScroll(page)).toBe(true);
  await shoot(page, "theme-choice", widthOf(page), "08");

  await option(page, "Тёмная").click();
  await page.getByRole("button", { name: "Сохранить" }).click();
  await page.waitForURL("**/profile?saved=theme");
  await expect(page.getByRole("status").filter({ hasText: "Тема оформления сохранена" })).toBeVisible();
  expect(await themeOf(page)).toBe("dark");
  expect(await bgOf(page)).toBe("rgb(0, 0, 0)");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#000000");
  await expect(settings(page).getByRole("link", { name: /Оформление/ })).toContainText("тёмная");
  await shoot(page, "profile-dark", widthOf(page), "08");

  for (const [path, name] of [["/", "today-dark"], ["/schedule", "schedule-dark"], ["/dekanat", "dekanat-dark"], ["/study", "study-dark"]]) {
    await page.goto(path);
    expect(await themeOf(page), path).toBe("dark");
    // содержимое, а не скелетон загрузки
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await hasNoHorizontalScroll(page), path).toBe(true);
    await shoot(page, name, widthOf(page), "08");
  }
  await page.reload();
  expect(await themeOf(page)).toBe("dark");

  // на странице выбора отмечена уже тёмная
  await page.goto("/profile/theme");
  await expect(page.getByRole("radio", { name: /^Тёмная/ })).toBeChecked();
  await shoot(page, "theme-choice-dark", widthOf(page), "08");

  // и обратно
  await chooseTheme(page, "Светлая");
  expect(await themeOf(page)).toBe("light");
  expect(errors).toEqual([]);
});

test("тема — настройка устройства: переживает выход и не зависит от аккаунта", async ({ browser, page }) => {
  await signIn(page, "alina");
  await chooseTheme(page, "Тёмная");
  await page.getByRole("button", { name: "Выйти" }).click();
  await page.waitForURL("**/login**");
  expect(await themeOf(page)).toBe("dark");
  await shoot(page, "login-dark", widthOf(page), "08");

  // другой браузер под тем же аккаунтом — по-прежнему светлая
  const other = await browser.newContext({ viewport: page.viewportSize()! });
  const second = await other.newPage();
  await signIn(second, "alina");
  expect(await themeOf(second)).toBe("light");
  await other.close();
});

test("сотрудник тоже выбирает тему, возврат — в свой профиль", async ({ page }) => {
  await signIn(page, "irina");
  await page.goto("/staff/profile");
  await settings(page).getByRole("link", { name: /Оформление/ }).click();
  await page.waitForURL("**/staff/profile/theme");
  await option(page, "Тёмная").click();
  await page.getByRole("button", { name: "Сохранить" }).click();
  await page.waitForURL("**/staff/profile?saved=theme");
  await expect(page.getByRole("status").filter({ hasText: "Тема оформления сохранена" })).toBeVisible();
  expect(await themeOf(page)).toBe("dark");
  await page.goto("/staff");
  await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(await hasNoHorizontalScroll(page)).toBe(true);
  await shoot(page, "staff-queue-dark", widthOf(page), "08");
});

test("подделанная cookie темы не ломает страницу и не попадает в разметку", async ({ context, page, baseURL }) => {
  await context.addCookies([{ name: "ns_theme", value: "\"><b>взлом</b>", url: baseURL! }]);
  await page.goto("/login");
  expect(await themeOf(page)).toBe("light");
  expect(await page.content()).not.toContain("взлом");
});

test("тёмная тема: без серьёзных нарушений доступности на ключевых экранах", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, "alina");
  await chooseTheme(page, "Тёмная");
  for (const path of [
    "/", "/schedule", "/schedule?view=week", "/study", "/study?tab=session", "/dekanat", "/dekanat/new",
    "/dekanat/new?type=cert_military", "/notifications", "/profile", "/profile/theme", "/profile/stress",
    "/profile/language", "/profile/notifications", "/about",
  ]) {
    await page.goto(path);
    expect.soft(await seriousViolations(page), `${path} (тёмная)`).toEqual([]);
  }
  await page.goto("/profile");
  await page.getByRole("button", { name: "Выйти" }).click();
  await page.waitForURL("**/login**");
  expect.soft(await seriousViolations(page), "/login (тёмная)").toEqual([]);

  await signIn(page, "irina");
  for (const path of ["/staff", "/staff?tab=in_progress", "/staff/announcements", "/staff/profile", "/staff/profile/theme"]) {
    await page.goto(path);
    expect.soft(await seriousViolations(page), `${path} (тёмная)`).toEqual([]);
  }
});
