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
  room: "А-310", building: "Корпус А", teacher: "Ковалёва Марина Анатольевна", cancelled: false, ...over,
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
