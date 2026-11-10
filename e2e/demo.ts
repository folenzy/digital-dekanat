import { execFileSync } from "node:child_process";
import path from "node:path";
import type { Page } from "@playwright/test";
import { assertLocalDatabaseUrl } from "./local-db";

// Общее для e2e: сброс демо-мира, вход демо-аккаунтом, проверки вёрстки.

const root = path.resolve(__dirname, "..");
const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");

/** Адрес БД из окружения или .env — только локальный (иначе исключение без самого адреса в тексте). */
export function localDatabaseUrl(): string {
  if (!process.env.DATABASE_URL) {
    try {
      process.loadEnvFile(path.join(root, ".env"));
    } catch {
      // нет .env — проверка ниже не пропустит пустой адрес
    }
  }
  const url = process.env.DATABASE_URL;
  assertLocalDatabaseUrl(url);
  return url!;
}

/**
 * Миграции и пересборка демо-мира в БД из .env (ту же использует запущенный сервер).
 * Скрипты печатают только «Миграции применены» / «Демо-мир пересобран», секреты не выводятся.
 */
export function resetDemoWorld(): void {
  // Проверяем ровно тот адрес, который получат скрипты: loadEnvFile в них не перезаписывает переданный env.
  const url = localDatabaseUrl();
  for (const script of ["scripts/migrate.ts", "scripts/demo-reset.ts"]) {
    execFileSync(process.execPath, [tsx, "--conditions=react-server", script], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: url },
      stdio: ["ignore", "inherit", "inherit"],
    });
  }
}

export const ACCOUNTS = {
  alina: { login: "alina.mironova", passwordEnv: "DEMO_PASSWORD_ALINA" },
  denis: { login: "denis.kravtsov", passwordEnv: "DEMO_PASSWORD_DENIS" },
  irina: { login: "irina.belova", passwordEnv: "DEMO_PASSWORD_IRINA" },
} as const;

/** Пароль из окружения; в лог и отчёт не попадает. */
export function passwordOf(who: keyof typeof ACCOUNTS): string {
  const value = process.env[ACCOUNTS[who].passwordEnv];
  if (!value) throw new Error(`Не задан ${ACCOUNTS[who].passwordEnv} (.env)`);
  return value;
}

export async function signIn(page: Page, who: keyof typeof ACCOUNTS): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Логин").fill(ACCOUNTS[who].login);
  await page.getByLabel("Пароль", { exact: true }).fill(passwordOf(who));
  await page.getByRole("button", { name: "Войти" }).click();
  // студента вход ведёт на «Сегодня», сотрудника — в очередь
  const home = who === "irina" ? "/staff" : "/";
  await page.waitForURL((url) => url.pathname === home);
}

/** Нет горизонтальной прокрутки (ширина документа не больше окна). */
export async function hasNoHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}

/** Скриншоты пишутся только по запросу: SCREENSHOTS=1 npx playwright test (иначе каждый прогон перезаписывал бы ~100 PNG). */
export function screenshotsEnabled(): boolean {
  return process.env.SCREENSHOTS === "1";
}

/**
 * Скриншот всей страницы → docs/screenshots/<серия>-<экран>-<ширина>.png (серия: 02 — экраны студента,
 * 03 — деканат, 04 — кабинет сотрудника). Фиксированную нижнюю панель на время снимка делаем статичной,
 * иначе Chromium нарисует её посреди длинного снимка. Без SCREENSHOTS=1 ничего не делает.
 */
export async function shoot(page: Page, name: string, width: number, series = "02"): Promise<void> {
  if (!screenshotsEnabled()) return;
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `docs/screenshots/${series}-${name}-${width}.png`,
    fullPage: true,
    style: 'nav[aria-label="Разделы"] { position: static !important; }',
  });
}

/** Ошибки консоли браузера и необработанные исключения страницы: тест проверяет, что список пуст. */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`${msg.text()} @ ${msg.location().url}`);
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

/** Открытое подключение к потоку событий: после этого сервер точно доставит событие вкладке. */
export async function waitForEventStream(page: Page, open: () => Promise<unknown>): Promise<void> {
  const stream = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/events");
  await open();
  await stream;
}
