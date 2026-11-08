import { defineConfig, devices } from "@playwright/test";

// Пароли демо-аккаунтов и прочее — из .env (в тестах читаются из process.env, не печатаются).
try {
  process.loadEnvFile(".env");
} catch {
  // .env может отсутствовать: тогда значения берутся из окружения
}

const PORT = 3100;
// 127.0.0.1, а не localhost: сервер слушает только IPv4-loopback (scripts/start-standalone.mjs)
const ORIGIN = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  // Перед тестами — свежий демо-мир в той же БД, что у запущенного сервера (DATABASE_URL из .env)
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: ORIGIN, trace: "retain-on-failure" },
  projects: [
    {
      name: "mobile-360",
      use: { ...devices["Pixel 5"], viewport: { width: 360, height: 800 }, deviceScaleFactor: 2 },
    },
    { name: "desktop-1280", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    // output: "standalone" → запускаем server.js, как в Docker (см. scripts/start-standalone.mjs)
    command: `npm run build && node scripts/start-standalone.mjs ${PORT}`,
    url: ORIGIN,
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
