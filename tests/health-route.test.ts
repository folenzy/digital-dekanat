import { afterEach, describe, expect, it, vi } from "vitest";

// Проверка живости для Docker и DEPLOY.md: только «да/нет», без подробностей об ошибке.
describe("GET /api/health", () => {
  afterEach(() => {
    vi.doUnmock("@/server/db/client");
    vi.resetModules();
  });

  it("БД отвечает на select 1 — 200 {ok:true}, без кеширования", async () => {
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true });
  });

  it("БД недоступна — 503 {ok:false}, текст ошибки наружу не попадает", async () => {
    vi.doMock("@/server/db/client", () => ({
      sql: () => Promise.reject(new Error("connect ECONNREFUSED db:5432 password=secret")),
    }));
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({ ok: false });
    expect(body).not.toContain("secret");
  });
});
