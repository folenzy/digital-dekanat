import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/internal/demo-reset/route";
import { closeTestDb, testSql, truncateAll } from "../helpers/db";

const url = "http://localhost/api/internal/demo-reset";
const req = (token?: string) =>
  new Request(url, { method: "POST", headers: token ? { "x-reset-token": token } : {} });

describe("POST /api/internal/demo-reset", () => {
  beforeAll(() => {
    process.env.DEMO_RESET_TOKEN = "test-reset-token-0123456789";
    process.env.DEMO_PASSWORD_ALINA = "Test-Alina-pass-1";
    process.env.DEMO_PASSWORD_DENIS = "Test-Denis-pass-1";
    process.env.DEMO_PASSWORD_IRINA = "Test-Irina-pass-1";
  });
  beforeEach(truncateAll);
  afterAll(closeTestDb);

  it("без токена и с неверным токеном — 404, мир не тронут", async () => {
    expect((await POST(req())).status).toBe(404);
    expect((await POST(req("wrong-token"))).status).toBe(404);
    expect((await POST(req("test-reset-token-0123456789-longer"))).status).toBe(404);
    expect(await testSql`select 1 from users`).toHaveLength(0);
  });

  it("если токен не задан в окружении — 404 даже при пустом заголовке", async () => {
    const saved = process.env.DEMO_RESET_TOKEN;
    delete process.env.DEMO_RESET_TOKEN;
    try {
      expect((await POST(req("anything"))).status).toBe(404);
      expect((await POST(req(""))).status).toBe(404);
    } finally {
      process.env.DEMO_RESET_TOKEN = saved;
    }
  });

  it("с верным токеном — 200 и пересобранный мир", async () => {
    const res = await POST(req("test-reset-token-0123456789"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const users = await testSql`select 1 from users where login is not null`;
    expect(users).toHaveLength(3);
    expect(await testSql`select 1 from kb_articles`).toHaveLength(25);
  });
});
