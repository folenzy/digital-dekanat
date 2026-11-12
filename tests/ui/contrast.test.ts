import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Доказательство «доступного» интерфейса: контраст пар «текст/фон» по WCAG 2.x,
// цвета читаются прямо из src/ui/tokens.css, а не дублируются в тесте.

const css = readFileSync(path.resolve(import.meta.dirname, "../../src/ui/tokens.css"), "utf8");

function readTokens(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of src.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2].toUpperCase();
  return out;
}

// Светлая тема — блок :root; тёмная — блок [data-theme="dark"] поверх светлой (в нём только отличия).
const darkAt = css.indexOf('[data-theme="dark"] {');
const t = readTokens(css.slice(0, darkAt));
const dark = { ...t, ...readTokens(css.slice(darkAt)) };

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [текст или элемент, фон, минимум, где используется]
type Pair = [fg: string, bg: string, min: number, use: string];
const TEXT = 4.5;
const NON_TEXT = 3; // WCAG 1.4.11: кольцо фокуса, границы полей ввода

const PAIRS: Pair[] = [
  ["ink", "bg", TEXT, "основной текст на фоне страницы"],
  ["ink", "paper", TEXT, "основной текст в карточке"],
  ["muted", "paper", TEXT, "вторичный текст в карточке, подписи нижней навигации"],
  ["muted-strong", "bg", TEXT, "вторичный текст на фоне страницы (дата, подзаголовок)"],
  ["muted-strong", "paper", TEXT, "вторичный текст в карточке (запасной)"],
  ["paper", "ink", TEXT, "текст в тёмной карточке «важное», тост"],
  ["bg", "ink", TEXT, "пометка «Концепт для конкурса»"],
  ["ink-muted", "ink", TEXT, "вторичный текст в тёмной карточке"],
  ["accent", "paper", TEXT, "надзаголовок и ссылка в карточке"],
  ["accent-strong", "bg", TEXT, "ссылка на фоне страницы"],
  ["accent-strong", "paper", TEXT, "ссылка в карточке (запасной)"],
  ["paper", "accent", TEXT, "основная кнопка, счётчик на колокольчике"],
  ["accent-2", "ink", TEXT, "надзаголовок и ссылка в тёмной карточке"],
  ["ink", "accent-2", TEXT, "основная кнопка в тёмной карточке"],
  ["ok", "ok-tint", TEXT, "бейдж «Готово»"],
  ["warn", "warn-tint", TEXT, "бейдж «Нужно уточнение»"],
  ["danger", "danger-tint", TEXT, "бейдж «Отклонено»"],
  ["info", "info-tint", TEXT, "бейдж «Отправлено»"],
  ["accent-strong", "accent-tint", TEXT, "бейдж «В работе»"],
  ["muted-strong", "neutral-tint", TEXT, "бейдж «Закрыто»"],
  ["ok", "paper", TEXT, "статусный текст без подложки"],
  ["warn", "paper", TEXT, "статусный текст без подложки"],
  ["danger", "paper", TEXT, "«Просрочено» в карточке"],
  ["danger", "bg", TEXT, "ошибка на фоне страницы"],
  ["info", "paper", TEXT, "статусный текст без подложки"],
  ["on-type", "lesson-lecture", TEXT, "плашка «ЛК» в карточке пары"],
  ["on-type", "lesson-practice", TEXT, "плашка «ПР» в карточке пары"],
  ["on-type", "lesson-lab", TEXT, "плашка «ЛБ» в карточке пары"],
  ["dot-lecture", "paper", NON_TEXT, "точка лекции под днём недели"],
  ["dot-practice", "paper", NON_TEXT, "точка практики под днём недели"],
  ["dot-lab", "paper", NON_TEXT, "точка лабораторной под днём недели"],
  ["dot-lecture-inv", "ink", NON_TEXT, "точка лекции на выбранном дне"],
  ["dot-practice-inv", "ink", NON_TEXT, "точка практики на выбранном дне"],
  ["dot-lab-inv", "ink", NON_TEXT, "точка лабораторной на выбранном дне"],
  ["muted-strong", "paper", TEXT, "номер пары и подсказки на подкрашенной подложке"],
  ["focus", "bg", NON_TEXT, "кольцо фокуса на фоне страницы"],
  ["focus", "paper", NON_TEXT, "кольцо фокуса в карточке"],
  ["accent-2", "ink", NON_TEXT, "кольцо фокуса в тёмной карточке"],
  ["line-strong", "paper", NON_TEXT, "граница поля ввода в карточке"],
  ["line-strong", "bg", NON_TEXT, "граница поля ввода на фоне страницы"],
];

describe("палитра «Бумага»", () => {
  it("базовые токены совпадают со спекой §11", () => {
    expect(t).toMatchObject({
      bg: "#F4EFE6", paper: "#FFFDF8", line: "#E4DCCD", ink: "#1D1B17",
      muted: "#7A7166", accent: "#B4552D", "accent-2": "#E2774A",
    });
  });

  it.each(PAIRS)("%s на %s ≥ %d:1 (%s)", (fg, bg, min) => {
    expect(t[fg], `нет токена --${fg}`).toBeDefined();
    expect(t[bg], `нет токена --${bg}`).toBeDefined();
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(min);
  });

  it.each(PAIRS)("тёмная тема: %s на %s ≥ %d:1 (%s)", (fg, bg, min) => {
    expect(dark[fg], `нет токена --${fg}`).toBeDefined();
    expect(dark[bg], `нет токена --${bg}`).toBeDefined();
    expect(contrast(dark[fg], dark[bg])).toBeGreaterThanOrEqual(min);
  });

  it("тёмная тема задаёт свои значения всем цветам палитры, а не наследует светлые", () => {
    const palette = ["bg", "paper", "line", "ink", "muted", "accent", "accent-2", "muted-strong", "accent-strong",
      "ink-muted", "line-strong", "focus", "ok", "ok-tint", "warn", "warn-tint", "danger", "danger-tint",
      "info", "info-tint", "accent-tint", "neutral-tint"];
    for (const name of palette) expect(dark[name], `--${name} не переопределён в тёмной теме`).not.toBe(t[name]);
  });

  it("сверка формулы: чёрный на белом 21:1, белый на белом 1:1", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrast("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
  });

  it("таблица контраста для отчёта", () => {
    const rows = PAIRS.map(([fg, bg, min, use]) => `| --${fg} | --${bg} | ${contrast(t[fg], t[bg]).toFixed(2)} | ${min} | ${use} |`);
    if (process.env.PRINT_CONTRAST) console.log(rows.join("\n"));
    expect(rows).toHaveLength(PAIRS.length);
  });
});
