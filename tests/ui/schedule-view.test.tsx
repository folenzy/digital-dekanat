import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Lesson } from "@/server/schedule";
import { gapBetween, typeDots } from "@/ui/student/schedule-view";
import { LessonList } from "@/ui/student/LessonList";

const html = (el: ReactElement) => renderToStaticMarkup(el);
const lesson = (over: Partial<Lesson>): Lesson => ({
  pair: 1, start: "09:00", end: "10:30", discipline: "Математический анализ", type: "lecture",
  room: "А-310", building: "Корпус А", teacher: "Ковалёва Марина Анатольевна", cancelled: false, note: null, ...over,
});

describe("gapBetween — что между парами", () => {
  it("короткий промежуток — перерыв в минутах", () => {
    expect(gapBetween("10:30", "10:40")).toEqual({ kind: "break", label: "Перерыв", duration: "10 мин" });
    expect(gapBetween("12:10", "12:40")).toEqual({ kind: "break", label: "Перерыв", duration: "30 мин" });
  });

  it("час и больше — окно, в часах и минутах", () => {
    expect(gapBetween("10:30", "12:40")).toEqual({ kind: "window", label: "Окно", duration: "2 ч 10 мин" });
    expect(gapBetween("10:30", "12:30")).toEqual({ kind: "window", label: "Окно", duration: "2 ч" });
    expect(gapBetween("10:30", "11:30")).toEqual({ kind: "window", label: "Окно", duration: "1 ч" });
  });

  it("пары встык, внахлёст или кривое время — ничего не показываем", () => {
    expect(gapBetween("10:30", "10:30")).toBeNull();
    expect(gapBetween("10:40", "10:30")).toBeNull();
    expect(gapBetween("уточняется", "10:30")).toBeNull();
  });
});

describe("typeDots — точки под днём недели", () => {
  it("по точке на пару, цвет — по типу занятия; отменённые не считаются", () => {
    const day = [
      lesson({ type: "lecture" }), lesson({ pair: 2, type: "practice" }),
      lesson({ pair: 3, type: "lab", cancelled: true }), lesson({ pair: 4, type: "lab" }),
    ];
    expect(typeDots(day)).toEqual(["lecture", "practice", "lab"]);
  });

  it("не больше пяти точек", () => {
    const many = Array.from({ length: 7 }, (_, i) => lesson({ pair: i + 1 }));
    expect(typeDots(many)).toHaveLength(5);
  });
});

describe("LessonList — список пар с перерывами", () => {
  it("между парами стоит строка перерыва, между парой и окном — «Окно»", () => {
    const out = html(
      <LessonList
        lessons={[
          lesson({}),
          lesson({ pair: 2, start: "10:40", end: "12:10", type: "practice", discipline: "Базы данных" }),
          lesson({ pair: 4, start: "14:20", end: "15:50", type: "lab", discipline: "Программирование" }),
        ]}
      />,
    );
    expect(out.match(/Перерыв/g)).toHaveLength(1);
    expect(out).toContain("10 мин");
    expect(out.match(/Окно/g)).toHaveLength(1);
    expect(out).toContain("2 ч 10 мин");
    // порядок: пара, перерыв, пара, окно, пара
    expect(out.indexOf("Математический анализ")).toBeLessThan(out.indexOf("Перерыв"));
    expect(out.indexOf("Перерыв")).toBeLessThan(out.indexOf("Базы данных"));
    expect(out.indexOf("Окно")).toBeLessThan(out.indexOf("Программирование"));
  });

  it("gaps={false}: перерывов и «окон» нет (неделя)", () => {
    const out = html(
      <LessonList
        compact
        gaps={false}
        lessons={[lesson({}), lesson({ pair: 2, start: "10:40", end: "12:10" }), lesson({ pair: 4, start: "14:20", end: "15:50" })]}
      />,
    );
    expect(out).not.toContain("Перерыв");
    expect(out).not.toContain("Окно");
  });

  it("компактная строка: номер, время, предмет, плашка, аудитория; преподавателя в summary нет, в раскрытой части есть", () => {
    const out = html(<LessonList compact lessons={[lesson({})]} />);
    const summary = out.slice(out.indexOf("<summary"), out.indexOf("</summary>"));
    const rest = out.slice(out.indexOf("</summary>"));
    expect(summary).toContain("09:00");
    expect(summary).toContain("Математический анализ");
    expect(summary).toContain("ЛК");
    expect(summary).toMatch(/1-.?я пара/);
    expect(summary).toContain("ауд. А-310");
    expect(summary).not.toMatch(/Ковалёва/);
    expect(rest).toContain("Ковалёва Марина Анатольевна");
  });

  it("компактная строка несёт метку изменения", () => {
    const out = html(
      <LessonList compact lessons={[lesson({ change: { kind: "moved", was: { start: "08:00" } } })]} />,
    );
    const summary = out.slice(out.indexOf("<summary"), out.indexOf("</summary>"));
    expect(summary).toContain("Перенос");
  });

  it("у одной пары перерывов нет", () => {
    expect(html(<LessonList lessons={[lesson({})]} />)).not.toContain("Перерыв");
  });

  it("тип занятия — плашкой с кодом и полным названием для скринридера", () => {
    const out = html(<LessonList lessons={[lesson({ type: "practice" })]} />);
    expect(out).toContain('data-type="practice"');
    expect(out).toMatch(/aria-hidden="true"[^>]*>ПР</);
    expect(out).toContain('<span class="sr-only">Практика</span>');
  });

  it("время пары — диапазоном, аудитория и преподаватель — в нижней строке", () => {
    const out = html(<LessonList lessons={[lesson({})]} />);
    expect(out).toContain("09:00");
    expect(out).toContain("10:30");
    expect(out).toContain("ауд. А-310");
    expect(out).toMatch(/Ковалёва\sМ\.\sА\./); // между инициалами — неразрывные пробелы
  });
});
