import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { appealSnapshot, readRows } from "./db";
import { resetDemoWorld, signIn } from "./demo";

// Защита от чужих id: серверные действия — публичные POST-точки, поэтому проверяем их по-настоящему.
// Легальный запрос действия перехватываем у его хозяина (идентификатор действия и тело), подменяем id
// обращения на чужой и отправляем с куками другого пользователя. Затем сверяем БД (только чтение).
// Сами страницы «чужого» отвечают 404 — это проверяют dekanat.spec.ts и staff.spec.ts, здесь — ещё раз /staff.

test.beforeAll(() => resetDemoWorld());
test.afterAll(() => resetDemoWorld());

type Captured = { url: string; headers: Record<string, string>; body: string };

/** Выполняет `trigger` (нажатие на форму) и возвращает ушедший POST серверного действия. */
async function captureAction(page: Page, trigger: () => Promise<void>): Promise<Captured> {
  const sent = page.waitForRequest((r) => r.method() === "POST" && r.headers()["next-action"] !== undefined);
  await trigger();
  const req = await sent;
  const keep = ["accept", "content-type", "next-action", "next-router-state-tree", "next-url"];
  const headers = Object.fromEntries(Object.entries(req.headers()).filter(([k]) => keep.includes(k)));
  return { url: req.url(), headers, body: req.postData() ?? "" };
}

/** Повтор перехваченного запроса с куками `ctx`; id обращения в теле заменён. */
async function replay(ctx: BrowserContext, c: Captured, swap?: { from: string; to: string }) {
  const body = swap ? c.body.replaceAll(swap.from, swap.to) : c.body;
  expect(body, "id для подмены нашёлся в теле запроса").toContain(swap?.to ?? "");
  return ctx.request.post(c.url, { headers: c.headers, data: body, maxRedirects: 0 });
}

async function appealIdOf(login: string, title: string): Promise<string> {
  const rows = await readRows<{ id: string }>(async (sql) => sql`
    select a.id from appeals a
      join students s on s.id = a.student_id
      join users u on u.id = s.user_id
      join appeal_types t on t.code = a.type_code
     where u.login = ${login} and t.title = ${title}`);
  expect(rows, `обращение «${title}» у ${login}`).toHaveLength(1);
  return rows[0].id;
}

const messageCount = async (appealId: string) =>
  (await readRows<{ n: number }>(async (sql) => sql`select count(*)::int as n from appeal_messages where appeal_id = ${appealId}`))[0].n;

async function openAs(browser: Browser, who: "alina" | "denis" | "irina") {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signIn(page, who);
  return { ctx, page };
}

test("Алина: подмена id в форме и повтор действия с id Дениса ничего не меняют", async ({ browser }) => {
  const denisAppeal = await appealIdOf("denis.kravtsov", "Пересдача");
  const alinaAppeal = await appealIdOf("alina.mironova", "Справка для военкомата");
  const before = await appealSnapshot(denisAppeal);
  const messagesBefore = await messageCount(denisAppeal);

  const { ctx, page } = await openAs(browser, "alina");
  await page.goto(`/dekanat/${alinaAppeal}`);

  // 1. Через настоящую форму: меняем скрытое поле на id Дениса
  await page.getByLabel("Сообщение").fill("Я не Денис, но пишу в его обращение");
  await page.locator('input[name="appealId"]').evaluate((el, id) => ((el as HTMLInputElement).value = id), denisAppeal);
  const captured = await captureAction(page, () => page.getByRole("button", { name: "Отправить" }).click());
  expect(captured.body).toContain(denisAppeal);
  await expect(page.getByRole("alert")).toBeVisible(); // форма показала ошибку, а не успех
  expect(await appealSnapshot(denisAppeal)).toBe(before);
  expect(await messageCount(denisAppeal)).toBe(messagesBefore);

  // 2. Сырой повтор того же действия с куками Алины
  const res = await replay(ctx, captured, { from: denisAppeal, to: denisAppeal });
  const text = await res.text();
  expect(text).not.toContain("Дата подходит"); // ничего из переписки Дениса в ответе
  expect(await appealSnapshot(denisAppeal)).toBe(before);
  expect(await messageCount(denisAppeal)).toBe(messagesBefore);

  // 3. Как «своё» оно по-прежнему работает: тот же запрос с её собственным id проходит (проверка не пустая)
  const ownBefore = await messageCount(alinaAppeal);
  const own = await replay(ctx, captured, { from: denisAppeal, to: alinaAppeal });
  expect(own.status()).toBeLessThan(400);
  expect(await messageCount(alinaAppeal)).toBe(ownBefore + 1);
  await ctx.close();
});

