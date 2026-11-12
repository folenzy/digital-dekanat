import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, isTheme, parseTheme, THEME_COLOR, THEMES, themeLabel } from "@/lib/theme";

// Тема оформления: значение приходит из cookie и из формы — то есть от клиента. Всё незнакомое = светлая.

describe("parseTheme", () => {
  it("знает две темы", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
  });

  it.each([undefined, null, "", "DARK", "dark ", "blue", "\"><script>", 1, {}, ["dark"]])(
    "незнакомое значение %j — светлая тема",
    (value) => {
      expect(parseTheme(value)).toBe("light");
    },
  );

  it("по умолчанию — светлая: то, что было до появления выбора", () => {
    expect(DEFAULT_THEME).toBe("light");
  });
});

describe("isTheme", () => {
  it("пропускает только точные коды тем", () => {
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
    for (const bad of ["", "Dark", "auto", null, undefined, 0]) expect(isTheme(bad)).toBe(false);
  });
});

describe("подписи и цвета", () => {
  it("у каждой темы есть подпись и пояснение", () => {
    expect(THEMES.map((t) => t.code)).toEqual(["light", "dark"]);
    expect(themeLabel("light")).toBe("Светлая");
    expect(themeLabel("dark")).toBe("Тёмная");
    for (const t of THEMES) expect(t.hint.length).toBeGreaterThan(10);
  });

  it("цвет панели браузера совпадает с --bg темы в tokens.css", () => {
    const css = readFileSync(path.resolve(__dirname, "../src/ui/tokens.css"), "utf8");
    const bgOf = (block: string) => /--bg:\s*(#[0-9A-Fa-f]{6})/.exec(block)![1].toUpperCase();
    const dark = css.slice(css.indexOf('[data-theme="dark"] {'));
    expect(THEME_COLOR.light.toUpperCase()).toBe(bgOf(css));
    expect(THEME_COLOR.dark.toUpperCase()).toBe(bgOf(dark));
  });
});
