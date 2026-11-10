import { afterEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "@/server/auth/cookie";

describe("SESSION_COOKIE", () => {
  const saved = process.env.COOKIE_SECURE;
  afterEach(() => {
    if (saved === undefined) delete process.env.COOKIE_SECURE;
    else process.env.COOKIE_SECURE = saved;
  });
  const expires = new Date("2026-11-17T09:00:00Z");

  it("в проде (COOKIE_SECURE=true): __Host-ns_session, Secure", () => {
    process.env.COOKIE_SECURE = "true";
    expect(SESSION_COOKIE.name).toBe("__Host-ns_session");
    expect(SESSION_COOKIE.options(expires)).toEqual({
      httpOnly: true, sameSite: "lax", path: "/", secure: true, expires,
    });
  });

  it("локально по http: ns_session без Secure", () => {
    for (const value of [undefined, "false", "", "1", "TRUE"]) {
      if (value === undefined) delete process.env.COOKIE_SECURE;
      else process.env.COOKIE_SECURE = value;
      expect(SESSION_COOKIE.name).toBe("ns_session");
      expect(SESSION_COOKIE.options(expires)).toEqual({
        httpOnly: true, sameSite: "lax", path: "/", secure: false, expires,
      });
    }
  });
});
