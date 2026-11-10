import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Деплой-файлы не исполняются в тестах; здесь закреплены их свойства безопасности,
// чтобы правка конфигурации не вернула найденные на security review дыры.
const read = (f: string) => readFileSync(join(__dirname, "..", "deploy", f), "utf8");
const code = (text: string) => text.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");

describe("deploy/Caddyfile", () => {
  it("служебный префикс /api/internal закрыт целиком, включая путь без слэша", () => {
    expect(code(read("Caddyfile"))).toMatch(/^\s*respond \/api\/internal\* 404\s*$/m);
  });

  it("не доверяет X-Forwarded-For от клиента (trusted_proxies не задан)", () => {
    expect(code(read("Caddyfile"))).not.toMatch(/trusted_proxies/);
  });
});

describe("deploy/backup.sh", () => {
  it("дампы создаются только для владельца: umask 077 раньше pg_dump", () => {
    const sh = code(read("backup.sh"));
    const umask = sh.search(/^\s*umask 077\s*$/m);
    expect(umask).toBeGreaterThanOrEqual(0);
    expect(umask).toBeLessThan(sh.indexOf("pg_dump"));
  });
});

describe("deploy/demo-reset.sh", () => {
  it("trap не обращается к неназначенной переменной keeper (set -u)", () => {
    const sh = code(read("demo-reset.sh"));
    const init = sh.search(/^keeper=""?\s*$/m);
    expect(init).toBeGreaterThanOrEqual(0);
    expect(init).toBeLessThan(sh.indexOf("trap "));
  });
});
