import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readRows } from "./db";
import { resetDemoWorld, shoot, signIn } from "./demo";

// Доступность: axe-core (WCAG 2.0/2.1 A и AA) на всех ключевых экранах, на 360 и 1280 px.
// Допускаем 0 нарушений уровня serious и critical; moderate/minor выводим в лог теста для сведения.

test.beforeAll(() => resetDemoWorld());

async function scan(page: Page, label: string) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const report = serious.map((v) => ({
    rule: v.id, impact: v.impact, help: v.help,
    nodes: v.nodes.slice(0, 4).map((n) => `${n.target.join(" ")} :: ${n.failureSummary?.split("\n").slice(1, 3).join(" ")}`),
  }));
  expect.soft(report, `${label}: серьёзные нарушения доступности`).toEqual([]);
  const minor = violations.filter((v) => !serious.includes(v)).map((v) => `${v.id} (${v.impact})`);
  if (minor.length) test.info().annotations.push({ type: `${label}: прочее`, description: minor.join(", ") });
}

async function appealIdOf(login: string, title: string): Promise<string> {
  const rows = await readRows<{ id: string }>(async (sql) => sql`
    select a.id from appeals a
      join students s on s.id = a.student_id join users u on u.id = s.user_id
      join appeal_types t on t.code = a.type_code
     where u.login = ${login} and t.title = ${title}`);
  expect(rows).toHaveLength(1);
  return rows[0].id;
}

test("вход: без нарушений; снимок для журнала", async ({ page }) => {
  await page.goto("/login");
  await scan(page, "/login");
  await page.goto("/login?reason=expired");
  await scan(page, "/login?reason=expired");
  await page.goto("/login");
  await shoot(page, "login-a11y", page.viewportSize()!.width, "05");
});

test("страницы студента", async ({ page }) => {
  test.setTimeout(120_000);
  const card = await appealIdOf("alina.mironova", "Справка для военкомата");
  await signIn(page, "alina");
  for (const path of [
    "/", "/schedule", "/schedule?view=week", "/study", "/study?tab=session", "/study?tab=history",
    "/dekanat", "/dekanat?q=справка", "/dekanat/new", "/dekanat/new?type=cert_military", "/dekanat/new?type=stip_increased&prefill=1",
    `/dekanat/${card}`, "/notifications", "/notifications?tab=announcements", "/profile", "/about",
    "/profile/stress", "/profile/language", "/profile/notifications",
  ]) {
    await page.goto(path);
    await scan(page, path);
  }
  // ошибки формы тоже доступны: aria-invalid, связь с текстом ошибки
  await page.goto("/dekanat/new?type=cert_military");
  await page.getByRole("button", { name: "Отправить" }).click();
  await expect(page.getByText("Заполни поле")).toBeVisible();
  await scan(page, "форма с ошибкой");
});

test("пара раскрыта (день, неделя) и «Семестр»", async ({ page }) => {
  test.setTimeout(120_000);
  const d = new Date(Date.now() + 3 * 3600_000);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 2); // среда текущей недели
  const wed = d.toISOString().slice(0, 10);
  await signIn(page, "alina");
  for (const [view, label] of [["day", "день"], ["week", "неделя"]]) {
    await page.goto(`/schedule?view=${view}&date=${wed}`);
    await page.locator("#main details > summary").first().click();
    await expect(page.locator("#main details[open]")).toHaveCount(1);
    await scan(page, `«Пары → ${label}», пара раскрыта`);
  }
  await page.goto("/study");
  await scan(page, "«Учёба → Семестр»");
});

test("«Сегодня» с блоком «Следующая пара» и во время пары (часы браузера)", async ({ page }) => {
  await signIn(page, "alina");
  await page.goto("/");
  await expect(page.locator("section[aria-labelledby='next-lesson-h']")).toBeVisible();
  await scan(page, "«Сегодня» с блоком");
  const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  await page.goto(`/schedule?view=day&date=${today}`);
  const range = await page.locator("#main details:not([data-cancelled]) summary [class*='range']").first().textContent({ timeout: 3000 }).catch(() => null);
  const start = range?.match(/\d\d:\d\d/)?.[0];
  test.skip(!start, "сегодня нет пар");
  const [h, m] = start!.split(":").map(Number);
  await page.clock.install({ time: new Date(`${today}T00:00:00+03:00`).getTime() + (h * 60 + m + 5) * 60_000 });
  await page.goto("/");
  await expect(page.locator("section[aria-labelledby='next-lesson-h'] h2")).toHaveText("Идёт сейчас");
  await scan(page, "«Сегодня», идёт пара");
});

test("карточка обращения «нужно уточнение» и «готово» у Дениса", async ({ page }) => {
  await signIn(page, "denis");
  for (const title of ["Пересдача", "Справка об обучении"]) {
    await page.goto(`/dekanat/${await appealIdOf("denis.kravtsov", title)}`);
    await scan(page, `карточка «${title}»`);
  }
});

test("кабинет сотрудника", async ({ page }) => {
  test.setTimeout(120_000);
  const card = await appealIdOf("alina.mironova", "Справка для военкомата");
  await signIn(page, "irina");
  for (const path of [
    "/staff", "/staff?tab=in_progress", "/staff?tab=waiting", "/staff?tab=closed",
    `/staff/appeals/${card}`, "/staff/announcements", "/staff/profile", "/staff/profile/stress",
  ]) {
    await page.goto(path);
    await scan(page, path);
  }
  // раскрытые формы решения («Готово», «Отклонить») тоже
  await page.goto(`/staff/appeals/${card}`);
  const decision = page.getByRole("region", { name: "Решение" });
  await decision.locator("summary", { hasText: "Отклонить" }).click();
  await scan(page, "карточка сотрудника: форма отказа");
});
