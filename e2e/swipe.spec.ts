import { expect, test, type Page } from "@playwright/test";
import { collectConsoleErrors, hasNoHorizontalScroll, resetDemoWorld, signIn } from "./demo";

// Свайп между разделами на телефоне. Палец — настоящие touch-события через CDP (Input.dispatchTouchEvent):
// браузер сам превращает их в pointer-события с pointerType="touch", как на устройстве.
// Файл идёт только в проекте mobile-360 (см. playwright.config.ts).

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

const h1 = (page: Page) => page.getByRole("heading", { level: 1 });
const activeTab = (page: Page) => page.getByRole("navigation", { name: "Разделы", exact: true }).locator('[aria-current="page"]');

test("свайп влево и вправо листает разделы по порядку", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await signIn(page, "alina");
  await expect(page).toHaveURL(/\/$/);

  await swipe(page, 300, 60); // влево → следующий раздел
  await expect(page).toHaveURL(/\/schedule$/);
  await expect(h1(page)).toHaveText("Пары");
  await expect(activeTab(page)).toHaveText("Пары");

  await swipe(page, 300, 60);
  await expect(page).toHaveURL(/\/study$/);
  await expect(activeTab(page)).toHaveText("Учёба");

  await swipe(page, 60, 300); // вправо → предыдущий
  await expect(page).toHaveURL(/\/schedule$/);

  await swipe(page, 60, 300);
  await expect(page).toHaveURL(/\/$/);
  await expect(h1(page)).toContainText("Алина");
  // лист вернулся на место: ни сдвига, ни прозрачности, ни горизонтальной прокрутки
  await expect.poll(() => page.locator("#main [data-swipe] > div").first().evaluate((el) => {
    const s = getComputedStyle(el);
    return `${s.transform}|${s.opacity}`;
  })).toBe("none|1");
  expect(await hasNoHorizontalScroll(page)).toBe(true);
  expect(errors).toEqual([]);
});

test("короткий медленный сдвиг не переключает раздел — лист возвращается", async ({ page }) => {
  await signIn(page, "alina");
  await swipe(page, 220, 170, { ms: 500 });
  await page.waitForTimeout(450);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("#main [data-swipe] > div").first()).toHaveCSS("opacity", "1");
});

test("быстрое смахивание срабатывает и на коротком пути", async ({ page }) => {
  await signIn(page, "alina");
  // 90 px — меньше порога по расстоянию (≈101 px на 360), но быстро: события подряд, без пауз
  await swipe(page, 250, 160, { steps: 3, ms: 0 });
  await expect(page).toHaveURL(/\/schedule$/);
});

test("на первом разделе свайп вправо никуда не уводит, на последнем — влево", async ({ page }) => {
  await signIn(page, "alina");
  await swipe(page, 60, 320);
  await page.waitForTimeout(450);
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/profile");
  await swipe(page, 320, 60);
  await page.waitForTimeout(450);
  await expect(page).toHaveURL(/\/profile$/);
});

test("вертикальная прокрутка остаётся прокруткой", async ({ page }) => {
  await signIn(page, "alina");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 180, y: 600 }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 180 + i * 3, y: 600 - i * 40 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(50);
});

test("на вложенной странице (мастер обращения) свайп выключен: с формы не уводит", async ({ page }) => {
  await signIn(page, "alina");
  await page.goto("/dekanat/new?type=cert_study");
  await swipe(page, 300, 60);
  await page.waitForTimeout(450);
  await expect(page).toHaveURL(/\/dekanat\/new\?type=cert_study$/);
});

test("в поле ввода палец двигает курсор, а не раздел", async ({ page }) => {
  await signIn(page, "alina");
  await page.goto("/dekanat");
  const box = await page.getByRole("searchbox").or(page.getByRole("textbox")).first().boundingBox();
  expect(box).not.toBeNull();
  await swipe(page, box!.x + box!.width - 20, box!.x + 20, { y: box!.y + box!.height / 2 });
  await page.waitForTimeout(450);
  await expect(page).toHaveURL(/\/dekanat$/);
});

test("сотрудник листает свои разделы", async ({ page }) => {
  await signIn(page, "irina");
  await expect(page).toHaveURL(/\/staff$/);
  await swipe(page, 300, 60);
  await expect(page).toHaveURL(/\/staff\/announcements$/);
  await swipe(page, 60, 300);
  await expect(page).toHaveURL(/\/staff$/);
});

test("без движения (prefers-reduced-motion) свайп всё равно переключает раздел", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page, "alina");
  await swipe(page, 300, 60);
  await expect(page).toHaveURL(/\/schedule$/);
});
