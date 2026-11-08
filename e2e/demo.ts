import { execFileSync } from "node:child_process";
import path from "node:path";
import type { Page } from "@playwright/test";

// Общее для e2e: сброс демо-мира, вход демо-аккаунтом, проверки вёрстки.

const root = path.resolve(__dirname, "..");
const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");

/**
 * Миграции и пересборка демо-мира в БД из .env (ту же использует запущенный сервер).
 * Скрипты печатают только «Миграции применены» / «Демо-мир пересобран», секреты не выводятся.
 */
export function resetDemoWorld(): void {
  for (const script of ["scripts/migrate.ts", "scripts/demo-reset.ts"]) {
    execFileSync(process.execPath, [tsx, script], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });
  }
}

export const ACCOUNTS = {
  alina: { login: "alina.mironova", passwordEnv: "DEMO_PASSWORD_ALINA" },
  denis: { login: "denis.kravtsov", passwordEnv: "DEMO_PASSWORD_DENIS" },
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
  await page.waitForURL((url) => url.pathname === "/");
}

/** Нет горизонтальной прокрутки (ширина документа не больше окна). */
export async function hasNoHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}

/**
 * Скриншот всей страницы. Фиксированную нижнюю панель на время снимка делаем статичной,
 * иначе Chromium нарисует её посреди длинного снимка.
 */
export async function shoot(page: Page, name: string, width: number): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `docs/screenshots/02-${name}-${width}.png`,
    fullPage: true,
    style: 'nav[aria-label="Разделы"] { position: static !important; }',
  });
}
