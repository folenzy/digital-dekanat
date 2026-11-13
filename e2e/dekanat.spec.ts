import { expect, test, type Page } from "@playwright/test";
import { hasNoHorizontalScroll, resetDemoWorld, shoot, signIn } from "./demo";

// «Деканат»: Спроси деканат, мастер нового обращения, карточка обращения — на 360 и 1280 px.
// Тесты меняют данные (создают обращения, отвечают, «Получил»), поэтому у файла свой свежий демо-мир
// до и после. Скриншоты → docs/screenshots/03-<экран>-<ширина>.png.

const widthOf = (page: Page) => page.viewportSize()!.width;
const snap = (page: Page, name: string) => shoot(page, name, widthOf(page), "03");

/**
 * Ошибки консоли запрещены везде. Исключение — ответ 404 на документ «Обращение не найдено» в своём тесте:
 * сейчас страница приходит потоком со статусом 200 (loading.tsx), но если статус станет 404, браузер напишет это в консоль.
 */
type ConsoleError = { text: string; url: string };
let consoleErrors: ConsoleError[] = [];
let allowed404 = new Set<string>();
test.beforeEach(({ page }) => {
  consoleErrors = [];
  allowed404 = new Set();
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push({ text: msg.text(), url: msg.location().url });
  });
  page.on("pageerror", (e) => consoleErrors.push({ text: e.message, url: "" }));
});
test.afterEach(() => {
  const unexpected = consoleErrors.filter((e) => {
    const path = e.url ? new URL(e.url).pathname : "";
    return !(allowed404.has(path) && e.text.includes("404"));
  });
  expect(unexpected.map((e) => `${e.text} @ ${e.url}`)).toEqual([]);
});

test.beforeAll(() => resetDemoWorld());
test.afterAll(() => resetDemoWorld());

async function expectFits(page: Page) {
  expect(await hasNoHorizontalScroll(page), "горизонтальная прокрутка").toBe(true);
}

/** Карточки «Мои обращения» на /dekanat (активные или завершённые). */
function appealLinks(page: Page) {
  return page.getByRole("region", { name: "Мои обращения" }).getByRole("link", { name: /Обращение О-/ });
}

