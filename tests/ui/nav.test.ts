import { describe, expect, it } from "vitest";
import { activeHref, bellHref, homeHref, navItems } from "@/ui/nav";

describe("навигация оболочки", () => {
  it("студент: пять вкладок по спеке §7", () => {
    expect(navItems("student").map((i) => [i.label, i.href])).toEqual([
      ["Сегодня", "/"],
      ["Пары", "/schedule"],
      ["Учёба", "/study"],
      ["Деканат", "/dekanat"],
      ["Профиль", "/profile"],
    ]);
  });

  it("сотрудник: очередь, объявления, профиль", () => {
    expect(navItems("staff").map((i) => [i.label, i.href])).toEqual([
      ["Очередь", "/staff"],
      ["Объявления", "/staff/announcements"],
      ["Профиль", "/staff/profile"],
    ]);
  });

  it("главная по роли: студенту «Сегодня», сотруднику очередь (студенческая «/» для него 404), анониму вход", () => {
    expect(homeHref("student")).toBe("/");
    expect(homeHref("staff")).toBe("/staff");
    expect(homeHref(null)).toBe("/login");
  });

  it("колокольчик ведёт студента к уведомлениям, сотрудника — в очередь", () => {
    expect(bellHref("student")).toBe("/notifications");
    expect(bellHref("staff")).toBe("/staff");
  });

  it("студент: «/» активна только точно, вложенные страницы подсвечивают свой раздел", () => {
    const hrefs = navItems("student").map((i) => i.href);
    expect(activeHref("/", hrefs)).toBe("/");
    expect(activeHref("/dekanat", hrefs)).toBe("/dekanat");
    expect(activeHref("/dekanat/new", hrefs)).toBe("/dekanat");
    expect(activeHref("/dekanat/3f1c-uuid", hrefs)).toBe("/dekanat");
    expect(activeHref("/schedule/", hrefs)).toBe("/schedule");
    expect(activeHref("/dekanatx", hrefs)).toBeNull();
    expect(activeHref("/notifications", hrefs)).toBeNull();
    expect(activeHref(null, hrefs)).toBeNull();
  });

  it("сотрудник: побеждает самый длинный префикс, «/staff» не перехватывает объявления", () => {
    const hrefs = navItems("staff").map((i) => i.href);
    expect(activeHref("/staff", hrefs)).toBe("/staff");
    expect(activeHref("/staff/appeals/42", hrefs)).toBe("/staff");
    expect(activeHref("/staff/announcements", hrefs)).toBe("/staff/announcements");
    expect(activeHref("/staff/profile", hrefs)).toBe("/staff/profile");
  });
});
