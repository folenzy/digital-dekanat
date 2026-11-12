import { describe, expect, it } from "vitest";
import { dragOffset, isSwipeBlockedTarget, shouldCommit, swipeNeighbors } from "@/ui/swipe";

const HREFS = ["/", "/schedule", "/study", "/dekanat", "/profile"];

describe("swipeNeighbors — куда ведёт свайп", () => {
  it("в середине есть оба соседа", () => {
    expect(swipeNeighbors("/study", HREFS)).toEqual({ prev: "/schedule", next: "/dekanat" });
  });

  it("на первом разделе нет соседа слева, на последнем — справа", () => {
    expect(swipeNeighbors("/", HREFS)).toEqual({ prev: null, next: "/schedule" });
    expect(swipeNeighbors("/profile", HREFS)).toEqual({ prev: "/dekanat", next: null });
  });

  it("на вложенных страницах свайп выключен: там формы и карточки, уводить с них нельзя", () => {
    expect(swipeNeighbors("/dekanat/new", HREFS)).toBeNull();
    expect(swipeNeighbors("/dekanat/0b7c1c1e-0000-4000-8000-000000000000", HREFS)).toBeNull();
    expect(swipeNeighbors("/notifications", HREFS)).toBeNull();
    expect(swipeNeighbors(null, HREFS)).toBeNull();
  });

  it("у сотрудника «/staff» и «/staff/announcements» — разные разделы, а карточка обращения — вложенная", () => {
    const staff = ["/staff", "/staff/announcements", "/staff/profile"];
    expect(swipeNeighbors("/staff", staff)).toEqual({ prev: null, next: "/staff/announcements" });
    expect(swipeNeighbors("/staff/announcements", staff)).toEqual({ prev: "/staff", next: "/staff/profile" });
    expect(swipeNeighbors("/staff/appeals/abc", staff)).toBeNull();
  });
});

describe("dragOffset — лист идёт за пальцем", () => {
  it("есть сосед — один к одному", () => {
    expect(dragOffset(-80, true)).toBe(-80);
    expect(dragOffset(64, true)).toBe(64);
  });

  it("соседа нет — сопротивление: чем дальше тянешь, тем меньше сдвиг, но не стена", () => {
    const a = dragOffset(100, false);
    const b = dragOffset(200, false);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(40);
    expect(b).toBeGreaterThan(a);
    expect(b - a).toBeLessThan(a); // второй отрезок даёт меньше, чем первый
    expect(dragOffset(-100, false)).toBe(-a);
  });
});

describe("shouldCommit — отпустили палец", () => {
  const width = 360;

  it("дотянули дальше порога — переходим", () => {
    expect(shouldCommit({ dx: -120, dt: 600, width })).toBe(true);
    expect(shouldCommit({ dx: 130, dt: 900, width })).toBe(true);
  });

  it("короткий медленный сдвиг — возвращаемся", () => {
    expect(shouldCommit({ dx: -60, dt: 500, width })).toBe(false);
  });

  it("быстрый смахивающий жест срабатывает и на коротком расстоянии", () => {
    expect(shouldCommit({ dx: -50, dt: 90, width })).toBe(true);
  });

  it("случайное подёргивание не считается: слишком коротко даже при высокой скорости", () => {
    expect(shouldCommit({ dx: -20, dt: 20, width })).toBe(false);
  });

  it("порог не растёт бесконечно на широком экране", () => {
    expect(shouldCommit({ dx: -115, dt: 800, width: 900 })).toBe(true);
  });
});

describe("isSwipeBlockedTarget — где жест не начинаем", () => {
  const el = (tag: string, attrs: Record<string, string> = {}, parent: unknown = null, scroll?: [number, number]) => ({
    tagName: tag.toUpperCase(),
    parentElement: parent,
    isContentEditable: false,
    scrollWidth: scroll?.[0] ?? 0,
    clientWidth: scroll?.[1] ?? 0,
    hasAttribute: (n: string) => n in attrs,
  });
  const root = el("div");

  it("поля ввода и выпадающие списки: там палец двигает курсор и выделяет текст", () => {
    expect(isSwipeBlockedTarget(el("textarea", {}, root) as never, root as never)).toBe(true);
    expect(isSwipeBlockedTarget(el("input", {}, root) as never, root as never)).toBe(true);
    expect(isSwipeBlockedTarget(el("select", {}, root) as never, root as never)).toBe(true);
  });

  it("то, что само листается вбок (полоса дней, длинная таблица)", () => {
    const strip = el("div", {}, root, [900, 320]);
    expect(isSwipeBlockedTarget(el("a", {}, strip) as never, root as never)).toBe(true);
  });

  it("явный запрет data-no-swipe", () => {
    const zone = el("div", { "data-no-swipe": "" }, root);
    expect(isSwipeBlockedTarget(el("span", {}, zone) as never, root as never)).toBe(true);
  });

  it("обычный текст и карточки — можно", () => {
    const card = el("article", {}, root, [320, 320]);
    expect(isSwipeBlockedTarget(el("p", {}, card) as never, root as never)).toBe(false);
  });
});
