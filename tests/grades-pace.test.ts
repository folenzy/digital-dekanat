import { describe, expect, it } from "vitest";
import { paceGrade } from "@/server/grades";

// Предварительная оценка «по темпу»: доля баллов в уже оценённых контрольных точках.
const cp = (score: number | null, maxPoints: number) => ({ score, maxPoints });

describe("paceGrade", () => {
  it("по доле баллов в оценённых точках, неоценённые не считаются", () => {
    expect(paceGrade([cp(18, 20), cp(17, 20), cp(null, 20)])).toEqual({ grade: "отлично", score: 35, max: 40 });
    expect(paceGrade([cp(15, 20), cp(11, 20)])).toEqual({ grade: "удовлетворительно", score: 26, max: 40 });
    expect(paceGrade([cp(15, 20), cp(13, 20)])).toEqual({ grade: "хорошо", score: 28, max: 40 });
  });

  it("мало оценок — null: меньше 20 оценённых баллов и меньше двух точек", () => {
    expect(paceGrade([])).toBeNull();
    expect(paceGrade([cp(null, 20), cp(null, 30)])).toBeNull();
    expect(paceGrade([cp(5, 5)])).toBeNull(); // одна точка на 5 баллов — не «отлично»
    expect(paceGrade([cp(19, 19), cp(null, 20)])).toBeNull();
  });

  it("достаточно: одна точка от 20 баллов или две оценённые точки", () => {
    expect(paceGrade([cp(20, 20)])).toEqual({ grade: "отлично", score: 20, max: 20 });
    expect(paceGrade([cp(4, 5), cp(5, 5)])).toEqual({ grade: "отлично", score: 9, max: 10 });
  });
});
