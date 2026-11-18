import { expect, test, type Page } from "@playwright/test";
import { resetDemoWorld, screenshotsEnabled, shoot, signIn } from "./demo";
import { mskAt, mskToday, SEEDED_LESSONS, seedTodayLessons } from "./schedule-seed";

// Серия 11 в docs/screenshots — доработки 17 ноября: «Следующая пара» на «Сегодня», пороги оценок в «Учёбе»,
// «Пары» как дневник с раскрытой парой. Только снимки, без проверок продукта (их делают app-feel, study-diary).
// Запуск: SCREENSHOTS=1 npx playwright test e2e/screens-11.spec.ts — без флага файл пропускается целиком.
//
// Время. Сервер считает по настоящим часам, `page.clock` двигает только часы браузера. Поэтому экраны целиком
// снимаются на чистом демо-мире по настоящему времени (подзаголовок «Сегодня» и блок не противоречат друг другу),
// а состояния блока «до пары» и «идёт пара» — отдельными кадрами только блока, на известных парах из schedule-seed.

test.skip(!screenshotsEnabled(), "снимки серии 11 — только с SCREENSHOTS=1");
test.describe.configure({ mode: "serial" });

test.beforeAll(() => resetDemoWorld());
test.afterAll(() => resetDemoWorld());

const width = (page: Page) => page.viewportSize()!.width;
const block = (page: Page) => page.locator("section[aria-labelledby='next-lesson-h']");

/** Среда текущей недели (по МСК): в будни у демо-группы есть пары с темами и материалами. */
function wednesday(): string {
  const d = new Date(Date.now() + 3 * 3600_000);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 2);
  return d.toISOString().slice(0, 10);
}

/** Страница дорисована: заглушка загрузки ушла, сеть затихла, шрифты на месте — иначе снимок поймает скелет. */
async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await expect(page.locator("#main [class*='skeleton' i]")).toHaveCount(0);
  await expect(page.getByText("Загружаем…")).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400); // раскрытие пары и заполнение полосы баллов анимируются до ~250 мс
}

async function snap(page: Page, name: string) {
  await settle(page);
  await shoot(page, name, width(page), "11");
}

async function dark(page: Page, baseURL: string | undefined) {
  await page.context().addCookies([{ name: "ns_theme", value: "dark", url: baseURL! }]);
}

/** Раскрыть неотменённую пару с материалами (иначе первую неотменённую). */
async function openLesson(page: Page) {
  const active = page.locator("#main details").filter({ hasNotText: "Отменена" });
  const withMaterials = active.filter({ hasText: "Материалы" }).first();
  const target = (await withMaterials.count()) ? withMaterials : active.first();
  await target.locator("> summary").click();
  await expect(target).toHaveJSProperty("open", true);
}

for (const theme of ["light", "dark"] as const) {
  const tag = theme === "dark" ? "-dark" : "";

  test(`«Сегодня» по настоящему времени (${theme})`, async ({ page, baseURL }) => {
    if (theme === "dark") await dark(page, baseURL);
    await signIn(page, "alina");
    await page.goto("/");
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
    await snap(page, `today${tag}`);
  });

  test(`«Учёба»: пороги оценок (${theme})`, async ({ page, baseURL }) => {
    if (theme === "dark") await dark(page, baseURL);
    await signIn(page, "alina");
    await page.goto("/study");
    await expect(page.getByText(/До («\d»|зачёта) нужно ещё/).first()).toBeVisible();
    await snap(page, `study-goals${tag}`);
  });

  test(`«Пары»: неделя-дневник и раскрытая пара (${theme})`, async ({ page, baseURL }) => {
    if (theme === "dark") await dark(page, baseURL);
    await signIn(page, "alina");
    await page.goto(`/schedule?view=week&date=${wednesday()}`);
    await expect(page.locator("#main details").first()).toBeVisible();
    await snap(page, `week${tag}`);

    await page.goto(`/schedule?view=day&date=${wednesday()}`);
    await expect(page.locator("#main details").first()).toBeVisible();
    await openLesson(page);
    await snap(page, `lesson-open${tag}`);
  });
}

// Последними: пары на сегодня подменяются известными (09:00, 10:40, 14:20), afterAll вернёт демо-мир.
test.describe("блок «Следующая пара» в разных состояниях", () => {
  test.beforeAll(async () => {
    await seedTodayLessons();
  });

  const [FIRST] = SEEDED_LESSONS;
  const states = [
    ["next", FIRST.start - 25, "Следующая пара"],
    ["now", FIRST.start + 35, "Идёт сейчас"],
  ] as const;

  for (const theme of ["light", "dark"] as const) {
    for (const [state, minutes, heading] of states) {
      test(`${heading} (${theme})`, async ({ page, baseURL }) => {
        if (theme === "dark") await dark(page, baseURL);
        await signIn(page, "alina");
        await page.clock.install({ time: mskAt(mskToday(), minutes) });
        await page.goto("/");
        await expect(block(page).getByRole("heading", { level: 2 })).toHaveText(heading);
        await settle(page);
        await block(page).screenshot({
          path: `docs/screenshots/11-next-lesson-${state}${theme === "dark" ? "-dark" : ""}-${width(page)}.png`,
        });
      });
    }
  }
});
