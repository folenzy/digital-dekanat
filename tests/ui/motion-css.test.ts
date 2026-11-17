import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Движение живёт в CSS и не исполняется в тестах: закрепляем текст правил (как deploy-config.test.ts для конфигов).
const css = (f: string) => readFileSync(join(__dirname, "..", "..", "src", "ui", f), "utf8");
const tokens = css("tokens.css");
const lesson = css("student/LessonCard.module.css");
const subject = css("student/SubjectCard.module.css");

// Длительности (мс) из объявлений transition/animation; var(--dur*) раскрываем по tokens.css
function durations(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/^\s*(?:transition|animation):\s*([^;]+);/gm)) {
    for (const d of m[1].matchAll(/var\((--dur[\w-]*)\)|(\d+)ms/g)) {
      if (d[2]) out.push(Number(d[2]));
      else out.push(Number(new RegExp(`${d[1]}:\\s*(\\d+)ms`).exec(tokens)?.[1]));
    }
  }
  return out;
}

const reduced = (text: string) => /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*\}/.exec(text)?.[0] ?? "";

describe("раскрытие пары (LessonCard.module.css)", () => {
  it("раскрытая часть плавно меняет высоту и прозрачность", () => {
    const rule = /\.lesson::details-content\s*\{([^}]*)\}/.exec(lesson)?.[1] ?? "";
    expect(rule).toMatch(/transition:[^;]*block-size/);
    expect(rule).toMatch(/transition:[^;]*opacity/);
    expect(rule).toMatch(/allow-discrete/);
    expect(lesson).toMatch(/interpolate-size:\s*allow-keywords/);
  });

  it("при prefers-reduced-motion переход выключен", () => {
    expect(reduced(lesson)).toMatch(/::details-content[\s\S]*transition:\s*none/);
  });

  it("длительности 150–250 мс", () => {
    const ds = durations(lesson);
    expect(ds.length).toBeGreaterThan(0);
    expect(Math.min(...ds)).toBeGreaterThanOrEqual(150);
    expect(Math.max(...ds)).toBeLessThanOrEqual(250);
  });
});

describe("полоса баллов (SubjectCard.module.css)", () => {
  it("заливка растёт от нуля через scaleX слева", () => {
    const fill = /\.barFill\s*\{([^}]*)\}/.exec(subject)?.[1] ?? "";
    expect(fill).toMatch(/animation:[^;]*bar-fill/);
    expect(fill).toMatch(/transform-origin:\s*left/);
    expect(subject).toMatch(/@keyframes bar-fill\s*\{\s*from\s*\{\s*transform:\s*scaleX\(0\)/);
  });

  it("при prefers-reduced-motion анимация выключена", () => {
    expect(reduced(subject)).toMatch(/\.barFill\s*\{\s*animation:\s*none/);
  });

  it("длительности 150–250 мс", () => {
    const ds = durations(subject);
    expect(ds.length).toBeGreaterThan(0);
    expect(Math.min(...ds)).toBeGreaterThanOrEqual(150);
    expect(Math.max(...ds)).toBeLessThanOrEqual(250);
  });
});
