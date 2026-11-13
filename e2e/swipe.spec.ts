import { expect, test, type Page } from "@playwright/test";
import { collectConsoleErrors, hasNoHorizontalScroll, resetDemoWorld, shoot, signIn } from "./demo";

// Листание пальцем на телефоне. Палец — настоящие touch-события через CDP (Input.dispatchTouchEvent):
// браузер сам превращает их в pointer-события с pointerType="touch", как на устройстве.
// Файл идёт только в проекте mobile-360 (см. playwright.config.ts).
//
// Что проверяем: между разделами пальцем НЕ листается (только нажатие на панель навигации),
// а на странице «Пары» листаются дни (вид «День») и недели (вид «Неделя»).

test.beforeAll(() => resetDemoWorld());

type SwipeOptions = { y?: number; steps?: number; ms?: number };

async function swipe(page: Page, fromX: number, toX: number, { y = 420, steps = 10, ms = 180 }: SwipeOptions = {}) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: fromX, y }] });
  for (let i = 1; i <= steps; i++) {
    const x = fromX + ((toX - fromX) * i) / steps;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
    await page.waitForTimeout(ms / steps);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

// ---- даты: учебная неделя пн–сб по московскому времени, как в приложении ----
const DAY = 86_400_000;
const mskToday = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const shift = (key: string, days: number) => new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
/** Понедельник текущей недели. */
const monday = () => {
  const today = mskToday();
  const wd = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = вс
  return shift(today, -((wd + 6) % 7));
};
const dayUrl = (key: string) => `/schedule?view=day&date=${key}`;
const weekUrl = (key: string) => `/schedule?view=week&date=${key}`;
const dateOf = (page: Page) => new URL(page.url()).searchParams.get("date");

const sheet = (page: Page) => page.locator("#main [data-swipe-sheet]");
const selectedDay = (page: Page) => page.getByRole("navigation", { name: "Дни недели" }).locator('[aria-current="page"]');
const dayNumber = (key: string) => String(Number(key.slice(8, 10)));

/** Точка на листе дня, по которой ведём пальцем: ниже заголовка дня, выше нижней панели. */
async function sheetY(page: Page): Promise<number> {
  const box = await sheet(page).boundingBox();
  expect(box).not.toBeNull();
  return Math.min(box!.y + 90, 640);
}

async function openDay(page: Page, key: string) {
  await page.goto(dayUrl(key));
  await expect(selectedDay(page).locator(".num")).toHaveText(dayNumber(key));
}

test("между разделами пальцем не листается: только нажатие на панель навигации", async ({ page }) => {
  await signIn(page, "alina");
  await expect(page).toHaveURL(/\/$/);
  for (const [from, to] of [[300, 60], [60, 300]]) {
    await swipe(page, from, to);
    await page.waitForTimeout(450);
    await expect(page).toHaveURL(/\/$/);
  }
  for (const path of ["/study", "/dekanat", "/profile"]) {
    await page.goto(path);
    await swipe(page, 300, 60);
    await swipe(page, 60, 300);
    await page.waitForTimeout(450);
    expect(new URL(page.url()).pathname, path).toBe(path);
  }
  // нажатие по-прежнему работает
  await page.getByRole("navigation", { name: "Разделы", exact: true }).getByRole("link", { name: "Пары" }).click();
  await expect(page).toHaveURL(/\/schedule$/);
});

test("сотрудник: разделы тоже не листаются", async ({ page }) => {
  await signIn(page, "irina");
  await expect(page).toHaveURL(/\/staff$/);
  await swipe(page, 300, 60);
  await page.waitForTimeout(450);
  await expect(page).toHaveURL(/\/staff$/);
});

test("«Пары»: свайп влево открывает следующий день, вправо — предыдущий", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  const wed = shift(monday(), 2);
  await signIn(page, "alina");
  await openDay(page, wed);
  const y = await sheetY(page);

  await swipe(page, 300, 60, { y }); // влево → четверг
  await expect.poll(() => dateOf(page)).toBe(shift(wed, 1));
  await expect(page.getByRole("heading", { level: 2 }).first()).toContainText("Четверг");
  await expect(selectedDay(page).locator(".num")).toHaveText(dayNumber(shift(wed, 1)));
  // раздел тот же: листается день, а не вкладка
  expect(new URL(page.url()).pathname).toBe("/schedule");

  await swipe(page, 60, 300, { y }); // вправо → обратно в среду
  await expect.poll(() => dateOf(page)).toBe(wed);
  await swipe(page, 60, 300, { y }); // ещё раз → вторник
  await expect.poll(() => dateOf(page)).toBe(shift(wed, -1));
  await expect(page.getByRole("heading", { level: 2 }).first()).toContainText("Вторник");

  // лист вернулся на место: ни сдвига, ни прозрачности, ни горизонтальной прокрутки
  await expect.poll(() => sheet(page).evaluate((el) => {
    const s = getComputedStyle(el);
    return `${s.transform}|${s.opacity}`;
  })).toBe("none|1");
  expect(await hasNoHorizontalScroll(page)).toBe(true);
  expect(errors).toEqual([]);
});

