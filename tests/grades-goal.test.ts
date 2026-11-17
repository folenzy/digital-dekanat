import { describe, expect, it } from "vitest";
import { gradeGoal, gradeMarks, nearestCheckpoint } from "@/server/grades";

// Пороги оценок на полосе баллов и ближайшая несданная контрольная точка.
const cp = (id: number, title: string, dueDate: string, score: number | null) => ({
  id, title, maxPoints: 20, score, dueDate, required: true,
});

describe("gradeMarks", () => {
  it("экзамен и дифзачёт — «3», «4», «5»; зачёт — одна отметка", () => {
    const three = [{ label: "3", at: 55 }, { label: "4", at: 70 }, { label: "5", at: 85 }];
    expect(gradeMarks("exam")).toEqual(three);
    expect(gradeMarks("graded_credit")).toEqual(three);
    expect(gradeMarks("credit")).toEqual([{ label: "зачёт", at: 55 }]);
  });
});

describe("gradeGoal", () => {
  it("до ближайшей отметки выше текущих баллов", () => {
    expect(gradeGoal(61, "exam")).toEqual({ kind: "need", label: "4", need: 9 });
    expect(gradeGoal(55, "exam")).toEqual({ kind: "need", label: "4", need: 15 }); // порог пройден
    expect(gradeGoal(0, "exam")).toEqual({ kind: "need", label: "3", need: 55 });
    expect(gradeGoal(null, "exam")).toEqual({ kind: "need", label: "3", need: 55 });
    expect(gradeGoal(40, "credit")).toEqual({ kind: "need", label: "зачёт", need: 15 });
  });

  it("все отметки пройдены — reached с высшей, баллы приводятся к 0–100", () => {
    expect(gradeGoal(85, "exam")).toEqual({ kind: "reached", label: "5" });
    expect(gradeGoal(140, "exam")).toEqual({ kind: "reached", label: "5" });
    expect(gradeGoal(60, "credit")).toEqual({ kind: "reached", label: "зачёт" });
    expect(gradeGoal(-5, "exam")).toEqual({ kind: "need", label: "3", need: 55 });
  });
});

describe("nearestCheckpoint", () => {
  const today = "2026-11-17";

  it("среди несданных — самая ранняя по дате", () => {
    const list = [cp(1, "21", "2026-11-21", null), cp(2, "12", "2026-11-12", 10), cp(3, "30", "2026-11-30", null)];
    expect(nearestCheckpoint(list, today)).toEqual({ title: "21", dueDate: "2026-11-21", maxPoints: 20, overdue: false });
  });

  it("просроченная несданная — overdue", () => {
    const list = [cp(1, "21", "2026-11-21", null), cp(2, "12", "2026-11-12", null)];
    expect(nearestCheckpoint(list, today)).toEqual({ title: "12", dueDate: "2026-11-12", maxPoints: 20, overdue: true });
  });

  it("все сданы — null", () => {
    expect(nearestCheckpoint([cp(1, "a", "2026-11-12", 5)], today)).toBeNull();
    expect(nearestCheckpoint([], today)).toBeNull();
  });
});
