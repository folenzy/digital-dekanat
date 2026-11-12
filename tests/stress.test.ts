import { describe, expect, it } from "vitest";
import {
  cleanStress, isStressComplete, needsStress, personName, vowelIndexes, withStress, type NameStress,
} from "@/lib/stress";

const ACUTE = "́";
const alina = { lastName: "Миронова", firstName: "Алина", middleName: "Сергеевна" };

describe("vowelIndexes — на какие буквы можно поставить ударение", () => {
  it("находит гласные, в том числе заглавные и «ё»", () => {
    expect(vowelIndexes("Миронова")).toEqual([1, 3, 5, 7]);
    expect(vowelIndexes("Алина")).toEqual([0, 2, 4]);
    expect(vowelIndexes("Артём")).toEqual([0, 3]);
    expect(vowelIndexes("Юлия")).toEqual([0, 2, 3]);
  });

  it("в слове без гласных — пусто", () => {
    expect(vowelIndexes("Нгктрн")).toEqual([]);
  });
});

describe("withStress — знак ударения после гласной", () => {
  it("ставит знак после выбранной гласной", () => {
    expect(withStress("Миронова", 3)).toBe(`Миро${ACUTE}нова`);
    expect(withStress("Алина", 2)).toBe(`Али${ACUTE}на`);
    expect(withStress("Алина", 0)).toBe(`А${ACUTE}лина`);
  });

  it("без индекса и с индексом не на гласной слово не меняется", () => {
    expect(withStress("Миронова", null)).toBe("Миронова");
    expect(withStress("Миронова", undefined)).toBe("Миронова");
    expect(withStress("Миронова", 0)).toBe("Миронова"); // «М» — согласная
    expect(withStress("Миронова", 99)).toBe("Миронова");
    expect(withStress("Миронова", -1)).toBe("Миронова");
    expect(withStress("Миронова", 1.5)).toBe("Миронова");
  });

  it("«ё» всегда ударная — знак не дублируем; в слове с одной гласной он тоже не нужен", () => {
    expect(withStress("Артём", 3)).toBe("Артём");
    expect(withStress("Пётр", 1)).toBe("Пётр");
    expect(withStress("Глеб", 2)).toBe("Глеб");
  });
});

describe("needsStress — где ударение вообще нужно", () => {
  it("нужно, если гласных две и больше и нет «ё»", () => {
    expect(needsStress("Миронова")).toBe(true);
    expect(needsStress("Глеб")).toBe(false);
    expect(needsStress("Артём")).toBe(false);
    expect(needsStress("")).toBe(false);
  });
});

describe("cleanStress — проверка того, что прислал браузер", () => {
  it("оставляет только индексы, которые указывают на гласную своего слова", () => {
    expect(cleanStress(alina, { last: 3, first: 2, middle: 4 })).toEqual({ last: 3, first: 2, middle: 4 });
  });

  it("выбрасывает согласные, выход за границы, дроби, строки и чужие ключи", () => {
    expect(cleanStress(alina, { last: 0, first: 99, middle: 2.5 })).toEqual({});
    expect(cleanStress(alina, { last: "3", first: null, extra: 1 } as never)).toEqual({});
    expect(cleanStress(alina, null)).toEqual({});
    expect(cleanStress(alina, "last=3")).toEqual({});
    expect(cleanStress(alina, [3, 2, 3])).toEqual({});
  });

  it("нет отчества — ключ middle не сохраняется", () => {
    expect(cleanStress({ lastName: "Ким", firstName: "Алина", middleName: null }, { first: 2, middle: 1 }))
      .toEqual({ first: 2 });
  });

  it("слову, которому ударение не нужно, оно не сохраняется", () => {
    expect(cleanStress({ lastName: "Ким", firstName: "Артём", middleName: null }, { last: 1, first: 0 })).toEqual({});
  });
});

describe("personName — имя так, как его увидят другие", () => {
  const stress: NameStress = { last: 3, first: 2, middle: 4 };

  it("официальный порядок (студент) и порядок «как представляется» (сотрудник)", () => {
    expect(personName(alina, { order: "official", stress, show: true }))
      .toBe(`Миро${ACUTE}нова Али${ACUTE}на Серге${ACUTE}евна`);
    expect(personName(alina, { order: "display", stress, show: true }))
      .toBe(`Али${ACUTE}на Серге${ACUTE}евна Миро${ACUTE}нова`);
  });

  it("зритель выключил ударения — имя без знаков", () => {
    expect(personName(alina, { order: "official", stress, show: false })).toBe("Миронова Алина Сергеевна");
  });

  it("ударения не заданы или заданы частично", () => {
    expect(personName(alina, { order: "official", stress: null, show: true })).toBe("Миронова Алина Сергеевна");
    expect(personName(alina, { order: "official", stress: { first: 2 }, show: true }))
      .toBe(`Миронова Али${ACUTE}на Сергеевна`);
  });

  it("мусор в сохранённых ударениях не ломает имя", () => {
    expect(personName(alina, { order: "official", stress: { last: 0, first: 42 } as NameStress, show: true }))
      .toBe("Миронова Алина Сергеевна");
    expect(personName(alina, { order: "official", stress: "oops" as never, show: true })).toBe("Миронова Алина Сергеевна");
  });

  it("без отчества", () => {
    expect(personName({ lastName: "Ким", firstName: "Алина", middleName: null }, { order: "official", stress: { first: 2 }, show: true }))
      .toBe(`Ким Али${ACUTE}на`);
  });
});

describe("isStressComplete — заполнено ли (для плашки «Заполни профиль»)", () => {
  it("заполнено, когда у каждого слова, которому нужно ударение, оно есть", () => {
    expect(isStressComplete(alina, { last: 3, first: 2, middle: 4 })).toBe(true);
    expect(isStressComplete(alina, { last: 3, first: 2 })).toBe(false);
    expect(isStressComplete(alina, null)).toBe(false);
  });

  it("словам с «ё» и с одной гласной ударение не требуется", () => {
    expect(isStressComplete({ lastName: "Ким", firstName: "Артём", middleName: null }, null)).toBe(true);
    expect(isStressComplete({ lastName: "Ким", firstName: "Артём", middleName: "Игоревич" }, { middle: 0 })).toBe(true);
  });
});
