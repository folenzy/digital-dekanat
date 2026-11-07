import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "node:path";

export default defineConfig(({ mode }) => {
  // Подхватываем .env (в т.ч. DATABASE_URL_TEST) для тестового процесса.
  const env = loadEnv(mode, process.cwd(), "");
  process.env.DATABASE_URL_TEST ??= env.DATABASE_URL_TEST; // для globalSetup (основной процесс)
  return {
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
        // server-only в тестах — пустой модуль
        "server-only": path.resolve(import.meta.dirname, "tests/setup/empty.ts"),
      },
    },
    test: {
      include: ["tests/**/*.test.ts"],
      env: {
        DATABASE_URL_TEST: env.DATABASE_URL_TEST ?? "",
        // воркеры тестов ходят в тестовую БД через общий клиент приложения
        DATABASE_URL: env.DATABASE_URL_TEST ?? "",
      },
      globalSetup: ["tests/setup/global.ts"],
      fileParallelism: false,
      testTimeout: 15000,
    },
  };
});
