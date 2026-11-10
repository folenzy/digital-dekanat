import { describe, expect, it } from "vitest";
import { assertLocalDatabaseUrl } from "../e2e/local-db";

// e2e пересобирает демо-мир (стирает данные), поэтому разрешён только для локальной БД.
describe("e2e: сброс демо-мира только в локальной БД", () => {
  it.each([
    "postgres://u:p@localhost:5432/nasvyazi",
    "postgres://u:p@127.0.0.1:5432/nasvyazi",
    "postgresql://u:p@[::1]:5432/nasvyazi",
    "postgres://u:p@db.localhost/nasvyazi",
    "postgres://u:p@LOCALHOST/nasvyazi",
  ])("можно: %s", (url) => {
    expect(() => assertLocalDatabaseUrl(url)).not.toThrow();
  });

  it.each([
    "postgres://u:secret@db.example.com:5432/prod",
    "postgres://u:secret@10.0.0.5/prod",
    "postgres://u:secret@localhost.evil.com/prod",
    "postgres://u:secret@127.0.0.1.nip.io/prod",
    "postgres://u:secret@/prod?host=/var/run/postgresql",
    "не адрес",
    "",
    undefined,
  ])("нельзя: %s", (url) => {
    expect(() => assertLocalDatabaseUrl(url)).toThrow(/только для локальной БД/);
  });

  it("в тексте ошибки нет ни адреса, ни пароля", () => {
    try {
      assertLocalDatabaseUrl("postgres://admin:topsecret@db.example.com/prod");
    } catch (e) {
      expect(String(e)).not.toContain("topsecret");
      expect(String(e)).not.toContain("db.example.com");
    }
  });
});
