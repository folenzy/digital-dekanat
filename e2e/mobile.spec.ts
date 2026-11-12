import { expect, test, type Browser, type Page } from "@playwright/test";
import { readRows } from "./db";
import { collectConsoleErrors, hasNoHorizontalScroll, resetDemoWorld, signIn } from "./demo";

// Телефон 360×740: каждый экран студента и сотрудника (и по карточке на каждый статус обращения) без
// горизонтальной прокрутки, цели нижней навигации и колокольчика не меньше 44×44 px, а сообщение с тегами,
// эмодзи и длинным словом выводится текстом и не растягивает страницу. Только проект mobile-360 (в playwright.config.ts desktop-1280 этот файл пропускает).

const VIEWPORT = { width: 360, height: 740 };
const MIN_TARGET = 44;

test.describe.configure({ mode: "serial" });
test.use({ viewport: VIEWPORT });

test.beforeAll(() => resetDemoWorld());
test.afterAll(() => resetDemoWorld());

/** Страница без горизонтальной прокрутки; при провале в сообщении путь и ширина. */
async function expectFits(page: Page, label: string) {
  const fits = await hasNoHorizontalScroll(page);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(fits, `${label}: scrollWidth ${width} > ${VIEWPORT.width}`).toBe(true);
}

/** Нижняя навигация и колокольчик: размер каждой нажимаемой цели. */
async function expectTapTargets(page: Page, label: string) {
  const targets = page.locator('nav[aria-label="Разделы"] a, a[aria-label^="Уведомления"]');
  const n = await targets.count();
  expect(n, `${label}: цели навигации найдены`).toBeGreaterThanOrEqual(3);
  for (let i = 0; i < n; i++) {
    const box = await targets.nth(i).boundingBox();
    const name = (await targets.nth(i).getAttribute("aria-label")) ?? (await targets.nth(i).innerText()).trim();
    if (!box || box.width === 0) continue; // скрытый на этой ширине (боковая панель)
    expect(box.width, `${label}: «${name}» ширина`).toBeGreaterThanOrEqual(MIN_TARGET);
    expect(box.height, `${label}: «${name}» высота`).toBeGreaterThanOrEqual(MIN_TARGET);
  }
}

async function visit(page: Page, path: string, errors: string[]) {
  const res = await page.goto(path);
  expect(res?.ok(), path).toBe(true);
  await page.waitForLoadState("networkidle");
  await expectFits(page, path);
  if (path !== "/about") await expectTapTargets(page, path); // «О проекте» — публичная страница, без оболочки
  expect(errors, `консоль на ${path}`).toEqual([]);
}

