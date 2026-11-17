import { expect, test, type Page } from "@playwright/test";
import { collectConsoleErrors, hasNoHorizontalScroll, resetDemoWorld, signIn } from "./demo";

// Сквозная проверка «ощущения» приложения: иконка и манифест, блок «Следующая пара» на «Сегодня»,
// переходы без двойной анимации, раскрытие пары, кольцо фокуса, движение выключается по просьбе системы.
//
// Время. Сервер считает по настоящим часам, `page.clock` управляет только часами браузера. Блок считает «сейчас»
// в браузере (после первого рендера), и только по времени суток МСК, поэтому мы берём настоящие пары сегодняшнего дня
// со страницы «Пары → День» и ставим часы браузера в нужную минуту относительно них.

test.beforeAll(() => resetDemoWorld());
test.afterAll(() => resetDemoWorld());

const mskToday = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const block = (page: Page) => page.locator("section[aria-labelledby='next-lesson-h']");
const mskAt = (key: string, minutes: number) =>
  new Date(`${key}T${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00+03:00`);

/** Неотменённые пары сегодняшнего дня (начало и конец в минутах от полуночи), как их видит студент в «Парах → День». */
async function todaysLessons(page: Page): Promise<{ start: number; end: number }[]> {
  await page.goto(`/schedule?view=day&date=${mskToday()}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Пары");
  return page.evaluate(() =>
    [...document.querySelectorAll("#main details:not([data-cancelled])")]
      .map((d) => d.querySelector("summary [class*='range']")?.textContent?.match(/\d\d:\d\d/g) ?? [])
      .filter((t) => t.length === 2)
      .map(([s, e]) => ({ start: Number(s.slice(0, 2)) * 60 + Number(s.slice(3)), end: Number(e.slice(0, 2)) * 60 + Number(e.slice(3)) }))
      .sort((a, b) => a.start - b.start));
}

test("иконка и манифест отдаются как есть", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
  const manifest = await res.json();
  expect(manifest.short_name).toBe("На связи");
  expect(manifest.display).toBe("standalone");
  for (const icon of manifest.icons as { src: string; type: string }[]) {
    const r = await request.get(icon.src, { maxRedirects: 0 });
    expect(r.status(), icon.src).toBe(200);
    expect(r.headers()["content-type"], icon.src).toBe("image/png");
  }
  const apple = await request.get("/apple-icon.png", { maxRedirects: 0 });
  expect(apple.status()).toBe(200);
  expect(apple.headers()["content-type"]).toBe("image/png");
});

test("«Сегодня»: блок первый под заголовком и выше плашки деканата", async ({ page }) => {
  await signIn(page, "alina");
  const h1 = page.getByRole("main").getByRole("heading", { level: 1 });
  const hero = block(page);
  await expect(hero).toBeVisible();
  await expect(hero.getByRole("heading", { level: 2 })).toHaveText(/^(Следующая пара|Идёт сейчас)$/);
  const nudges = page.getByRole("region", { name: "Деканат пишет первым" });
  await expect(nudges).toBeVisible();
  const [h1Box, heroBox, nudgeBox] = await Promise.all([h1.boundingBox(), hero.boundingBox(), nudges.boundingBox()]);
  expect(h1Box!.y).toBeLessThan(heroBox!.y);
  expect(heroBox!.y + heroBox!.height).toBeLessThanOrEqual(nudgeBox!.y);
  // и в порядке разметки блок перед плашкой
  expect(await hero.evaluate((el, n) => !!(el.compareDocumentPosition(n!) & Node.DOCUMENT_POSITION_FOLLOWING), await nudges.elementHandle())).toBe(true);
  expect(await hasNoHorizontalScroll(page)).toBe(true);
});

test.describe("часы браузера", () => {
  test("до пары — «Следующая пара через N мин», нажатие ведёт в «День»", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await signIn(page, "alina");
    const lessons = await todaysLessons(page);
    test.skip(lessons.length === 0, "сегодня нет неотменённых пар (выходной): блок «идёт сейчас» нечем проверить");
    const key = mskToday();
    const first = lessons[0];

    // за 20 минут до первой пары
    await page.clock.install({ time: mskAt(key, first.start - 20) });
    await page.goto("/");
    await expect(block(page).getByRole("heading", { level: 2 })).toHaveText("Следующая пара");
    await expect(block(page)).toContainText(/через (19|20) мин/);

    // нажатие ведёт в «Пары → День» на день этой пары
    await block(page).getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/schedule\\?view=day&date=${key}$`));

    expect(errors).toEqual([]);
  });

  test("во время пары — «Идёт сейчас», и состояние меняется само, без перезагрузки", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await signIn(page, "alina");
    const lessons = await todaysLessons(page);
    test.skip(lessons.length === 0, "сегодня нет неотменённых пар (выходной)");
    const first = lessons[0];
    await page.clock.install({ time: mskAt(mskToday(), first.start + 5) });
    await page.goto("/");
    await expect(block(page).getByRole("heading", { level: 2 })).toHaveText("Идёт сейчас");
    await expect(block(page)).toContainText(/осталось \d+ мин/);
    const during = (await block(page).innerText()).trim();

    // часы уходят на минуту за конец пары; страницу не перезагружаем (метка на window переживёт только клиентский пересчёт)
    await page.evaluate(() => { (window as unknown as { __same: boolean }).__same = true; });
    await page.clock.fastForward((first.end - first.start - 5 + 1) * 60_000);
    await expect.poll(async () => (await block(page).innerText()).trim()).not.toBe(during);
    expect(await page.evaluate(() => (window as unknown as { __same?: boolean }).__same)).toBe(true);
    if (lessons.length > 1) {
      await expect(block(page).getByRole("heading", { level: 2 })).toHaveText(/^(Следующая пара|Идёт сейчас)$/);
    } else {
      await expect(block(page)).toContainText("На сегодня всё");
    }
    expect(errors).toEqual([]);
  });

  test("после последней пары — «На сегодня всё»", async ({ page }) => {
    await signIn(page, "alina");
    const lessons = await todaysLessons(page);
    test.skip(lessons.length === 0, "сегодня нет неотменённых пар");
    const last = lessons[lessons.length - 1];
    test.skip(last.end >= 23 * 60, "последняя пара заканчивается слишком поздно для проверки");
    await page.clock.install({ time: mskAt(mskToday(), last.end + 10) });
    await page.goto("/");
    await expect(block(page)).toContainText("На сегодня всё");
  });
});

