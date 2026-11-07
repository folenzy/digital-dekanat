import { loadEnvFile } from "node:process";

try {
  loadEnvFile(".env");
} catch {
  // .env может отсутствовать: тогда берём значения из окружения
}

async function main() {
  const { resetDemo } = await import("../src/server/demo/world");
  await resetDemo();
  console.log("Демо-мир пересобран");
  process.exit(0); // закрываем пул соединений
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
