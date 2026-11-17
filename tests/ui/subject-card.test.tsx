import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { EnrollmentView } from "@/server/grades";
import { SubjectCard } from "@/ui/student/SubjectCard";

// Карточка дисциплины: пороги оценок на полосе, «сколько ещё нужно» и ближайшая контрольная точка.
const today = "2026-11-17";
const enrollment = (over: Partial<EnrollmentView>): EnrollmentView => ({
  id: 1, disciplineId: 1, discipline: "Математический анализ", semester: 3, controlForm: "exam",
  points: 61, finalGrade: null, admitted: true, pace: null,
  checkpoints: [{ id: 10, title: "Контрольная 2", maxPoints: 15, score: null, dueDate: "2026-11-21", required: false }],
  ...over,
});
const html = (e: EnrollmentView) => renderToStaticMarkup(<SubjectCard e={e} today={today} riskIds={new Set()} />);
const text = (e: EnrollmentView) => html(e).replace(/<[^>]+>/g, "").replace(/&quot;/g, '"');

describe("SubjectCard", () => {
  it("экзамен: до «4» нужно ещё 9 и ближайшая точка", () => {
    const out = text(enrollment({}));
    expect(out).toContain("До «4» нужно ещё 9");
    expect(out).toContain("Ближайшая точка: «Контрольная 2», до 21 ноября, до +15");
  });

  it("на полосе три отметки порогов с data-at", () => {
    const out = html(enrollment({}));
    for (const [label, at] of [["3", 55], ["4", 70], ["5", 85]] as const) {
      expect(out).toMatch(new RegExp(`data-at="${at}"[^>]*>${label}<`));
    }
  });

  it("90 баллов: на «5» уже набрано", () => {
    expect(text(enrollment({ points: 90 }))).toContain("На «5» уже набрано");
  });

  it("итоговая оценка вместо «нужно ещё»", () => {
    const out = text(enrollment({ finalGrade: "4" }));
    expect(out).toContain("Итог: хорошо");
    expect(out).not.toContain("нужно ещё");
  });

  it("просроченная обязательная точка — красным", () => {
    const e = enrollment({ checkpoints: [{ id: 10, title: "Контрольная 1", maxPoints: 10, score: null, dueDate: "2026-11-12", required: true }] });
    expect(text(e)).toContain("просрочена с 12 ноября");
    expect(html(e)).toMatch(/overdue[^"]*">просрочена с 12 ноября/);
  });

  it("просроченная необязательная точка — нейтральным текстом, без красного", () => {
    const e = enrollment({ checkpoints: [{ id: 10, title: "Контрольная 1", maxPoints: 10, score: null, dueDate: "2026-11-12", required: false }] });
    expect(text(e)).toContain("просрочена с 12 ноября");
    expect(html(e)).not.toMatch(/overdue[^"]*">просрочена/);
  });

  it("нет несданных точек: остальное — на экзамене или на зачёте", () => {
    const done = [{ id: 10, title: "К1", maxPoints: 10, score: 8, dueDate: "2026-11-01", required: false }];
    expect(text(enrollment({ checkpoints: done }))).toContain("Остальное — на экзамене");
    expect(text(enrollment({ checkpoints: done, controlForm: "credit" }))).toContain("Остальное — на зачёте");
  });

  it("зачёт: одна отметка и «До зачёта нужно ещё 15»", () => {
    const e = enrollment({ controlForm: "credit", points: 40 });
    const out = html(e);
    expect(out.match(/data-at=/g)).toHaveLength(1);
    expect(out).toMatch(/data-at="55"[^>]*>зачёт</);
    expect(text(e)).toContain("До зачёта нужно ещё 15");
  });

  it("зачёт набран: «На зачёт уже набрано»", () => {
    expect(text(enrollment({ controlForm: "credit", points: 60 }))).toContain("На зачёт уже набрано");
  });

  it("полоса — meter с подсказкой про порог; точки в details", () => {
    const out = html(enrollment({}));
    expect(out).toContain('role="meter"');
    expect(out).toMatch(/aria-valuetext="[^"]*до «4» нужно ещё 9/);
    expect(out).toContain("<details");
  });

  it("штрихи на полосе повторяют отметки: у зачёта один, у экзамена три", () => {
    expect(html(enrollment({ controlForm: "credit" })).match(/data-tick=/g)).toHaveLength(1);
    expect(html(enrollment({})).match(/data-tick=/g)).toHaveLength(3);
  });

  it("при итоговой оценке «итог» один раз и без ближайшей точки", () => {
    const out = text(enrollment({ finalGrade: "4" }));
    expect(out.match(/итог/gi)).toHaveLength(1);
    expect(out).not.toContain("Ближайшая точка");
  });

  it("два факта под полосой разделены, текст не слипается", () => {
    const e = enrollment({});
    expect(html(e)).not.toContain("9</span><span>Ближайшая");
    expect(html(e)).toMatch(/<ul[^>]*>s*<li>До/);
  });
});
