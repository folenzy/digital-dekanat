import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "mobile-360", use: { ...devices["Pixel 5"], viewport: { width: 360, height: 780 } } },
    { name: "desktop-1280", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    // output: "standalone" → запускаем server.js, как в Docker (см. scripts/start-standalone.mjs)
    command: `npm run build && node scripts/start-standalone.mjs ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
