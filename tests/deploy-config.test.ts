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

// Несколько копий приложения (loadtest/README.md): число копий и подключения базы задаются в deploy/.env,
// Caddy сам находит все копии. Без этих свойств `--scale` молча работал бы на одной копии.
describe("deploy: несколько копий приложения", () => {
  const block = (text: string, head: RegExp) => {
    const start = text.search(head);
    if (start < 0) return "";
    let depth = 0;
    for (let i = text.indexOf("{", start); i < text.length; i++) {
      if (text[i] === "{") depth++;
      if (text[i] === "}" && --depth === 0) return text.slice(start, i + 1);
    }
    return "";
  };
  const service = (compose: string, name: string) => {
    const m = compose.match(new RegExp(`^  ${name}:\\n((?:    .*\\n|\\s*\\n)+)`, "m"));
    return m ? m[1] : "";
  };

  it("Caddy раздаёт запросы всем копиям app, а не одному адресу", () => {
    const proxy = block(code(read("Caddyfile")), /^\s*reverse_proxy\b/m);
    expect(proxy).toMatch(/^\s*dynamic a app 3000\s*\{/m);
    expect(proxy).toMatch(/^\s*lb_try_duration \d+s\s*$/m);
    expect(proxy).toMatch(/^\s*flush_interval -1\s*$/m); // SSE без буферизации — как раньше
    expect(code(read("Caddyfile"))).not.toMatch(/reverse_proxy\s+app:3000/);
  });

  it("число копий app задаётся APP_REPLICAS, по умолчанию одна", () => {
    const app = service(code(read("docker-compose.yml")), "app");
    expect(app).toMatch(/^    scale: \$\{APP_REPLICAS:-1\}\s*$/m);
    expect(app).not.toMatch(/container_name|^    ports:/m); // иначе вторая копия не создастся
  });

  it("max_connections PostgreSQL задаётся PG_MAX_CONNECTIONS, по умолчанию прежние 30", () => {
    const db = service(code(read("docker-compose.yml")), "db");
    expect(db).toMatch(/"max_connections=\$\{PG_MAX_CONNECTIONS:-30\}"/);
  });

  it("образец .env объясняет обе настройки", () => {
    const env = read(".env.example");
    expect(env).toMatch(/^# ?APP_REPLICAS=1\s*$/m);
    expect(env).toMatch(/^# ?PG_MAX_CONNECTIONS=30\s*$/m);
  });
});

describe("deploy/Caddyfile: сжатие и SSE", () => {
  it("поток /api/events исключён из encode (иначе gzip может буферизовать события)", () => {
    const c = code(read("Caddyfile"));
    expect(c).toMatch(/^\s*@compress not path \/api\/events\*\s*$/m);
    expect(c).toMatch(/^\s*encode @compress zstd gzip\s*$/m);
    expect(c).not.toMatch(/^\s*encode zstd gzip\s*$/m);
  });
});
