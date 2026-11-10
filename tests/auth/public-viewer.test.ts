import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSessionUser } from "@/server/auth/session";
import { getViewerForPublicPage } from "@/server/auth/viewer";

// Публичные страницы (404, «О проекте») узнают viewer только ради ссылки «на главную»:
// сбой БД или сессии не должен ронять саму страницу. Путь с настоящей cookie проверяет e2e.

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ getSessionUser: vi.fn() }));

const withCookie = (value: string | undefined) =>
  vi.mocked(cookies).mockResolvedValue({
    get: () => (value === undefined ? undefined : { name: "ns_session", value }),
  } as unknown as Awaited<ReturnType<typeof cookies>>);

describe("getViewerForPublicPage", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.resetAllMocks();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  it("без cookie — null, сессию не ищет", async () => {
    withCookie(undefined);
    expect(await getViewerForPublicPage()).toBeNull();
    expect(getSessionUser).not.toHaveBeenCalled();
  });

  it("сессии нет (истекла, сброс демо) — null", async () => {
    withCookie("stale-token");
    vi.mocked(getSessionUser).mockResolvedValue(null);
    expect(await getViewerForPublicPage()).toBeNull();
  });

  it("БД недоступна — null вместо ошибки", async () => {
    withCookie("token");
    vi.mocked(getSessionUser).mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:5432"));
    expect(await getViewerForPublicPage()).toBeNull();
    // сбой не проглатывается молча: в логе сервера видна причина (без токена из cookie)
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0].join(" "))).toContain("ECONNREFUSED");
    expect(String(errorSpy.mock.calls[0].join(" "))).not.toContain("token");
  });

  it("служебные ошибки Next (здесь redirect) не глотает — их обрабатывает сам Next", async () => {
    withCookie("token");
    vi.mocked(getSessionUser).mockImplementation(async () => redirect("/login"));
    await expect(getViewerForPublicPage()).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_REDIRECT/) });
  });
});