test("«Пары»: подсказка у края экрана называет день, на который попадёшь", async ({ page }) => {
  const wed = shift(monday(), 2);
  await signIn(page, "alina");
  await openDay(page, wed);
  const y = await sheetY(page);
  // палец ещё на экране: тянем влево и не отпускаем
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 300, y }] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 300 - i * 18, y }] });
    await page.waitForTimeout(16);
  }
  const hint = page.locator("#main [data-swipe] [data-side='next']");
  await expect(hint).toContainText(`Чт, ${dayNumber(shift(wed, 1))}`);
  await expect(hint).toHaveCSS("opacity", "1");
  await shoot(page, "swipe-day-mid", 360, "09");
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
  await expect.poll(() => dateOf(page)).toBe(shift(wed, 1));
});

test("«Пары»: после субботы — понедельник следующей недели, и обратно", async ({ page }) => {
  const sat = shift(monday(), 5);
  await signIn(page, "alina");
  await openDay(page, sat);
  const y = await sheetY(page);
  await swipe(page, 300, 60, { y });
  await expect.poll(() => dateOf(page)).toBe(shift(sat, 2)); // воскресенье пропущено
  await expect(page.getByRole("heading", { level: 2 }).first()).toContainText("Понедельник");
  await swipe(page, 60, 300, { y: await sheetY(page) });
  await expect.poll(() => dateOf(page)).toBe(sat);
});

test("«Пары»: жест начинается и на полосе дней", async ({ page }) => {
  const wed = shift(monday(), 2);
  await signIn(page, "alina");
  await openDay(page, wed);
  const strip = await page.getByRole("navigation", { name: "Дни недели" }).boundingBox();
  expect(strip).not.toBeNull();
  await swipe(page, 300, 60, { y: strip!.y + strip!.height / 2 });
  await expect.poll(() => dateOf(page)).toBe(shift(wed, 1));
  // а нажатие на день в полосе по-прежнему работает
  await page.getByRole("navigation", { name: "Дни недели" }).getByRole("link").first().click();
  await expect.poll(() => dateOf(page)).toBe(monday());
});

test("«Пары»: короткий медленный сдвиг день не переключает — лист возвращается", async ({ page }) => {
  const wed = shift(monday(), 2);
  await signIn(page, "alina");
  await openDay(page, wed);
  await swipe(page, 220, 170, { y: await sheetY(page), ms: 500 });
  await page.waitForTimeout(450);
  expect(dateOf(page)).toBe(wed);
  await expect(sheet(page)).toHaveCSS("opacity", "1");
});

test("«Пары»: быстрое смахивание срабатывает и на коротком пути", async ({ page }) => {
  const wed = shift(monday(), 2);
  await signIn(page, "alina");
  await openDay(page, wed);
  // 90 px — меньше порога по расстоянию (≈101 px на 360), но быстро: события подряд, без пауз
  await swipe(page, 250, 160, { y: await sheetY(page), steps: 3, ms: 0 });
  await expect.poll(() => dateOf(page)).toBe(shift(wed, 1));
});

test("«Пары», вид «Неделя»: свайп листает недели, вертикальная прокрутка остаётся прокруткой", async ({ page }) => {
  const wed = shift(monday(), 2);
  await signIn(page, "alina");
  await page.goto(weekUrl(wed));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Пары");

  // палец идёт вверх с небольшим уходом вбок — это прокрутка, неделя не меняется
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 180, y: 600 }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 180 + i * 3, y: 600 - i * 40 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(300);
  expect(dateOf(page)).toBe(wed);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(50);

  await swipe(page, 300, 60, { y: 400 });
  await expect.poll(() => dateOf(page)).toBe(shift(wed, 7));
  expect(new URL(page.url()).searchParams.get("view")).toBe("week");
  await swipe(page, 60, 300, { y: 400 });
  await expect.poll(() => dateOf(page)).toBe(wed);
});

test("без движения (prefers-reduced-motion) свайп всё равно переключает день", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const wed = shift(monday(), 2);
  await signIn(page, "alina");
  await openDay(page, wed);
  await swipe(page, 300, 60, { y: await sheetY(page) });
  await expect.poll(() => dateOf(page)).toBe(shift(wed, 1));
});

test("в поле ввода и на форме палец ничего не листает", async ({ page }) => {
  await signIn(page, "alina");
  await page.goto("/dekanat/new?type=cert_study");
  await swipe(page, 300, 60);
  await page.waitForTimeout(450);
  await expect(page).toHaveURL(/\/dekanat\/new\?type=cert_study$/);
});
