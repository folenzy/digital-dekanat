import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

// Манифест приложения («На связи» на экране «Домой») и файлы иконок.
// Размеры PNG читаем из заголовка IHDR (байты 16–19 — ширина, 20–23 — высота, big-endian), без sharp.

const ROOT = process.cwd();

function pngSize(file: string): string {
  const buf = readFileSync(file);
  return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
}

describe("manifest", () => {
  const m = manifest();

  it("название, режим и цвета", () => {
    expect(m.name).toBe("На связи — цифровой деканат");
    expect(m.short_name).toBe("На связи");
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect(m.background_color).toBe("#FFFFFF");
    expect(m.theme_color).toBe("#FFFFFF");
  });

  it("иконки 192, 512 и maskable 512", () => {
    expect(m.icons).toEqual(
      expect.arrayContaining([
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ]),
    );
  });

  it("файлы иконок лежат в public/ и совпадают по размеру с manifest", () => {
    for (const icon of m.icons ?? []) {
      const file = join(ROOT, "public", icon.src);
      expect(existsSync(file), icon.src).toBe(true);
      expect(pngSize(file), icon.src).toBe(icon.sizes);
    }
  });

  it("apple-icon.png — 180×180", () => {
    expect(pngSize(join(ROOT, "src/app/apple-icon.png"))).toBe("180x180");
  });

  it("icon.svg — синий фон, без прежнего терракотового", () => {
    const svg = readFileSync(join(ROOT, "src/app/icon.svg"), "utf8");
    expect(svg).not.toContain("#B4552D");
    expect(svg).toContain("#1E6FD9");
  });
});
