import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./demo";

// Защитный слой запросов на прод-сборке (её запускает playwright.config.ts): строгая CSP с nonce
// и заголовки безопасности, аноним уводится на /login, API отвечает за себя само.
// Что CSP ничего нужного не блокирует, доказывают и остальные спеки: в них любая ошибка консоли — провал.

type Header = { name: string; value: string };

const cspFor = (nonce: string) =>
  `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; ` +
  "img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

/** Ответам API (JSON, текст, SSE) ничего грузить и показывать не нужно; рамки запрещены. */
const API_CSP = "default-src 'none'; frame-ancestors 'none'";

const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "x-frame-options": "DENY",
};

const values = (headers: Header[], name: string) =>
  headers.filter((h) => h.name.toLowerCase() === name).map((h) => h.value);

/** Каждый заголовок безопасности — ровно один раз и с точным значением (дубль «DENY, DENY» браузер не примет). */
function expectSecurityHeaders(headers: Header[], where: string) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    expect(values(headers, name), `${name} @ ${where}`).toEqual([value]);
  }
}

/** CSP ровно одна, совпадает с политикой посимвольно (значит, и без 'unsafe-eval'); возвращает её nonce. */
function expectCsp(headers: Header[], where: string): string {
  const csp = values(headers, "content-security-policy");
  expect(csp, where).toHaveLength(1);
  const nonce = /'nonce-([A-Za-z0-9+/]+={0,2})'/.exec(csp[0])?.[1];
  expect(nonce, `nonce @ ${where}`).toBeTruthy();
  expect(csp[0], where).toBe(cspFor(nonce!));
  expect(csp[0]).not.toContain("unsafe-eval");
  return nonce!;
}

/** У ответа API — ровно одна CSP, своя жёсткая (proxy на /api не работает, nonce-политики там нет). */
function expectApiCsp(headers: Header[], where: string) {
  expect(values(headers, "content-security-policy"), where).toEqual([API_CSP]);
}

// Ошибки консоли и нарушения CSP собираем во всех тестах файла.
type ConsoleError = { text: string; url: string };
let consoleErrors: ConsoleError[] = [];
test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push({ text: msg.text(), url: msg.location().url });
  });
  page.on("pageerror", (e) => consoleErrors.push({ text: e.message, url: "" }));
  await page.addInitScript(() => {
    const w = window as unknown as { __cspViolations: string[] };
    w.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      w.__cspViolations.push(`${e.effectiveDirective} ${e.blockedURI}`);
    });
  });
});
test.afterEach(() => {
  expect(consoleErrors.map((e) => `${e.text} @ ${e.url}`)).toEqual([]);
});

const cspViolations = (page: Page) =>
  page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations);

/** Ждём поток /api/events: его открывает клиентский JS после гидратации — значит, скрипты Next прошли CSP. */
const liveStream = (page: Page) =>
  page.waitForResponse((r) => new URL(r.url()).pathname === "/api/events" && r.status() === 200);

test("/login: CSP с nonce и заголовки безопасности; nonce новый на каждый запрос и стоит на всех скриптах", async ({ request }) => {
  const first = await request.get("/login");
  expect(first.status()).toBe(200);
  expectSecurityHeaders(first.headersArray(), "/login");
  const nonce = expectCsp(first.headersArray(), "/login");

  // Next сам ставит nonce на свои скрипты — и на внешние чанки, и на инлайновые
  const scripts = (await first.text()).match(/<script\b[^>]*>/g) ?? [];
  expect(scripts.length).toBeGreaterThan(1);
  for (const tag of scripts) expect(tag).toContain(`nonce="${nonce}"`);

  const second = await request.get("/login");
  expect(expectCsp(second.headersArray(), "/login (второй запрос)")).not.toBe(nonce);
});

test("кабинеты под CSP: заголовки на страницах, скрипты и поток событий работают, нарушений нет", async ({ page }) => {
  await signIn(page, "alina");
  for (const path of ["/", "/schedule", "/study", "/dekanat", "/dekanat/new", "/notifications", "/profile"]) {
    const stream = liveStream(page);
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    const headers = await res!.headersArray();
    expectSecurityHeaders(headers, path);
    expectCsp(headers, path);
    // поток событий живёт под своей CSP API — EventSource она не мешает (политика страницы — connect-src)
    expectApiCsp(await (await stream).headersArray(), `/api/events @ ${path}`);
    expect(await cspViolations(page), path).toEqual([]);
  }

  // «О проекте» без оболочки: у студента знак ведёт на его главную
  const about = await page.goto("/about");
  expectCsp(await about!.headersArray(), "/about");
  await expect(page.getByRole("link", { name: "На связи — на главную" })).toHaveAttribute("href", "/");
  expect(await cspViolations(page)).toEqual([]);

  await page.context().clearCookies();
  await signIn(page, "irina");
  for (const path of ["/staff", "/staff/announcements", "/staff/profile"]) {
    const stream = liveStream(page);
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    const headers = await res!.headersArray();
    expectSecurityHeaders(headers, path);
    expectCsp(headers, path);
    await stream;
    expect(await cspViolations(page), path).toEqual([]);
  }
});

