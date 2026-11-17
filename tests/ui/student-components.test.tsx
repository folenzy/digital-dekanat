import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Lesson } from "@/server/schedule";
import { LessonCard } from "@/ui/student/LessonCard";
import { Tabs } from "@/ui/Tabs";

// Разметка карточки пары и вкладок: состояния, которые e2e не может вызвать по времени (сервер берёт настоящее «сейчас»).
const html = (el: ReactElement) => renderToStaticMarkup(el);

const lesson = (over: Partial<Lesson>): Lesson => ({
  pair: 2, start: "10:40", end: "12:10", discipline: "Математический анализ", type: "lecture",
  room: "А-310", building: "Корпус А", teacher: "Ковалёва Марина Анатольевна", cancelled: false, note: null, ...over,
});

describe("LessonCard", () => {
  it("идущая пара отмечена и словом, и атрибутом", () => {
    const out = html(<LessonCard lesson={lesson({})} state="current" />);
    expect(out).toContain('data-state="current"');
    expect(out).toContain("Идёт сейчас");
    expect(out).toContain("2-⁠я пара");
    expect(out).toContain('<span class="sr-only">Лекция</span>');
    expect(out).toContain("корпус А");
    expect(out).toContain("Ковалёва М. А.");
  });

  it("новая аудитория: было → стало, старое зачёркнуто, для скринридера — словами", () => {
    const out = html(<LessonCard lesson={lesson({ change: { kind: "room", was: { room: "А-301" }, note: "Технические работы" } })} />);
    expect(out).toMatch(/<del[^>]*><span class="sr-only">было <\/span>А-301<\/del>/);
    expect(out).toContain('<span class="sr-only">, стало </span>');
    expect(out).toContain("Новая аудитория");
    expect(out).toContain("Технические работы");
  });

  it("перенос: новое время крупно, старое зачёркнуто", () => {
    const out = html(<LessonCard lesson={lesson({ pair: 4, start: "14:20", end: "15:50", change: { kind: "moved", was: { start: "12:40" } } })} />);
    expect(out).toContain("14:20");
    expect(out).toMatch(/<del[^>]*><span class="sr-only">было в <\/span>12:40<\/del>/);
    expect(out).toContain("Перенос");
  });

  it("отменённая: зачёркнутое название и бейдж", () => {
    const out = html(<LessonCard lesson={lesson({ cancelled: true, change: { kind: "cancelled" } })} />);
    expect(out).toContain("data-cancelled");
    expect(out).toContain("<s>Математический анализ</s>");
    expect(out).toContain("Отменена");
    expect(out.match(/Отменена/g)).toHaveLength(1);
  });

  it("пользовательский текст выводится как текст", () => {
    const out = html(<LessonCard lesson={lesson({ change: { kind: "extra", note: "<img src=x onerror=alert(1)>" } })} />);
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });

  describe("раскрытие", () => {
    const FULL = "Лебедев Сергей Павлович";
    const summaryOf = (out: string) => out.match(/<summary[\s\S]*?<\/summary>/)?.[0] ?? "";
    const detailsOf = (out: string) => out.split("</summary>")[1] ?? "";

    it("корень — details, в summary название и время, подробности после него", () => {
      const out = html(<LessonCard lesson={lesson({})} />);
      expect(out).toContain("<details");
      const s = summaryOf(out);
      expect(s).toContain("Математический анализ");
      expect(s).toContain("10:40");
      expect(s).toContain("12:10");
      expect(detailsOf(out)).not.toContain("<script");
    });

    it("заголовок — вне summary, sr-only, с названием и временем; в summary нет p, div и заголовков", () => {
      const out = html(<LessonCard lesson={lesson({})} titleAs="h2" state="current" />);
      expect(out).toMatch(/<h2 class="sr-only">Математический анализ, 10:40–12:10<\/h2><details/);
      const s = summaryOf(out);
      expect(s).not.toMatch(/<(p|div|h[1-6])[\s>]/);
      // имя кнопки — её видимое содержимое (WCAG 2.5.3): ни aria-labelledby, ни aria-describedby
      expect(s).not.toContain("aria-labelledby");
      expect(s).not.toContain("aria-describedby");
      expect(s).not.toContain(" id=");
    });

    it("прежний преподаватель неизвестен — «вместо» не показываем", () => {
      const d = detailsOf(html(<LessonCard lesson={lesson({ teacher: "Лебедев Сергей Павлович", change: { kind: "teacher", was: { teacher: "уточняется" } } })} />));
      expect(d).not.toContain("вместо");
    });

    it("раскрытая часть: полное ФИО, тема, задание, материалы с подписями, аудитория и корпус", () => {
      const out = html(
        <LessonCard
          lesson={lesson({
            teacher: FULL,
            note: {
              topic: "Пределы последовательностей",
              task: "Решить №12–18",
              materials: [{ title: "Конспект лекции", kind: "pdf" }, { title: "Слайды", kind: "slides" }],
            },
          })}
        />,
      );
      const d = detailsOf(out);
      expect(d).toContain(FULL);
      expect(d).toContain("Пределы последовательностей");
      expect(d).toContain("Решить №12–18");
      expect(d).toContain("Конспект лекции");
      expect(d).toContain("PDF");
      expect(d).toContain("Презентация");
      expect(d).toContain("Файлы выдаёт преподаватель");
      expect(d).toContain("А-310");
      expect(d).toMatch(/корпус\sА/);
    });

    it("в раскрытой части подпись «Аудитория», значение без повторного «ауд.»", () => {
      const d = detailsOf(html(<LessonCard lesson={lesson({})} />));
      expect(d).toMatch(/>Аудитория<\/span><span>А-310/);
      expect(d).not.toContain(">Где<");
      expect(d).not.toContain("ауд. А-310");
    });

    it("аудитория неизвестна — «уточняется» под подписью «Аудитория»", () => {
      const d = detailsOf(html(<LessonCard lesson={lesson({ room: "уточняется" })} />));
      expect(d).toMatch(/>Аудитория<\/span><span>уточняется/);
    });

    it("без заметки: «Тема пока не указана», без материалов и пометки", () => {
      const d = detailsOf(html(<LessonCard lesson={lesson({ note: null })} />));
      expect(d).toContain("Тема пока не указана");
      expect(d).not.toContain("Файлы выдаёт преподаватель");
      expect(d).not.toContain("PDF");
    });

    it("пустая или из одних пробелов тема тоже даёт «Тема пока не указана»", () => {
      for (const topic of ["", "   "]) {
        const d = detailsOf(html(<LessonCard lesson={lesson({ note: { topic, task: null, materials: [] } })} />));
        expect(d).toContain("Тема пока не указана");
      }
    });

    it("заметка без темы тоже даёт «Тема пока не указана»", () => {
      const d = detailsOf(html(<LessonCard lesson={lesson({ note: { topic: null, task: "Читать §3", materials: [] } })} />));
      expect(d).toContain("Тема пока не указана");
      expect(d).toContain("Читать §3");
    });

    it("подписи всех типов материалов", () => {
      const d = detailsOf(
        html(
          <LessonCard
            lesson={lesson({
              note: {
                topic: "Т",
                task: null,
                materials: [
                  { title: "а", kind: "pdf" }, { title: "б", kind: "slides" },
                  { title: "в", kind: "link" }, { title: "г", kind: "book" },
                ],
              },
            })}
          />,
        ),
      );
      for (const label of ["PDF", "Презентация", "Ссылка", "Учебник"]) expect(d).toContain(label);
    });

    it("замена преподавателя: новое полное ФИО и «вместо» прежнего", () => {
      const d = detailsOf(
        html(<LessonCard lesson={lesson({ teacher: FULL, change: { kind: "teacher", was: { teacher: "Ковалёва Марина Анатольевна" } } })} />),
      );
      expect(d).toContain(FULL);
      expect(d).toContain("вместо Ковалёва Марина Анатольевна");
    });

    it("преподаватель не назначен: «преподаватель уточняется»", () => {
      const d = detailsOf(html(<LessonCard lesson={lesson({ teacher: "уточняется" })} />));
      expect(d).toContain("преподаватель уточняется");
    });

    it("отменённая раскрывается и показывает причину", () => {
      const out = html(<LessonCard lesson={lesson({ cancelled: true, change: { kind: "cancelled", note: "Преподаватель болеет" } })} />);
      expect(out).toContain("<details");
      expect(out).toContain("Преподаватель болеет");
    });

    it("две карточки — независимые details", () => {
      const out = html(
        <>
          <LessonCard lesson={lesson({})} />
          <LessonCard lesson={lesson({ pair: 3, start: "12:40", end: "14:10" })} />
        </>,
      );
      expect(out.match(/<details/g)).toHaveLength(2);
      expect(out).not.toMatch(/<details[^>]*\sname=/);
      expect(out).not.toMatch(/<details[^>]*\sopen/);
    });
  });
});

describe("Tabs", () => {
  it("текущая вкладка — aria-current, счётчик скрыт от скринридера", () => {
    const out = html(
      <Tabs
        label="Уведомления и объявления"
        items={[
          { href: "/notifications", label: "Уведомления", current: true, count: 3 },
          { href: "/notifications?tab=announcements", label: "Объявления", current: false },
        ]}
      />,
    );
    expect(out).toContain('aria-label="Уведомления и объявления"');
    expect(out).toMatch(/<a [^>]*aria-current="page" href="\/notifications">/);
    expect(out).toMatch(/<a class="[^"]*" href="\/notifications\?tab=announcements">/); // без aria-current
    expect(out).toMatch(/aria-hidden="true"[^>]*>3</);
  });
});
