import { afterEach, describe, expect, it, vi } from "vitest";
import type { Page } from "@playwright/test";
import { screenshotsEnabled, shoot } from "../e2e/demo";

// e2e пишет скриншоты в docs/screenshots только по запросу (SCREENSHOTS=1), иначе каждый прогон
// перезаписывал бы ~100 PNG и засорял коммиты.

function fakePage() {
  return { evaluate: vi.fn(async () => undefined), screenshot: vi.fn(async () => Buffer.from("")) };
}

describe("скриншоты e2e", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("без SCREENSHOTS=1 ничего не пишется", async () => {
    vi.stubEnv("SCREENSHOTS", "");
    const page = fakePage();
    expect(screenshotsEnabled()).toBe(false);
    await shoot(page as unknown as Page, "today", 360);
    expect(page.screenshot).not.toHaveBeenCalled();
  });

  it("SCREENSHOTS=1 — снимок в docs/screenshots/<серия>-<экран>-<ширина>.png", async () => {
    vi.stubEnv("SCREENSHOTS", "1");
    const page = fakePage();
    expect(screenshotsEnabled()).toBe(true);
    await shoot(page as unknown as Page, "queue-new", 1280, "04");
    expect(page.screenshot).toHaveBeenCalledWith(expect.objectContaining({
      path: "docs/screenshots/04-queue-new-1280.png", fullPage: true,
    }));
  });
});
