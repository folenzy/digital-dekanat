import { expect, test, type Page } from "@playwright/test";
import { collectConsoleErrors, resetDemoWorld, signIn } from "./demo";

// Переходы между экранами (View Transitions). Считаем вызовы document.startViewTransition и смотрим,
// какие ::view-transition-old/new анимации реально запускались. Листание пальцем — только тач (mobile-360).

test.beforeAll(() => resetDemoWorld());

const mskToday = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

type Probe = { calls: { types: string; old: number; new: number }[] };

async function install(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __vt: Probe };
    w.__vt = { calls: [] };
    const orig = document.startViewTransition?.bind(document);
    if (!orig) return;
    document.startViewTransition = (arg: unknown) => {
      const t = orig(arg as never);
      const call = { types: [...(t as unknown as { types: Set<string> }).types].join(","), old: 0, new: 0 };
      w.__vt.calls.push(call);
      t.ready.then(() => {
        for (const a of document.getAnimations()) {
          const p = String((a.effect as KeyframeEffect).pseudoElement);
          if (p.startsWith("::view-transition-old(_")) call.old++;
          if (p.startsWith("::view-transition-new(_")) call.new++;
        }
      }).catch(() => {});
      return t;
    };
  });
}
const calls = (page: Page) => page.evaluate(() => (window as unknown as { __vt: Probe }).__vt.calls);
const clear = (page: Page) => page.evaluate(() => { (window as unknown as { __vt: Probe }).__vt.calls = []; });

async function swipeLeft(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 330, y: 420 }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 330 - i * 27, y: 420 }] });
    await page.waitForTimeout(18);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

async function openToday(page: Page) {
  await install(page);
  await signIn(page, "alina");
  await page.goto(`/schedule?view=day&date=${mskToday()}`);
  await page.waitForTimeout(800); // дать странице догрузить обработчики жеста
}

test("стрелка «›»: сдвиг вперёд — уходит старый лист и приходит новый", async ({ page }) => {
  await openToday(page);
  await clear(page);
  await page.getByRole("link", { name: "Следующая неделя" }).click();
  await expect.poll(async () => (await calls(page)).length).toBe(1);
  await expect.poll(async () => (await calls(page))[0].new).toBeGreaterThan(0);
  const [c] = await calls(page);
  expect(c.types).toBe("nav-forward");
  expect(c.old).toBeGreaterThan(0);
});

test.describe("после листания пальцем", () => {
  test.skip(({ isMobile }) => !isMobile, "жест — только тач");

  test("свайп без ошибок в консоли; следующая стрелка «›» даёт и exit, и enter", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await openToday(page);
    const before = new URL(page.url()).searchParams.get("date");
    await swipeLeft(page);
    await expect.poll(() => new URL(page.url()).searchParams.get("date")).not.toBe(before);
    await page.waitForTimeout(700);
    // у свайпа нет типа: ни одной именованной анимации перехода
    for (const c of await calls(page)) expect(c.old + c.new).toBe(0);
    await clear(page);
    await page.getByRole("link", { name: "Следующая неделя" }).click();
    await expect.poll(async () => (await calls(page)).length).toBe(1);
    await expect.poll(async () => (await calls(page))[0].new).toBeGreaterThan(0);
    const [c] = await calls(page);
    expect(c.types).toBe("nav-forward");
    expect(c.old).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test("после свайпа уход в другой раздел растворяет содержимое", async ({ page }) => {
    await openToday(page);
    await swipeLeft(page);
    await page.waitForTimeout(300);
    await clear(page);
    await page.getByRole("link", { name: /Профиль/ }).first().click();
    await expect(page).toHaveURL(/\/profile/);
    await expect.poll(async () => (await calls(page)).some((c) => c.types === "section" && c.old > 0 && c.new > 0)).toBe(true);
  });
});
