import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { hasNoHorizontalScroll, localDatabaseUrl, resetDemoWorld, signIn } from "./demo";

// Сквозная проверка «Пары → День/Неделя» (раскрытие пары, неделя-дневник) и «Учёба → Семестр» (пороги оценок).
// Свайп по строке пары уже закрыт в swipe.spec.ts (только 360 px).

test.beforeAll(() => resetDemoWorld());

const DAY = 86_400_000;
const mskToday = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const shift = (key: string, days: number) => new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const monday = () => {
  const today = mskToday();
  const wd = new Date(`${today}T00:00:00Z`).getUTCDay();
  return shift(today, -((wd + 6) % 7));
};
const wed = () => shift(monday(), 2);

const LONG_TOPIC = "Длинная тема занятия про устойчивость вёрстки: " + "слово ".repeat(40).trim() + ".";
const LONG_TITLE = "Методическоепособие".repeat(6) + ".pdf"; // 100+ символов без пробелов

/** Длинная тема и материал с неразрывным названием на все пары группы Алины в указанный день. */
async function putLongNotes(date: string) {
  const sql = postgres(localDatabaseUrl(), { max: 1 });
  try {
    const [row] = await sql<{ group_id: number }[]>`
      select s.group_id from students s join users u on u.id = s.user_id where u.login = 'alina.mironova'`;
    for (let pair = 1; pair <= 6; pair++) {
      await sql`
        insert into lesson_notes (group_id, date, pair, topic, task, materials)
        values (${row.group_id}, ${date}, ${pair}, ${LONG_TOPIC}, ${LONG_TOPIC},
                ${sql.json([{ title: LONG_TITLE, kind: "pdf" }])})
        on conflict (group_id, date, pair)
        do update set topic = excluded.topic, task = excluded.task, materials = excluded.materials`;
    }
  } finally {
    await sql.end();
  }
}

const main = (page: Page) => page.locator("#main");

test("«День»: пара раскрывается и сворачивается", async ({ page }) => {
  await signIn(page, "alina");
  await page.goto(`/schedule?view=day&date=${wed()}`);
  const summary = main(page).locator("details > summary").first();
  const details = main(page).locator("details").first();
  await expect(summary).toBeVisible();
  await expect(details).not.toHaveAttribute("open", /.*/);
  await summary.click();
  await expect(details).toHaveAttribute("open", "");
  await expect(details.getByText("Преподаватель", { exact: true })).toBeVisible();
  // полное ФИО (фамилия, имя, отчество целиком), а не инициалы
  const teacher = await details.locator("p", { hasText: "Преподаватель" }).innerText();
  expect(teacher.replace("Преподаватель", "").trim()).toMatch(/\S{3,}\s+\S{3,}\s+\S{3,}/);
  await expect(details.getByText("Тема", { exact: true })).toBeVisible();
  await summary.click();
  await expect(details).not.toHaveAttribute("open", /.*/);
});

test("«День»: материалы с подписью вида и пометкой «Файлы выдаёт преподаватель»", async ({ page }) => {
  await signIn(page, "alina");
  // в демо-мире материалы есть не у каждой пары: ищем по дням окна заметок
  for (let d = -3; d <= 10; d++) {
    await page.goto(`/schedule?view=day&date=${shift(mskToday(), d)}`);
    const rows = main(page).locator("details > summary");
    const n = await rows.count();
    for (let i = n - 1; i >= 0; i--) await rows.nth(i).click();
    const hint = main(page).getByText("Файлы выдаёт преподаватель").first();
    if (await hint.count()) {
      await expect(hint).toBeVisible();
      await expect(main(page).locator("details[open]").getByText(/^(PDF|Презентация|Ссылка|Учебник)$/).first()).toBeVisible();
      return;
    }
  }
  throw new Error("в окне демо-заметок не нашлось пары с материалами");
});

test("«Неделя»: блоки дней, колонки по ширине экрана, раскрытие пары", async ({ page }) => {
  await signIn(page, "alina");
  await page.goto(`/schedule?view=week&date=${wed()}`);
  const days = main(page).locator("section").filter({ has: page.locator("h2") });
  expect(await days.count()).toBeGreaterThanOrEqual(5);
  await expect(main(page).getByText("Пар нет").first()).toBeVisible();

  // контейнер недели — родитель блоков дней
  const columns = await days.first().evaluate((el) => getComputedStyle(el.parentElement!).gridTemplateColumns.split(" ").length);
  expect(columns).toBe(page.viewportSize()!.width >= 1024 ? 2 : 1);

  await main(page).locator("details > summary").first().click();
  await expect(main(page).locator("details[open]")).toHaveCount(1);
  await expect(main(page).locator("details[open]").getByText("Преподаватель", { exact: true })).toBeVisible();
  expect(await hasNoHorizontalScroll(page)).toBe(true);
});

test("длинная тема и название без пробелов не дают горизонтальной прокрутки (день и неделя)", async ({ page }) => {
  await putLongNotes(wed());
  await signIn(page, "alina");
  for (const view of ["day", "week"]) {
    await page.goto(`/schedule?view=${view}&date=${wed()}`);
    const rows = main(page).locator("details > summary");
    await expect(rows.first()).toBeVisible();
    const n = await rows.count();
    expect(n).toBeGreaterThan(0);
    for (let i = n - 1; i >= 0; i--) await rows.nth(i).click(); // с конца: раскрытие нижних пар не сдвигает верхние
    await expect(main(page).getByText("Методическоепособие").first()).toBeVisible();
    expect(await hasNoHorizontalScroll(page), `${view}: горизонтальная прокрутка`).toBe(true);
  }
});

test("«Неделя»: кольцо фокуса строки пары не обрезано рамкой списка", async ({ page }) => {
  await signIn(page, "alina");
  await page.goto(`/schedule?view=week&date=${wed()}`);
  const summary = main(page).locator("details > summary").first();
  // фокус с клавиатуры: Tab до первой строки пары, чтобы сработал :focus-visible
  for (let i = 0; i < 40 && !(await summary.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press("Tab");
  }
  await expect(summary).toBeFocused();
  const ring = await summary.evaluate((el) => {
    const cs = getComputedStyle(el);
    const grow = Math.max(parseFloat(cs.outlineOffset) + parseFloat(cs.outlineWidth), 0);
    const box = el.getBoundingClientRect();
    const list = el.closest("ol")!.getBoundingClientRect();
    return {
      style: cs.outlineStyle,
      fitsLeft: box.left - grow >= list.left,
      fitsRight: box.right + grow <= list.right,
      fitsTop: box.top - grow >= list.top,
    };
  });
  expect(ring.style).not.toBe("none");
  expect(ring).toMatchObject({ fitsLeft: true, fitsRight: true, fitsTop: true });
});

test("«Учёба → Семестр»: пороги оценок и два факта под полосой", async ({ page }) => {
  await signIn(page, "alina");
  await page.goto("/study");
  await expect(main(page).getByRole("meter").first()).toBeVisible();
  const marks = await main(page).locator("[data-at]").allInnerTexts();
  for (const g of ["3", "4", "5"]) expect(marks).toContain(g);
  await expect(main(page).getByText(/нужно ещё|уже набрано/).first()).toBeVisible();
  await expect(main(page).getByText(/Ближайшая точка|Остальное —/).first()).toBeVisible();
  expect(await hasNoHorizontalScroll(page)).toBe(true);
});