test("внедрённый в страницу скрипт без nonce браузер не выполняет, а скрипты Next работают", async ({ page }) => {
  // Имитируем XSS: в настоящий ответ /login (с его заголовками) дописываем инлайновый скрипт без nonce.
  await page.route("**/login", async (route) => {
    const res = await route.fetch();
    const headers = Object.fromEntries(
      Object.entries(res.headers()).filter(([k]) => k !== "content-length" && k !== "content-encoding"),
    );
    const body = (await res.text()).replace("</body>", "<script>window.__injected = true</script></body>");
    await route.fulfill({ status: res.status(), headers, body });
  });
  await page.goto("/login");

  // гидратация прошла: переключатель пароля работает только с JS
  await page.getByRole("button", { name: "Показать пароль" }).click();
  await expect(page.getByLabel("Пароль", { exact: true })).toHaveAttribute("type", "text");

  expect(await page.evaluate(() => (window as unknown as { __injected?: boolean }).__injected)).toBeUndefined();
  expect(await cspViolations(page)).toEqual(["script-src-elem inline"]);
  // блокировку браузер пишет в консоль — здесь она и ожидается
  const blocked = consoleErrors.filter((e) => e.text.includes("Content Security Policy"));
  expect(blocked).toHaveLength(1);
  consoleErrors = consoleErrors.filter((e) => !blocked.includes(e));
});

test("аноним: страницы кабинетов и неизвестные адреса → /login; вход, «О проекте» и статика открыты", async ({ page, request }) => {
  for (const path of [
    "/", "/schedule", "/study", "/dekanat", "/dekanat/00000000-0000-4000-8000-000000000000", "/notifications",
    "/profile", "/staff", "/staff/appeals/00000000-0000-4000-8000-000000000000", "/staff/profile",
    "/takoy-stranitsy-net",
  ]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(307);
    expect(res.headers().location, path).toBe("/login");
    expectSecurityHeaders(res.headersArray(), `${path} (редирект)`);
  }

  for (const path of ["/schedule", "/staff"]) {
    await page.goto(path);
    await expect(page).toHaveURL((url) => url.pathname === "/login" && url.search === "");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Вход в кабинет");
  }

  const about = await page.goto("/about");
  expect(about?.status()).toBe(200);
  expectCsp(await about!.headersArray(), "/about");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("О проекте");
  // анониму знак ведёт сразу на вход (а не на «/», которая всё равно уведёт туда же)
  await expect(page.getByRole("link", { name: "На связи — на главную" })).toHaveAttribute("href", "/login");
  expect(await cspViolations(page)).toEqual([]);

  // иконка и чанки Next не уводятся на вход, но тоже с заголовками безопасности
  const icon = await request.get("/icon.svg", { maxRedirects: 0 });
  expect(icon.status()).toBe(200);
  expect(icon.headers()["content-type"]).toContain("image/svg+xml");
  expectSecurityHeaders(icon.headersArray(), "/icon.svg");
  const chunk = /<script\b[^>]*\bsrc="(\/_next\/static\/[^"]+\.js)"/.exec(await (await request.get("/login")).text())?.[1];
  expect(chunk).toBeTruthy();
  const js = await request.get(chunk!, { maxRedirects: 0 });
  expect(js.status()).toBe(200);
  expectSecurityHeaders(js.headersArray(), chunk!);
});

test("cookie есть, а сессии нет — пропускает дальше, и layout уводит на вход с пояснением", async ({ page }) => {
  await signIn(page, "alina");
  const session = (await page.context().cookies()).find((c) => c.httpOnly && c.name.endsWith("ns_session"));
  expect(session).toBeTruthy();
  // уходим со страницы с потоком событий: иначе его переподключение само уведёт на /login?reason=expired
  await page.goto("/about");
  await page.context().addCookies([{ ...session!, value: "not-a-real-session-token" }]);
  await page.goto("/schedule");
  await expect(page).toHaveURL((url) => url.pathname === "/login" && url.searchParams.get("reason") === "expired");
});

test("API отвечает само: /api/health и /api/internal/* не уводятся на вход, /api/events без сессии — 401; у API своя CSP", async ({ request }) => {
  // Сам маршрут /api/health появится в задаче деплоя (до тех пор 404); здесь важно, что proxy
  // не подменяет ответ API редиректом на вход.
  const health = await request.get("/api/health", { maxRedirects: 0 });
  expect(health.status()).not.toBe(307);
  expect(health.headers().location).toBeUndefined();
  expectSecurityHeaders(health.headersArray(), "/api/health");
  expectApiCsp(health.headersArray(), "/api/health");

  const reset = await request.post("/api/internal/demo-reset", { maxRedirects: 0 });
  expect(reset.status()).toBe(404); // без верного токена маршрут «не существует»
  expect(reset.headers().location).toBeUndefined();
  expectSecurityHeaders(reset.headersArray(), "/api/internal/demo-reset");
  expectApiCsp(reset.headersArray(), "/api/internal/demo-reset");

  const events = await request.get("/api/events", { maxRedirects: 0 });
  expect(events.status()).toBe(401);
  expect(events.headers().location).toBeUndefined();
  expectSecurityHeaders(events.headersArray(), "/api/events");
  expectApiCsp(events.headersArray(), "/api/events");
});

test("студент на /staff — 404 «Страница не найдена»", async ({ page }) => {
  await signIn(page, "alina");
  const res = await page.goto("/staff");
  expect(res?.status()).toBe(404);
  expectCsp(await res!.headersArray(), "/staff (404)");
  await expect(page.getByRole("heading", { name: "Страница не найдена" })).toBeVisible();
  // сам ответ 404 браузер пишет в консоль — это ожидаемо
  consoleErrors = consoleErrors.filter((e) => !(new URL(e.url || "x:/").pathname === "/staff" && e.text.includes("404")));
});
