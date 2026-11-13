import { describe, expect, it } from "vitest";
import { scheduleNeighbors } from "@/ui/student/schedule-params";

// Куда ведёт свайп на странице «Пары»: в виде «День» — соседний учебный день, в виде «Неделя» — соседняя неделя.
// 12 ноября 2026 — четверг.

const TODAY = "2026-11-12";

describe("scheduleNeighbors — вид «День»", () => {
  it("в середине недели — вчера и завтра", () => {
    expect(scheduleNeighbors("day", "2026-11-12", TODAY)).toEqual({
      prev: { href: "/schedule?view=day&date=2026-11-11", label: "Ср, 11 ноября" },
      next: { href: "/schedule?view=day&date=2026-11-13", label: "Пт, 13 ноября" },
    });
  });

  it("после субботы — понедельник следующей недели: воскресенье не учебный день", () => {
    const n = scheduleNeighbors("day", "2026-11-14", TODAY);
    expect(n.next).toEqual({ href: "/schedule?view=day&date=2026-11-16", label: "Пн, 16 ноября" });
    expect(n.prev?.href).toBe("/schedule?view=day&date=2026-11-13");
  });

  it("перед понедельником — суббота прошлой недели", () => {
    const n = scheduleNeighbors("day", "2026-11-16", TODAY);
    expect(n.prev).toEqual({ href: "/schedule?view=day&date=2026-11-14", label: "Сб, 14 ноября" });
    expect(n.next?.href).toBe("/schedule?view=day&date=2026-11-17");
  });

  it("через границу месяца и года", () => {
    expect(scheduleNeighbors("day", "2026-11-30", TODAY).next?.label).toBe("Вт, 1 декабря");
    expect(scheduleNeighbors("day", "2026-12-31", TODAY).next?.href).toBe("/schedule?view=day&date=2027-01-01");
  });

  it("дальше года от сегодня листать некуда: страница такую дату не покажет", () => {
    // 366 дней вперёд от 12 ноября 2026 — 13 ноября 2027 (суббота)
    const edge = scheduleNeighbors("day", "2027-11-13", TODAY);
    expect(edge.next).toBeNull();
    expect(edge.prev).not.toBeNull();
    const back = scheduleNeighbors("day", "2025-11-11", TODAY);
    expect(back.prev).toBeNull();
    expect(back.next).not.toBeNull();
  });
});

describe("scheduleNeighbors — вид «Неделя»", () => {
  it("соседние недели, подпись — диапазон дат", () => {
    expect(scheduleNeighbors("week", "2026-11-12", TODAY)).toEqual({
      prev: { href: "/schedule?view=week&date=2026-11-05", label: "2–7 ноября" },
      next: { href: "/schedule?view=week&date=2026-11-19", label: "16–21 ноября" },
    });
  });

  it("неделя на стыке месяцев", () => {
    expect(scheduleNeighbors("week", "2026-11-25", TODAY).next?.label).toBe("30 ноября – 5 декабря");
  });

  it("за пределами года — некуда", () => {
    expect(scheduleNeighbors("week", "2027-11-10", TODAY).next).toBeNull();
  });
});