test("Алина и служебные действия: /staff и карточка сотрудника — 404; повтор действия Ирины не меняет данные", async ({ browser }) => {
  const denisAppeal = await appealIdOf("denis.kravtsov", "Пересдача");
  const target = await appealIdOf("alina.mironova", "Справка для военкомата");

  // Ирина легально отвечает на чужое для Алины обращение — перехватываем её действие
  const irina = await openAs(browser, "irina");
  await irina.page.goto(`/staff/appeals/${target}`);
  await irina.page.getByLabel("Ответ студенту").fill("Служебный ответ для перехвата");
  const staffAction = await captureAction(irina.page, () => irina.page.getByRole("button", { name: "Ответить" }).click());
  await expect(irina.page.locator('[data-author="staff"]').last()).toContainText("Служебный ответ для перехвата");

  // контроль: с куками самой Ирины повтор работает (иначе проверки ниже ничего бы не доказывали)
  const targetMessages = await messageCount(target);
  await replay(irina.ctx, staffAction);
  expect(await messageCount(target)).toBe(targetMessages + 1);

  const snapshotBefore = await appealSnapshot(denisAppeal);
  const afterControl = await messageCount(target);

  const alina = await openAs(browser, "alina");
  for (const path of ["/staff", `/staff/appeals/${target}`, "/staff/announcements"]) {
    const res = await alina.page.goto(path);
    expect(res?.status(), path).toBe(404);
    await expect(alina.page.getByRole("heading", { name: "Страница не найдена" })).toBeVisible();
  }
  // служебное действие с куками студентки: тот же запрос, но другое обращение
  await replay(alina.ctx, { ...staffAction, body: staffAction.body.replaceAll(target, denisAppeal) }, { from: denisAppeal, to: denisAppeal });
  expect(await appealSnapshot(denisAppeal)).toBe(snapshotBefore);
  // и с её собственным обращением — ответа от «сотрудника» не появляется
  await replay(alina.ctx, staffAction);
  expect(await messageCount(target)).toBe(afterControl);
  await alina.ctx.close();
  await irina.ctx.close();
});

test("Ирина не вызывает действия студента: повтор ответа Алины с куками сотрудника — без изменений", async ({ browser }) => {
  const alinaAppeal = await appealIdOf("alina.mironova", "Справка для военкомата");

  const alina = await openAs(browser, "alina");
  await alina.page.goto(`/dekanat/${alinaAppeal}`);
  await alina.page.getByLabel("Сообщение").fill("Легальное сообщение Алины");
  const studentAction = await captureAction(alina.page, () => alina.page.getByRole("button", { name: "Отправить" }).click());
  await expect(alina.page.locator('[data-author="student"]').last()).toContainText("Легальное сообщение Алины");
  const before = await appealSnapshot(alinaAppeal);
  const messagesBefore = await messageCount(alinaAppeal);

  const irina = await openAs(browser, "irina");
  await replay(irina.ctx, studentAction, { from: alinaAppeal, to: alinaAppeal });
  expect(await appealSnapshot(alinaAppeal)).toBe(before);
  expect(await messageCount(alinaAppeal)).toBe(messagesBefore);

  // контроль: с куками Алины тот же повтор работает
  await replay(alina.ctx, studentAction, { from: alinaAppeal, to: alinaAppeal });
  expect(await messageCount(alinaAppeal)).toBe(messagesBefore + 1);

  // без куки вообще — тоже ничего
  const anon = await browser.newContext();
  await replay(anon, studentAction, { from: alinaAppeal, to: alinaAppeal });
  expect(await messageCount(alinaAppeal)).toBe(messagesBefore + 1);
  await anon.close();
  await alina.ctx.close();
  await irina.ctx.close();
});