async function session(browser: Browser, who: "alina" | "denis" | "irina") {
  const ctx = await browser.newContext({ viewport: VIEWPORT, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = collectConsoleErrors(page);
  await signIn(page, who);
  return { ctx, page, errors };
}

const HOSTILE = `<b>жирный</b> 😀 ${"Ы".repeat(1983)}`;

test("подготовка: сообщение с тегами и словом на 2000 символов, отклонённое и закрытое обращения (готовое и «нужно уточнение» уже в демо-мире)", async ({ browser }) => {
  test.setTimeout(120_000);
  const alina = await session(browser, "alina");
  const { page } = alina;

  // обращение с «враждебным» текстом, 2000 символов подряд
  expect(HOSTILE.length).toBeGreaterThanOrEqual(2000);
  await page.goto("/dekanat/new?type=study_other");
  await page.getByLabel("Твой вопрос").fill(HOSTILE);
  await page.getByRole("button", { name: "Отправить" }).click();
  await page.waitForURL(/\/dekanat\/[0-9a-f-]{36}\?created=1$/);
  await expect(page.getByText("<b>жирный</b> 😀", { exact: false })).toBeVisible();
  await expect(page.locator("main b", { hasText: "жирный" })).toHaveCount(0);
  await expectFits(page, "карточка с враждебным текстом");

  // и сообщение в переписку — тем же текстом
  await page.getByLabel("Сообщение").fill(HOSTILE);
  await page.getByRole("button", { name: "Отправить" }).click();
  await expect(page.locator('[data-author="student"]').last()).toContainText("<b>жирный</b> 😀");
  await expect(page.locator("main b", { hasText: "жирный" })).toHaveCount(0);
  await expectFits(page, "переписка с враждебным текстом");
  expect(alina.errors).toEqual([]);

  // второе обращение — его Ирина отклонит
  await page.goto("/dekanat/new?type=cert_study");
  await page.getByLabel("Куда нужна справка").fill("Для отклонения в мобильном прогоне");
  await page.getByRole("button", { name: "Отправить" }).click();
  await page.waitForURL(/\/dekanat\/([0-9a-f-]{36})\?created=1$/);
  const toReject = /\/dekanat\/([0-9a-f-]{36})/.exec(page.url())![1];

  const irina = await session(browser, "irina");
  await irina.page.goto(`/staff/appeals/${toReject}`);
  const decision = irina.page.getByRole("region", { name: "Решение" });
  await decision.locator("summary", { hasText: "Отклонить" }).click();
  await decision.getByLabel("Причина отказа").fill("Справка об обучении уже выдана, забери в каб. 214.");
  await decision.getByRole("button", { name: "Отклонить обращение" }).click();
  await decision.getByRole("button", { name: "Да, отклонить" }).click();
  await expect(irina.page.getByText("Отклонено", { exact: true }).first()).toBeVisible();

  // третье обращение: Ирина берёт и отмечает готовым, Алина жмёт «Получил» — статус «Закрыто»
  await page.goto("/dekanat/new?type=cert_study");
  await page.getByLabel("Куда нужна справка").fill("Для закрытия в мобильном прогоне");
  await page.getByRole("button", { name: "Отправить" }).click();
  await page.waitForURL(/\/dekanat\/[0-9a-f-]{36}\?created=1$/);
  const toClose = /\/dekanat\/([0-9a-f-]{36})/.exec(page.url())![1];
  await irina.page.goto(`/staff/appeals/${toClose}`);
  await irina.page.getByRole("button", { name: "Взять в работу" }).click();
  await expect(irina.page.getByText("В работе", { exact: true }).first()).toBeVisible();
  const ready = irina.page.getByRole("region", { name: "Решение" });
  await ready.locator("summary", { hasText: "Готово" }).click();
  await ready.getByLabel("Где забрать").fill("каб. 214, корпус А");
  await ready.getByRole("button", { name: "Отметить готовой" }).click();
  await expect(irina.page.getByText(/^Забрать: каб. 214/)).toBeVisible();
  await page.goto(`/dekanat/${toClose}`);
  await page.getByRole("button", { name: "Получил" }).click();
  await expect(page.getByText("Закрыто", { exact: true }).first()).toBeVisible();

  for (const s of [alina, irina]) await s.ctx.close();
});

type Row = { id: string; status: string; login: string | null };
async function allAppeals(): Promise<Row[]> {
  return readRows<Row>(async (sql) => sql`
    select a.id, a.status::text as status, u.login
      from appeals a join students s on s.id = a.student_id join users u on u.id = s.user_id
     order by a.created_at`);
}

test("студент: все экраны и по карточке на каждый статус — без прокрутки вбок, цели не меньше 44 px", async ({ browser }) => {
  test.setTimeout(180_000);
  const rows = await allAppeals();
  const statuses = new Set(rows.filter((r) => r.login).map((r) => r.status));
  expect([...statuses].sort(), "у студентов есть обращения во всех статусах").toEqual(
    ["closed", "in_progress", "needs_info", "ready", "rejected", "submitted"].sort(),
  );

  const common = [
    "/", "/schedule", "/schedule?view=week", "/study", "/study?tab=session", "/study?tab=history",
    "/dekanat", "/dekanat?filter=done", "/dekanat?q=справка", "/dekanat?q=абракадабра",
    "/dekanat/new", "/dekanat/new?topic=study", "/dekanat/new?type=cert_military",
    "/dekanat/new?type=stip_increased&prefill=1",
    "/notifications", "/notifications?tab=announcements", "/profile", "/about",
    "/profile/stress", "/profile/language", "/profile/notifications",
  ];
  const alina = await session(browser, "alina");
  for (const path of common) await visit(alina.page, path, alina.errors);
  const denis = await session(browser, "denis");
  for (const path of ["/", "/study", "/dekanat"]) await visit(denis.page, path, denis.errors);

  // карточка каждого обращения — под её владельцем; статусы покрыты все
  const covered = new Set<string>();
  for (const r of rows.filter((x) => x.login)) {
    const s = r.login === "alina.mironova" ? alina : denis;
    await visit(s.page, `/dekanat/${r.id}`, s.errors);
    covered.add(r.status);
  }
  expect([...covered].sort()).toEqual([...statuses].sort());
  await alina.ctx.close();
  await denis.ctx.close();
});

test("сотрудник: очередь, вкладки, объявления, профиль и карточки в каждом статусе — без прокрутки вбок", async ({ browser }) => {
  test.setTimeout(180_000);
  const irina = await session(browser, "irina");
  const tabs = ["/staff", "/staff?tab=in_progress", "/staff?tab=waiting", "/staff?tab=closed"];
  for (const path of [...tabs, "/staff/announcements", "/staff/profile", "/staff/profile/stress", "/about"]) {
    await visit(irina.page, path, irina.errors);
  }

  // карточки в разных статусах: все видимые Ирине
  const rows = await allAppeals();
  const covered = new Set<string>();
  for (const r of rows) {
    const res = await irina.page.goto(`/staff/appeals/${r.id}`);
    if (!res?.ok()) continue; // чужой отдел: «не найдено», в статусах не считаем
    await irina.page.waitForLoadState("networkidle");
    await expectFits(irina.page, `/staff/appeals/${r.id} (${r.status})`);
    await expectTapTargets(irina.page, `/staff/appeals/${r.id}`);
    covered.add(r.status);
  }
  expect(covered.size, `статусы карточек сотрудника: ${[...covered]}`).toBeGreaterThanOrEqual(4);
  expect(irina.errors).toEqual([]);
  await irina.ctx.close();
});
