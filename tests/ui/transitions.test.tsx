import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { navDirection } from "@/ui/student/schedule-params";

// Переходы живут в браузере (View Transitions) и не исполняются в тестах: проверяем направление
// и закрепляем текст обёрток и правил, как motion-css.test.ts.
const root = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");

describe("navDirection", () => {
  it("позже — вперёд, раньше — назад, то же самое — без направления", () => {
    expect(navDirection("2026-11-17", "2026-11-18")).toBe("nav-forward");
    expect(navDirection("2026-11-18", "2026-11-17")).toBe("nav-back");
    expect(navDirection("2026-11-17", "2026-11-17")).toBeNull();
    expect(navDirection("2026-11-30", "2026-12-01")).toBe("nav-forward");
  });
});

describe("обёртки переходов", () => {
  const wrapper = read("src", "ui", "PageTransition.tsx");
  it("ViewTransition: default=none, enter/exit по типам nav-forward, nav-back, section", () => {
    expect(wrapper).toContain("<ViewTransition");
    expect(wrapper).toMatch(/default="none"/);
    for (const t of ["nav-forward", "nav-back", "section"]) {
      expect(wrapper).toContain(`"${t}": "${t}"`);
    }
    expect(wrapper).toMatch(/enter=\{/);
    expect(wrapper).toMatch(/exit=\{/);
  });
  it.each([["src/app/(student)/template.tsx"], ["src/app/staff/template.tsx"]])("%s оборачивает содержимое", (f) => {
    expect(read(...f.split("/"))).toContain("<PageTransition>");
  });
  it("страница «Пары» оборачивает лист в PageTransition с ключом вида и даты", () => {
    expect(read("src", "app", "(student)", "schedule", "page.tsx")).toMatch(/<PageTransition key=\{`\$\{view\}:\$\{dateKey\}`\}>/);
  });
});

describe("ссылки", () => {
  it("NavLink несёт тип section", () => {
    expect(read("src", "ui", "NavLink.tsx")).toContain('transitionTypes={["section"]}');
  });
  it("расписание задаёт тип по navDirection", () => {
    expect(read("src", "app", "(student)", "schedule", "page.tsx")).toContain("navDirection(");
  });
  it("SwipePane: router.push без transitionTypes (палец уже сдвинул лист)", () => {
    const src = read("src", "ui", "SwipePane.tsx");
    expect(src).toMatch(/router\.push\(target\.href, \{ scroll: false \}\)/);
    expect(src).not.toContain("transitionTypes");
  });
});

describe("globals.css", () => {
  const css = read("src", "app", "globals.css");
  it("правила направлений и раздела", () => {
    for (const s of [".nav-forward", ".nav-back", ".section"]) {
      expect(css).toContain(`::view-transition-old(${s})`);
      expect(css).toContain(`::view-transition-new(${s})`);
    }
  });
  it("сдвиг 24–40 px, длительности ≤ 250 мс", () => {
    const offsets = [...css.matchAll(/--slide-offset:\s*(-?\d+)px/g)].map((m) => Math.abs(Number(m[1])));
    expect(offsets.length).toBeGreaterThan(0);
    for (const o of offsets) {
      expect(o).toBeGreaterThanOrEqual(24);
      expect(o).toBeLessThanOrEqual(40);
    }
    const vt = css.slice(css.indexOf("::view-transition-old(.nav-forward)"));
    const block = vt.slice(0, vt.indexOf("@media (prefers-reduced-motion"));
    for (const m of block.matchAll(/(\d+)ms/g)) expect(Number(m[1])).toBeLessThanOrEqual(250);
  });
  it("reduced-motion выключает ::view-transition-*", () => {
    const m = /@media \(prefers-reduced-motion: reduce\)\s*\{[^{}]*::view-transition-old\(\*\)[\s\S]*?\n\}/.exec(css)?.[0] ?? "";
    expect(m).toContain("::view-transition-new(*)");
    expect(m).toContain("::view-transition-group(*)");
    expect(m).toContain("animation: none");
  });
});
