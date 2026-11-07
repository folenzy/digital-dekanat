import { describe, expect, it } from "vitest";
import { clientIp } from "@/server/auth/rate-limit";

const h = (init: Record<string, string>) => new Headers(init);

describe("clientIp", () => {
  it("берёт первый адрес из x-forwarded-for", () => {
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.5, 10.0.0.1, 10.0.0.2" }))).toBe("203.0.113.5");
    expect(clientIp(h({ "x-forwarded-for": " 2001:db8::1 ", "x-real-ip": "198.51.100.7" }))).toBe("2001:db8::1");
  });

  it("без x-forwarded-for — x-real-ip, без обоих — 'unknown'", () => {
    expect(clientIp(h({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIp(h({}))).toBe("unknown");
  });

  it("мусор вместо адреса не попадает в ключ лимита", () => {
    expect(clientIp(h({ "x-forwarded-for": "<script>, 10.0.0.1", "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIp(h({ "x-forwarded-for": "x".repeat(5000) }))).toBe("unknown");
    expect(clientIp(h({ "x-real-ip": "not-an-ip" }))).toBe("unknown");
  });
});
