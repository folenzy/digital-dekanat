import { describe, expect, it } from "vitest";
import { isSafeHref, parseLiveEvent, showsToast } from "@/ui/live/LiveEvents";

describe("клиентская проверка событий", () => {
  it("href только относительный на этом же сайте", () => {
    expect(isSafeHref("/dekanat/1")).toBe(true);
    const bad = ["//evil.com", "/\x5cevil.com", "https://evil.com", "javascript:alert(1)", "/\t/evil.com", "/\n/evil.com", "/\r/evil.com", " /x", "/x ", "/x\ny", "/\u0000x", "", undefined, 5];
    for (const h of bad) {
      expect(isSafeHref(h)).toBe(false);
    }
  });
  it("мусор и неизвестный type игнорируются, небезопасный href отбрасывается", () => {
    expect(parseLiveEvent("не json")).toBeNull();
    expect(parseLiveEvent("null")).toBeNull();
    expect(parseLiveEvent("[]")).toBeNull();
    expect(parseLiveEvent('{"type":"x"}')).toBeNull();
    expect(parseLiveEvent('{"type":"notification","title":"Привет","href":"//evil.com","extra":1}'))
      .toEqual({ type: "notification", title: "Привет" });
    expect(parseLiveEvent('{"type":"appeal_updated","href":"/dekanat/1","appealId":"a"}'))
      .toEqual({ type: "appeal_updated", href: "/dekanat/1", appealId: "a" });
  });
});

describe("тост по событию", () => {
  it("appeal_updated только обновляет экран — без общего «Новое уведомление»", () => {
    expect(showsToast({ type: "appeal_updated", appealId: "a" })).toBe(false);
    expect(showsToast({ type: "notification", title: "Привет" })).toBe(true);
    expect(showsToast({ type: "announcement", title: "Объявление" })).toBe(true);
  });
});