test.describe("переходы", () => {
  test("«›» в «Парах → День» запускает переход (startViewTransition > 0)", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __vtCount: number };
      w.__vtCount = 0;
      const orig = document.startViewTransition?.bind(document);
      if (!orig) return;
      document.startViewTransition = (arg: unknown) => { w.__vtCount++; return orig(arg as never); };
    });
    await signIn(page, "alina");
    await page.goto(`/schedule?view=day&date=${mskToday()}`);
    await page.waitForTimeout(800);
    const supported = await page.evaluate(() => typeof document.startViewTransition === "function");
    test.skip(!supported, "в браузере нет View Transitions");
    await page.evaluate(() => { (window as unknown as { __vtCount: number }).__vtCount = 0; });
    await page.getByRole("link", { name: "Следующая неделя" }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __vtCount: number }).__vtCount)).toBeGreaterThan(0);
  });
  // Свайп: React вызывает startViewTransition и без типа, но именованных анимаций old/new при этом нет —
  // это проверяет e2e/transitions.spec.ts («после листания пальцем»); счётчик вызовов тут был бы ложным сигналом.
});

test("пара раскрывается и закрывается дважды подряд без ошибок", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await signIn(page, "alina");
  const lessons = await todaysLessons(page);
  test.skip(lessons.length === 0, "сегодня нет пар");
  const summary = page.locator("#main details > summary").first();
  const details = page.locator("#main details").first();
  for (let i = 0; i < 2; i++) {
    await summary.click();
    await expect(details).toHaveJSProperty("open", true);
    await expect(details.locator("> div").last()).toBeVisible();
    await summary.click();
    await expect(details).toHaveJSProperty("open", false);
  }
  expect(errors).toEqual([]);
});

test("кольцо фокуса карточки пары не срезается краями листа (360 px)", async ({ page, isMobile }) => {
  test.skip(!isMobile, "срез только на узком экране");
  await signIn(page, "alina");
  const lessons = await todaysLessons(page);
  test.skip(lessons.length === 0, "сегодня нет пар");
  await page.keyboard.press("Tab");
  await expect.poll(async () => {
    await page.keyboard.press("Tab");
    return page.evaluate(() => document.activeElement?.tagName === "SUMMARY");
  }, { timeout: 15_000 }).toBe(true);
  const geo = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const root = el.closest("[data-swipe]") as HTMLElement;
    const s = getComputedStyle(el);
    const ring = parseFloat(s.outlineOffset) + parseFloat(s.outlineWidth);
    const r = el.getBoundingClientRect();
    const b = root.getBoundingClientRect();
    return { outlineStyle: s.outlineStyle, left: r.left - ring - b.left, right: b.right - (r.right + ring) };
  });
  expect(geo.outlineStyle).not.toBe("none");
  // внешний край кольца не выходит за границы листа (иначе overflow-x: clip его срежет)
  expect(geo.left).toBeGreaterThanOrEqual(0);
  expect(geo.right).toBeGreaterThanOrEqual(0);
  await page.locator("#main details > summary").first().screenshot({ path: "test-results/focus-ring-360.png" });
});

test.describe("без движения (prefers-reduced-motion)", () => {
  test.use({ reducedMotion: "reduce" });

  test("после раскрытия пары и открытия «Учёбы» анимаций нет", async ({ page }) => {
    await signIn(page, "alina");
    const lessons = await todaysLessons(page);
    test.skip(lessons.length === 0, "сегодня нет пар");
    await page.locator("#main details > summary").first().click();
    await expect(page.locator("#main details[open]")).toHaveCount(1);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => document.getAnimations().length), "после раскрытия пары").toBe(0);
    await page.getByRole("navigation", { name: "Разделы", exact: true }).getByRole("link", { name: "Учёба" }).first().click();
    await expect(page).toHaveURL(/\/study/);
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => document.getAnimations().length), "в «Учёбе»").toBe(0);
  });
});
