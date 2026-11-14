import { expect, test, type Page } from "@playwright/test";
import { collectConsoleErrors, hasNoHorizontalScroll, resetDemoWorld, shoot, signIn, worstDemoWorld } from "./demo";

// Очередь сотрудника: группы по сроку, «Показать все» и «Взять следующее». На 360 и 1280 px.
// Скриншоты (только с SCREENSHOTS=1) → docs/screenshots/10-<экран>-<ширина>.png.

test.describe.configure({ mode: "serial" });
test.beforeEach(() => resetDemoWorld());
test.afterAll(() => resetDemoWorld());

const widthOf = (page: Page) => page.viewportSize()!.width;
const rows = (page: Page) => page.getByRole("main").locator('a[href^="/staff/appeals/"]');
const group = (page: Page, name: RegExp) => page.getByRole("region", { name });
const groupRows = (page: Page, name: RegExp) => group(page, name).locator('a[href^="/staff/appeals/"]');
const takeNext = (page: Page) => page.getByRole("button", { name: "Взять следующее обращение" });
const newTab = (page: Page) =>
  page.getByRole("navigation", { name: "Вкладки очереди" }).getByRole("link", { name: /^Новые/ });

test("группы по сроку: просроченное отдельно и первым, число обращений в заголовке группы", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await signIn(page, "irina");
  await expect(page.getByRole("main").getByRole("heading", { level: 2, name: /^(Просрочено|Сегодня|Завтра|Позже) \d+$/ }))
    .toHaveText(["Просрочено 1", "Позже 2"]);
  await expect(groupRows(page, /^Просрочено/)).toHaveCount(1);
  await expect(groupRows(page, /^Просрочено/).first()).toContainText("Другой учебный вопрос");
  await expect(groupRows(page, /^Позже/)).toHaveCount(2);
  // на демо-данных все группы короткие — «Показать все» не нужно
  await expect(page.getByRole("link", { name: /^Показать все/ })).toHaveCount(0);
  expect(await hasNoHorizontalScroll(page)).toBe(true);
  await shoot(page, "queue-groups", widthOf(page), "10");
  expect(errors).toEqual([]);
});

test("«Взять следующее» открывает самое срочное обращение уже в работе; в «Новых» его больше нет", async ({ page }) => {
  await signIn(page, "irina");
  await expect(newTab(page)).toContainText("3");
  await takeNext(page).click();
  await page.waitForURL(/\/staff\/appeals\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Другой учебный вопрос"); // просрочено — срочнее всех
  await expect(page.getByText("В работе", { exact: true }).first()).toBeVisible();

  await page.goto("/staff");
  await expect(newTab(page)).toContainText("2");
  await expect(group(page, /^Просрочено/)).toHaveCount(0);
  await expect(rows(page)).toHaveCount(2);
});

test("всё разобрано: кнопки «Взять следующее» нет, вместо очереди — пустое состояние", async ({ page }) => {
  await signIn(page, "irina");
  for (let i = 0; i < 3; i++) {
    await takeNext(page).click();
    await page.waitForURL(/\/staff\/appeals\//);
    await page.goto("/staff");
  }
  await expect(takeNext(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Новых обращений нет" })).toBeVisible();
  // взятые — во вкладке «В работе»
  await expect(page.getByRole("navigation", { name: "Вкладки очереди" }).getByRole("link", { name: /^В работе/ }))
    .toContainText("4");
});

test("с фильтром отдела «Взять следующее» берёт из этого отдела", async ({ page }) => {
  await signIn(page, "irina");
  await page.getByRole("navigation", { name: "Отдел" }).getByRole("link", { name: "Стипендия", exact: true }).click();
  await expect(page).toHaveURL(/\/staff\?dept=\d+$/);
  await takeNext(page).click();
  await page.waitForURL(/\/staff\/appeals\//);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Вопрос по выплате");
});

test("200 новых (худшие данные): в группе 10 строк, «Сегодня» целиком; «Показать все» раскрывает и сворачивает", async ({ page }) => {
  test.setTimeout(120_000);
  worstDemoWorld();
  await signIn(page, "irina");
  const overdue = group(page, /^Просрочено/);
  const total = Number((await overdue.getByRole("heading", { level: 2 }).textContent())!.match(/\d+/)![0]);
  expect(total).toBeGreaterThan(10);
  await expect(groupRows(page, /^Просрочено/)).toHaveCount(10);
  // вся страница — меньше сотни строк, а не 200
  expect(await rows(page).count()).toBeLessThan(100);
  expect(await hasNoHorizontalScroll(page)).toBe(true);
  await shoot(page, "queue-worst", widthOf(page), "10");

  await overdue.getByRole("link", { name: `Показать все ${total}` }).click();
  await expect(page).toHaveURL(/[?&]show=overdue/);
  await expect(groupRows(page, /^Просрочено/)).toHaveCount(total);
  // остальные группы по-прежнему свёрнуты
  for (const name of [/^Завтра/, /^Позже/]) {
    if (await group(page, name).count()) expect(await groupRows(page, name).count()).toBeLessThanOrEqual(10);
  }
  await group(page, /^Просрочено/).getByRole("link", { name: "Свернуть" }).click();
  await expect(page).not.toHaveURL(/show=/);
  await expect(groupRows(page, /^Просрочено/)).toHaveCount(10);
});
