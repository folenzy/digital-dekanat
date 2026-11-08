import { expect, test } from "@playwright/test";
import { collectConsoleErrors, resetDemoWorld, signIn, waitForEventStream } from "./demo";

// Ночной сброс демо-мира при открытой вкладке: сессии пропали вместе с данными. Вкладка без действий
// пользователя доходит до «/login?reason=expired» с пояснением: поток событий сам шлёт session_end
// на очередном пинге (раз в 25 с, HEARTBEAT_MS в src/server/events-stream.ts), а не молчит и не показывает ошибку.

const EXPIRED = "Сессия завершилась — возможно, ночью обновились демо-данные. Войди снова";

test.beforeAll(() => resetDemoWorld());
// сброс сносит всё: вернуть мир в исходное состояние для остальных файлов
test.afterAll(() => resetDemoWorld());

test("сброс при открытой вкладке: сама приходит на вход с пояснением", async ({ page }) => {
  test.setTimeout(75_000);
  const errors = collectConsoleErrors(page);
  await signIn(page, "alina");
  await waitForEventStream(page, () => page.goto("/dekanat"));
  await expect(page.getByRole("heading", { name: "Мои обращения" })).toBeVisible();

  // как ночной планировщик: POST с токеном из окружения (значение нигде не выводится)
  const token = process.env.DEMO_RESET_TOKEN;
  if (!token) throw new Error("Не задан DEMO_RESET_TOKEN (.env)");
  const res = await page.request.post("/api/internal/demo-reset", { headers: { "x-reset-token": token } });
  expect(res.status()).toBe(200);

  // ничего не нажимаем: ждём пинг потока (до ~25 с)
  await page.waitForURL((url) => url.pathname === "/login" && url.searchParams.get("reason") === "expired", { timeout: 40_000 });
  await expect(page.getByText(EXPIRED)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Вход в кабинет");

  // и войти снова можно: демо-аккаунты пересозданы
  await signIn(page, "alina");
  // реплика закрытия потока при смене страницы не считается ошибкой приложения
  expect(errors.filter((e) => !/EventSource|\/api\/events/.test(e))).toEqual([]);
});

test("без токена сброс недоступен: 404 и сессия цела", async ({ page }) => {
  await signIn(page, "alina");
  const res = await page.request.post("/api/internal/demo-reset", { headers: { "x-reset-token": "wrong-token" } });
  expect(res.status()).toBe(404);
  await page.goto("/dekanat");
  await expect(page.getByRole("heading", { name: "Мои обращения" })).toBeVisible();
});
