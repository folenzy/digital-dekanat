import { expect, test, type Page } from "@playwright/test";
import { collectConsoleErrors, hasNoHorizontalScroll, resetDemoWorld, signIn } from "./demo";
import { mskAt, mskToday, SEEDED_LESSONS, seedTodayLessons } from "./schedule-seed";

// Сквозная проверка «ощущения» приложения: иконка и манифест, блок «Следующая пара» на «Сегодня»,
// переходы без двойной анимации, раскрытие пары, кольцо фокуса, движение выключается по просьбе системы.
//
// Время. Сервер считает по настоящим часам, `page.clock` управляет только часами браузера. Блок считает «сейчас»
// в браузере (после первого рендера) и только по времени суток МСК. Поэтому на сегодняшний день мы вписываем в БД
// три известные пары (09:00, 10:40, 14:20; см. schedule-seed.ts) — в любой день недели, и ставим часы браузера
// относительно них. Тесты, которым «сегодня» не нужно, берут среду текущей недели.

test.beforeAll(async () => {
  resetDemoWorld();
  await seedTodayLessons();
});
test.afterAll(() => resetDemoWorld());

const block = (page: Page) => page.locator("section[aria-labelledby='next-lesson-h']");
const [FIRST, SECOND, FOURTH] = SEEDED_LESSONS;

