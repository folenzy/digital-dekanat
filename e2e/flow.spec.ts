import { expect, test } from "@playwright/test";
import { collectConsoleErrors, resetDemoWorld, screenshotsEnabled, shoot, signIn, waitForEventStream } from "./demo";

// Главная история продукта целиком, в двух браузерах одновременно — она же сценарий демо-видео:
// Алина подаёт обращение → Ирина видит его в «Новых», берёт и отвечает → у Алины без перезагрузки
// появляется тост, открытая карточка показывает ответ →
// Ирина отмечает справку готовой → Алина видит «Готово».
// Скриншоты → docs/screenshots/05-realtime-toast-<ширина>.png, 05-queue-irina-<ширина>.png.

test.beforeAll(() => resetDemoWorld());
test.afterAll(() => resetDemoWorld());

const REALTIME_MS = 5_000; // «в реальном времени»: тост и счётчик не позже чем через 5 секунд
const BELL = /^Уведомления(: \d+ непрочитанн|, новых нет)/;

/** Число непрочитанных из подписи колокольчика. */
async function unreadOf(page: import("@playwright/test").Page): Promise<number> {
  const label = (await page.getByRole("link", { name: BELL }).getAttribute("aria-label"))!;
  return Number(/(\d+)/.exec(label)?.[1] ?? 0);
}

test("Алина → Ирина → Алина: обращение, взять, ответить, «готово» — без перезагрузки у студентки", async ({ page, browser }, testInfo) => {
  test.setTimeout(90_000);
  const width = page.viewportSize()!.width;
  const alina = page; // студентка — в основном контексте, на ширине проекта
  const alinaErrors = collectConsoleErrors(alina);

  // Ирина — в отдельном контексте (свои куки), всегда на десктопе
  const irinaCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const irina = await irinaCtx.newPage();
  const irinaErrors = collectConsoleErrors(irina);

  // 1. Алина подаёт обращение
  await signIn(alina, "alina");
  await alina.goto("/dekanat/new?type=cert_military");
  await alina.getByLabel("Куда нужна справка").fill("Военкомат для сквозного сценария");
  await alina.getByRole("button", { name: "Отправить" }).click();
  await alina.waitForURL(/\/dekanat\/[0-9a-f-]{36}\?created=1$/);
  const appealId = /\/dekanat\/([0-9a-f-]{36})/.exec(alina.url())![1];
  await expect(alina.getByRole("heading", { level: 1 })).toHaveText("Справка для военкомата");
  await expect(alina.getByText("Отправлено", { exact: true }).first()).toBeVisible();

  // карточка открыта, поток событий подключён; метка докажет, что документ не перезагружался
  await waitForEventStream(alina, () => alina.goto(`/dekanat/${appealId}`));
  await alina.evaluate(() => {
    (window as unknown as { __sameDocument: boolean }).__sameDocument = true;
  });
  const unreadBefore = await unreadOf(alina);

  // 2. Ирина видит обращение в «Новых» и берёт его в работу
  await signIn(irina, "irina");
  await irina.getByRole("navigation", { name: "Вкладки очереди" }).getByRole("link", { name: "Новые" }).click();
  const card = irina.getByRole("list", { name: "Обращения" }).locator(`a[href="/staff/appeals/${appealId}"]`);
  await expect(card).toBeVisible();
  await expect(card).toContainText("Справка для военкомата");
  await shoot(irina, "queue-irina", 1280, "05");
  await card.click();
  await irina.getByRole("button", { name: "Взять в работу" }).click();
  await expect(irina.getByText("В работе", { exact: true }).first()).toBeVisible();

  // у Алины: тост «принято в работу» и счётчик, статус в карточке обновился сам
  await expect(alina.getByRole("status").getByText(/принято в работу$/)).toBeVisible({ timeout: REALTIME_MS });
  await expect(alina.getByText("В работе", { exact: true }).first()).toBeVisible({ timeout: REALTIME_MS });
  // карточка открыта: уведомления о ней гасятся сразу, счётчик не растёт (а колокольчик уже получил событие)
  await expect.poll(() => unreadOf(alina), { timeout: REALTIME_MS }).toBe(unreadBefore);

  // 3. Ирина отвечает
  const answer = "Справка будет готова в течение двух дней, зайдите в каб. 214.";
  await irina.getByLabel("Ответ студенту").fill(answer);
  await irina.getByRole("button", { name: "Ответить" }).click();
  await expect(irina.locator('[data-author="staff"]').last()).toContainText(answer);

  // у Алины, без перезагрузки: тост не позже чем через 5 секунд, ответ в открытой карточке; открытая карточка сразу гасит своё уведомление
  await expect(alina.getByRole("status").getByText(/^Деканат ответил по обращению О-\d{4}-\d{6}$/))
    .toBeVisible({ timeout: REALTIME_MS });
  await expect.poll(() => unreadOf(alina), { timeout: REALTIME_MS }).toBe(unreadBefore);
  await expect(alina.locator('[data-author="staff"]').last()).toContainText(answer, { timeout: REALTIME_MS });
  // снимок окна, а не всей страницы: тост закреплён на экране и в длинном снимке оказался бы посреди карточки
  await alina.evaluate(() => window.scrollTo(0, 0));
  if (screenshotsEnabled()) await alina.screenshot({ path: `docs/screenshots/05-realtime-toast-${width}.png` });

  // 4. Ирина отмечает справку готовой
  const decision = irina.getByRole("region", { name: "Решение" });
  await decision.locator("summary", { hasText: "Готово" }).click();
  await decision.getByRole("button", { name: "Отметить готовой" }).click();
  await expect(irina.getByText("Готово", { exact: true }).first()).toBeVisible();

  // у Алины: «Готово» и место выдачи — тоже в том же документе
  await expect(alina.getByText("Готово", { exact: true }).first()).toBeVisible({ timeout: REALTIME_MS });
  await expect(alina.getByText(/^Забрать: каб\. 214, корпус А, до /)).toBeVisible({ timeout: REALTIME_MS });
  expect(await alina.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument)).toBe(true);

  await irinaCtx.close();
  expect(alinaErrors, `консоль Алины (${testInfo.project.name})`).toEqual([]);
  expect(irinaErrors, "консоль Ирины").toEqual([]);
});
