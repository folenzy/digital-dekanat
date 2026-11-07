// Локальный запуск прод-сборки так же, как в Docker: node .next/standalone/server.js.
// `next start` с output: "standalone" предупреждает, что так не работает, а server.js сам не раздаёт
// .next/static и public — копируем их рядом (node_modules/next/dist/docs/.../next-config-js/output.md).
// Использование: node scripts/start-standalone.mjs [порт]  (по умолчанию PORT или 3100).
import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, ".next", "standalone");

if (!existsSync(path.join(out, "server.js"))) {
  console.error("Нет .next/standalone/server.js — сначала npm run build");
  process.exit(1);
}
cpSync(path.join(root, ".next", "static"), path.join(out, ".next", "static"), { recursive: true });
if (existsSync(path.join(root, "public"))) {
  cpSync(path.join(root, "public"), path.join(out, "public"), { recursive: true });
}

const port = process.argv[2] ?? process.env.PORT ?? "3100";
// Только локальный IPv4-loopback. HOSTNAME из окружения не берём: в Linux/Docker там имя машины,
// а "localhost" Node может разрешить только в ::1, и IPv4-клиенты не достучатся.
const server = spawn(process.execPath, [path.join(out, "server.js")], {
  stdio: "inherit",
  env: { ...process.env, PORT: port, HOSTNAME: "127.0.0.1" },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("exit", (code) => process.exit(code ?? 0));