/** Среда текущей недели (по МСК). */
function wednesday(): string {
  const d = new Date(Date.now() + 3 * 3600_000);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 2);
  return d.toISOString().slice(0, 10);
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
    const key = mskToday();
    await page.clock.install({ time: mskAt(key, FIRST.start - 20) });
    await page.goto("/");
    await expect(block(page).getByRole("heading", { level: 2 })).toHaveText("Следующая пара");
    await expect(block(page)).toContainText(/через (19|20) мин/);

    await block(page).getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/schedule\\?view=day&date=${key}$`));
    expect(errors).toEqual([]);
  });

  test("во время пары — «Идёт сейчас», и состояние меняется само, без перезагрузки", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await signIn(page, "alina");
    await page.clock.install({ time: mskAt(mskToday(), FIRST.start + 5) });
    await page.goto("/");
    await expect(block(page).getByRole("heading", { level: 2 })).toHaveText("Идёт сейчас");
    await expect(block(page)).toContainText(/осталось 85 мин/);
    await expect(block(page)).toContainText("прошла 0 из 3");

    // часы уходят на минуту за конец пары; страницу не перезагружаем (метка на window переживёт только клиентский пересчёт)
    await page.evaluate(() => { (window as unknown as { __same: boolean }).__same = true; });
    await page.clock.fastForward((FIRST.end - FIRST.start - 5 + 1) * 60_000);
    await expect(block(page).getByRole("heading", { level: 2 })).toHaveText("Следующая пара");
    await expect(block(page)).toContainText(/через 9 мин/);
    await expect(block(page)).toContainText("прошла 1 из 3");
    expect(await page.evaluate(() => (window as unknown as { __same?: boolean }).__same)).toBe(true);

    // и дальше, в середину второй пары
    await page.clock.fastForward((SECOND.start - FIRST.end - 1 + 5) * 60_000);
    await expect(block(page).getByRole("heading", { level: 2 })).toHaveText("Идёт сейчас");
    expect(errors).toEqual([]);
  });

  test("после последней пары — «На сегодня всё»", async ({ page }) => {
    await signIn(page, "alina");
    await page.clock.install({ time: mskAt(mskToday(), FOURTH.end + 10) });
    await page.goto("/");
    await expect(block(page)).toContainText("На сегодня всё");
  });
});

test("«›» в «Парах → День» запускает переход (startViewTransition > 0)", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __vtCount: number };
    w.__vtCount = 0;
    const orig = document.startViewTransition?.bind(document);
    if (!orig) return;
    document.startViewTransition = (arg: unknown) => { w.__vtCount++; return orig(arg as never); };
  });
  await signIn(page, "alina");
  await page.goto(`/schedule?view=day&date=${wednesday()}`);
  expect(await page.evaluate(() => typeof document.startViewTransition === "function"), "в браузере нет View Transitions").toBe(true);
  // нажатие до гидратации даст обычный переход по ссылке (счётчик обнулится) — повторяем, пока клиент не подхватит
  await expect(async () => {
    await page.getByRole("link", { name: "Следующая неделя" }).click();
    expect(await page.evaluate(() => (window as unknown as { __vtCount: number }).__vtCount)).toBeGreaterThan(0);
  }).toPass({ timeout: 15_000 });
  // Свайп: React вызывает startViewTransition и без типа, но именованных анимаций old/new при этом нет —
  // это проверяет e2e/transitions.spec.ts («после листания пальцем»); счётчик вызовов тут был бы ложным сигналом.
});

test("пара раскрывается и закрывается дважды подряд без ошибок", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await signIn(page, "alina");
  await page.goto(`/schedule?view=day&date=${wednesday()}`);
  const summary = page.locator("#main details > summary").first();
  const details = page.locator("#main details").first();
  await expect(summary).toBeVisible();
  for (let i = 0; i < 2; i++) {
    await summary.click();
    await expect(details).toHaveJSProperty("open", true);
    await expect(details.locator("> div").last()).toBeVisible();
    await summary.click();
    await expect(details).toHaveJSProperty("open", false);
  }
  expect(errors).toEqual([]);
});

test.describe("кольцо фокуса карточки пары (360 px)", () => {
  test.skip(({ isMobile }) => !isMobile, "срез только на узком экране");

  for (const theme of ["light", "dark"] as const) {
    test(`кольцо видно и не срезается краями листа, тема: ${theme}`, async ({ page, context, baseURL }) => {
      if (theme === "dark") await context.addCookies([{ name: "ns_theme", value: "dark", url: baseURL! }]);
      await signIn(page, "alina");
      await page.goto(`/schedule?view=day&date=${wednesday()}`);
      expect(await page.locator("html").getAttribute("data-theme")).toBe(theme);
      await expect(page.locator("#main details > summary").first()).toBeVisible();
      await expect(async () => {
        await page.keyboard.press("Tab");
        expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("SUMMARY");
      }).toPass({ timeout: 15_000 });

      const geo = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const s = getComputedStyle(el);
        const width = parseFloat(s.outlineWidth);
        const grow = width + parseFloat(s.outlineOffset); // насколько внешний край кольца выходит за рамку элемента
        const r = el.getBoundingClientRect();
        const ring = { left: r.left - grow, right: r.right + grow, top: r.top - grow, bottom: r.bottom + grow };
        // все предки, которые обрезают содержимое (overflow не visible), кроме корневых html/body (они — окно)
        const clips: { tag: string; left: number; right: number; top: number; bottom: number }[] = [];
        for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
          const o = getComputedStyle(p);
          const cx = o.overflowX !== "visible";
          const cy = o.overflowY !== "visible";
          if (!cx && !cy) continue;
          const b = p.getBoundingClientRect();
          clips.push({
            tag: `${p.tagName}.${p.className}`,
            left: cx ? b.left : -Infinity, right: cx ? b.right : Infinity,
            top: cy ? b.top : -Infinity, bottom: cy ? b.bottom : Infinity,
          });
        }
        return { style: s.outlineStyle, width, ring, clips, viewport: document.documentElement.clientWidth };
      });
      // кольцо есть и видно
      expect(geo.style).not.toBe("none");
      expect(geo.width).toBeGreaterThanOrEqual(2);
      // внешний край кольца внутри окна и внутри каждого обрезающего предка
      expect(geo.ring.left).toBeGreaterThanOrEqual(0);
      expect(geo.ring.right).toBeLessThanOrEqual(geo.viewport);
      for (const c of geo.clips) {
        expect(geo.ring.left, `${c.tag}: левый край кольца`).toBeGreaterThanOrEqual(c.left);
        expect(geo.ring.right, `${c.tag}: правый край кольца`).toBeLessThanOrEqual(c.right);
        expect(geo.ring.top, `${c.tag}: верхний край кольца`).toBeGreaterThanOrEqual(c.top);
        expect(geo.ring.bottom, `${c.tag}: нижний край кольца`).toBeLessThanOrEqual(c.bottom);
      }
      expect(geo.clips.length, "лист SwipePane обрезает по горизонтали — предок найден").toBeGreaterThan(0);
      await page.locator("#main details > summary").first().screenshot({ path: `test-results/focus-ring-360-${theme}.png` });
    });
  }
});

test.describe("без движения (prefers-reduced-motion)", () => {
  test.use({ reducedMotion: "reduce" });

  test("после раскрытия пары и открытия «Учёбы» анимаций нет", async ({ page }) => {
    await signIn(page, "alina");
    await page.goto(`/schedule?view=day&date=${wednesday()}`);
    await page.locator("#main details > summary").first().click();
    await expect(page.locator("#main details[open]")).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => document.getAnimations().length), { message: "после раскрытия пары" }).toBe(0);
    await page.getByRole("navigation", { name: "Разделы", exact: true }).getByRole("link", { name: "Учёба" }).first().click();
    await expect(page).toHaveURL(/\/study/);
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.getAnimations().length), { message: "в «Учёбе»" }).toBe(0);
  });
});