test("Спроси деканат: ответ из базы → «Оформить» → обращение «Отправлено» со сроком", async ({ page }) => {
  await signIn(page, "alina");
  await page.goto("/dekanat");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Деканат");

  // слишком короткий запрос — подсказка, без поиска
  await page.getByRole("searchbox", { name: "Спроси деканат" }).fill("сп");
  await page.getByRole("button", { name: "Найти" }).click();
  await expect(page.getByText("Напиши хотя бы три буквы")).toBeVisible();

  await page.getByRole("searchbox", { name: "Спроси деканат" }).fill("справка в военкомат");
  await page.getByRole("button", { name: "Найти" }).click();
  await expect(page).toHaveURL(/\/dekanat\?q=/);
  const answers = page.getByRole("region", { name: "Ответы деканата" });
  const first = answers.getByRole("article").first();
  await expect(first.getByRole("heading", { level: 3 })).toHaveText("Как получить справку для военкомата?");
  // лучший ответ раскрыт сразу: полный текст, а не начало
  await expect(first.getByText(/возьми с собой студенческий билет/)).toBeVisible();
  expect(await answers.getByRole("article").count()).toBeLessThanOrEqual(3);
  await expect(first.getByRole("link", { name: "Не помогло — написать сотруднику" }))
    .toHaveAttribute("href", "/dekanat/new?topic=certificates&text=%D1%81%D0%BF%D1%80%D0%B0%D0%B2%D0%BA%D0%B0+%D0%B2+%D0%B2%D0%BE%D0%B5%D0%BD%D0%BA%D0%BE%D0%BC%D0%B0%D1%82");
  await expectFits(page);
  await snap(page, "ask");

  await first.getByRole("link", { name: "Оформить: Справка для военкомата" }).click();
  await page.waitForURL(/\/dekanat\/new\?type=cert_military$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Справка для военкомата");
  await expect(page.getByText(/^Уйдёт в: Справки и документы, ответ до \d{1,2} [а-я]+$/)).toBeVisible();

  // пустая форма: ошибки по-русски у полей, ничего не создано
  await page.getByRole("button", { name: "Отправить" }).click();
  await expect(page.getByText("Заполни поле")).toBeVisible();
  await expect(page.getByLabel("Куда нужна справка")).toHaveAttribute("aria-invalid", "true");

  await page.getByLabel("Куда нужна справка").fill("Военный комиссариат Ленинского района");
  await page.getByLabel("Сколько экземпляров").selectOption("2");
  await page.getByLabel("На бумаге, с печатью").check();
  await page.getByRole("button", { name: "Отправить" }).click();

  await page.waitForURL(/\/dekanat\/[0-9a-f-]{36}\?created=1$/);
  await expect(page.getByText(/^Обращение отправлено в «Справки и документы»\. Ответим до \d{1,2} [а-я]+\.$/)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Справка для военкомата");
  await expect(page.getByText("Отправлено", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Ответим до", { exact: true })).toBeVisible();
  await expect(page.getByText(/^осталось /)).toBeVisible();
  await expect(page.getByText("Военный комиссариат Ленинского района")).toBeVisible();
  await expectFits(page);
  await snap(page, "card-created");

  // и в «Моих обращениях» — со статусом и сроком
  await page.goto("/dekanat");
  const created = appealLinks(page).filter({ hasText: "Отправлено" }).filter({ hasText: "Справка для военкомата" });
  await expect(created).toHaveCount(1);
  await expect(created).toContainText(/Ответ (сегодня|завтра|\d{1,2} [а-я]+) до 18:00/);
});

test("Спроси деканат: ответа нет — дружелюбное пустое состояние с «Написать сотруднику»", async ({ page }) => {
  await signIn(page, "alina");
  await page.goto("/dekanat?q=абракадабра");
  await expect(page.getByRole("heading", { name: "Готового ответа нет" })).toBeVisible();
  const write = page.getByRole("link", { name: "Написать сотруднику" });
  await expect(write).toHaveAttribute("href", /^\/dekanat\/new\?text=/);
  await expectFits(page);
  await snap(page, "ask-empty");

  await write.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("О чём обращение?");
});

test("мастер: тема → подтип → форма, кнопка «назад», текст из «Не помогло» переносится", async ({ page }) => {
  await signIn(page, "alina");
  await page.goto("/dekanat");
  await page.getByRole("link", { name: "Новое обращение" }).click();
  await page.waitForURL("**/dekanat/new");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("О чём обращение?");
  await expect(page.getByRole("link", { name: /^Справки/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Стипендия/ })).toBeVisible();
  await expectFits(page);
  await snap(page, "wizard-1");

  await page.getByRole("link", { name: /^Учебные вопросы/ }).click();
  await page.waitForURL("**/dekanat/new?topic=study");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Учебные вопросы");
  const retake = page.getByRole("link", { name: /^Пересдача/ });
  await expect(retake).toContainText("обычно отвечаем за 2 раб. дня");
  await expectFits(page);
  await snap(page, "wizard-2");

  await retake.click();
  await page.waitForURL("**/dekanat/new?type=study_retake");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Пересдача");
  // в списке дисциплин — только свои
  const discipline = page.getByLabel("Дисциплина");
  await expect(discipline.locator("option", { hasText: "Математический анализ" })).toHaveCount(1);
  await expect(discipline.locator("option", { hasText: "Статистика" })).toHaveCount(0);
  await expect(page.getByText(/^Уйдёт в: Учебный отдел, ответ до /)).toBeVisible();
  await expectFits(page);
  await snap(page, "wizard-3");

  // «назад» браузера возвращает на шаг 2
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Учебные вопросы");

  // мусор в адресе → шаг 1
  await page.goto("/dekanat/new?type=__proto__&topic=constructor");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("О чём обращение?");

  // «Не помогло — написать сотруднику»: тема выбрана, текст переносится в форму
  await page.goto("/dekanat?q=" + encodeURIComponent("когда приходит стипендия"));
  await page.getByRole("region", { name: "Ответы деканата" }).getByRole("article").first()
    .getByRole("link", { name: "Не помогло — написать сотруднику" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Стипендия");
  await page.getByRole("link", { name: /^Вопрос по выплате/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Вопрос по выплате");
  await expect(page.getByLabel("Твой вопрос")).toHaveValue("когда приходит стипендия");
});

test("повышенная стипендия: «Подать в 1 тап» → готовый текст → карточка с подтверждением", async ({ page }) => {
  await signIn(page, "alina");
  await page.getByRole("link", { name: "Подать в 1 тап" }).click();
  await page.waitForURL("**/dekanat/new?type=stip_increased&prefill=1");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Повышенная академическая стипендия");
  await expect(page.getByLabel("Текст заявления")).toHaveValue(/^Прошу рассмотреть возможность назначения/);
  await expect(page.getByText(/^Уйдёт в: Стипендиальный отдел, ответ до /)).toBeVisible();
  await page.getByRole("button", { name: "Отправить" }).click();

  await page.waitForURL(/\/dekanat\/[0-9a-f-]{36}\?created=1$/);
  await expect(page.getByText(/^Обращение отправлено в «Стипендиальный отдел»\. Ответим до /)).toBeVisible();
  await expect(page.getByText(/^Прошу рассмотреть возможность назначения/)).toBeVisible();

  // заявление подано — карточка на «Сегодня» исчезла
  await page.goto("/");
  await expect(page.getByText("Ты проходишь на повышенную стипендию")).toHaveCount(0);
});

test("двойное нажатие «Отправить» создаёт ровно одно обращение", async ({ page }) => {
  await signIn(page, "alina");
  await page.goto("/dekanat/new?type=cert_study");
  await page.getByLabel("Куда нужна справка").fill("В банк по месту требования");
  await page.getByRole("button", { name: "Отправить" }).dblclick();
  await page.waitForURL(/\/dekanat\/[0-9a-f-]{36}\?created=1$/);

  await page.goto("/dekanat");
  await expect(appealLinks(page).filter({ hasText: "Справка об обучении" })).toHaveCount(1);
});

test("текст обращения и сообщения выводится как есть: теги, эмодзи, слово на 2000 символов", async ({ page }) => {
  const word = "Ы".repeat(1900);
  await signIn(page, "alina");
  await page.goto("/dekanat/new?type=study_other");
  await page.getByLabel("Твой вопрос").fill(`<b>жирный</b> 😀 ${word}`);
  await page.getByRole("button", { name: "Отправить" }).click();
  await page.waitForURL(/\/dekanat\/[0-9a-f-]{36}\?created=1$/);

  await expect(page.getByText("<b>жирный</b> 😀", { exact: false })).toBeVisible();
  await expect(page.locator("main b", { hasText: "жирный" })).toHaveCount(0);
  await expectFits(page);

  // сообщение в переписку: справа, с автором; поле очищается
  await page.getByLabel("Сообщение").fill(`<i>курсив</i> 🎓 ${"Щ".repeat(1990)}`);
  await page.getByRole("button", { name: "Отправить" }).click();
  const mine = page.locator('[data-author="student"]').last();
  await expect(mine).toContainText("<i>курсив</i> 🎓");
  await expect(mine).toContainText("Алина Миронова");
  await expect(page.getByLabel("Сообщение")).toHaveValue("");
  await expect(page.locator("main i", { hasText: "курсив" })).toHaveCount(0);
  await expectFits(page);
});

test("карточка в работе: срок с обратным отсчётом, таймлайн с исполнителем, переписка", async ({ page }) => {
  await signIn(page, "alina");
  await page.goto("/dekanat");
  await appealLinks(page).filter({ hasText: "В работе" }).filter({ hasText: "Справка для военкомата" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Справка для военкомата");
  await expect(page.getByText("В работе", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/^осталось /)).toBeVisible();
  const timeline = page.getByRole("region", { name: "Путь обращения" });
  await expect(timeline.getByText("Принято в работу")).toBeVisible();
  await expect(timeline.getByText("Ирина Белова")).toBeVisible();
  await expect(page.getByText("Военный комиссариат Центрального района")).toBeVisible();
  await expect(page.getByText("На бумаге, с печатью")).toBeVisible();
  await expectFits(page);
  await snap(page, "card-in-progress");
});

test("Денис отвечает на уточнение → «В работе»; справка готова → «Получил» → «Закрыто»", async ({ page }) => {
  await signIn(page, "denis");
  await page.goto("/dekanat");
  await appealLinks(page).filter({ hasText: "Пересдача" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Пересдача");
  await expect(page.getByText("Нужно уточнение", { exact: true }).first()).toBeVisible();
  const ask = page.getByRole("region", { name: "Деканат ждёт твоего ответа" });
  await expect(ask.getByText(/Эта дата вам подходит или нужна другая\?/)).toBeVisible();
  await expect(page.getByText("Статистика", { exact: true })).toBeVisible();
  await expectFits(page);
  await snap(page, "card-needs-info");

  await ask.getByLabel("Твой ответ").fill("Дата подходит, приду в 10:00. Спасибо!");
  await ask.getByRole("button", { name: "Ответить" }).click();
  await expect(page.getByText("В работе", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Деканат ждёт твоего ответа" })).toHaveCount(0);
  await expect(page.locator('[data-author="student"]').last()).toContainText("Дата подходит, приду в 10:00. Спасибо!");
  await expect(page.getByText(/^осталось /)).toBeVisible();

  await page.goto("/dekanat");
  await appealLinks(page).filter({ hasText: "Справка об обучении" }).click();
  await expect(page.getByText("Готово", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/^Забрать: каб\. 214, корпус А, до \d{1,2} [а-я]+/)).toBeVisible();
  await expectFits(page);
  await snap(page, "card-ready");

  await page.getByRole("button", { name: "Получил" }).click();
  await expect(page.getByText("Закрыто", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("Сообщение")).toHaveCount(0);
  await expect(page.getByText("Обращение закрыто — написать в него нельзя")).toBeVisible();

  await page.goto("/dekanat?filter=done");
  await expect(appealLinks(page).filter({ hasText: "Справка об обучении" })).toHaveCount(1);
});

test("чужое, несуществующее и кривое id — «Обращение не найдено»", async ({ page }) => {
  await signIn(page, "denis");
  await page.goto("/dekanat");
  const href = await appealLinks(page).first().getAttribute("href");
  expect(href).toMatch(/^\/dekanat\/[0-9a-f-]{36}$/);

  await page.context().clearCookies();
  await signIn(page, "alina");
  for (const path of [href!, "/dekanat/not-a-uuid", "/dekanat/00000000-0000-4000-8000-000000000000"]) {
    allowed404.add(path);
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Обращение не найдено" })).toBeVisible();
    await expect(page.getByRole("link", { name: "К моим обращениям" })).toHaveAttribute("href", "/dekanat");
    // ни следа чужого обращения
    await expect(page.getByText("Пересдача")).toHaveCount(0);
  }
  await expectFits(page);
  await snap(page, "not-found");
});
