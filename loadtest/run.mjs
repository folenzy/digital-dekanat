// Замер масштабирования «На связи»: 3, 2, 1 копия приложения за Caddy на одной PostgreSQL.
//
//   node loadtest/run.mjs                 — весь замер (≈ 5 минут), итог в loadtest/results/
//   node loadtest/run.mjs --copies 2,1 --per-copy 8 --sse-per-copy 60 --duration 20 --keep
//
// Что делает (подробно и с результатами — loadtest/README.md):
// 1. Поднимает стенд loadtest/docker-compose.yml с тем же образом, что на сервере (nasvyazi-app:latest),
//    сразу с наибольшим числом копий. Пароль базы, демо-пароли и токен сброса — случайные на этот запуск,
//    нигде не печатаются и не сохраняются.
// 2. Создаёт в базе стенда сессии всем пользователям демо-мира (вход через форму не нужен,
//    и ограничение попыток входа по IP не мешает: вся нагрузка идёт с одного адреса), собирает статистику базы.
// 3. Прогревает все копии: сначала напрямую по всем страницам, потом --burn-in секунд общей нагрузкой.
//    Свежая копия первые минуты заметно медленнее (JIT), и без прогрева первый замер выходил заниженным.
// 4. Живые обновления между копиями: студенты подписаны на копиях 2..N, сотрудник в браузере на копии 1
//    нажимает «Взять следующее обращение» — событие должно прийти владельцу обращения на других копиях.
// 5. Замеры сверху вниз (3 → 2 → 1, лишние копии останавливаются): нагрузка растёт вместе с числом копий —
//    на каждую --per-copy «пользователей» без пауз и --sse-per-copy открытых потоков событий.
//    Первые --warmup секунд каждого замера не считаются. Место остановленных копий занимает нагрузчик
//    процессора той же доли ядра (см. burner): иначе Windows замедляет простаивающую машину Docker.
// 6. Ещё один замер: на оставшуюся одну копию — вся нагрузка, которую держали N копий.
// 7. Останавливает стенд (база в tmpfs исчезает), если не передан --keep.

import { execFile, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import postgres from "postgres";

const here = path.dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);

const { values: opt } = parseArgs({
  options: {
    copies: { type: "string", default: "3,2,1" },
    "per-copy": { type: "string", default: "8" },
    "sse-per-copy": { type: "string", default: "60" },
    duration: { type: "string", default: "30" },
    warmup: { type: "string", default: "10" },
    "burn-in": { type: "string", default: "60" },
    keep: { type: "boolean", default: false },
  },
});
const COPIES = opt.copies.split(",").map(Number).sort((a, b) => b - a);
const MAX_N = COPIES[0];
const MIN_N = COPIES.at(-1);
const PER_COPY = Number(opt["per-copy"]);
const SSE_PER_COPY = Number(opt["sse-per-copy"]);
const DURATION_S = Number(opt.duration);
const WARMUP_S = Number(opt.warmup);
const BURN_IN_S = Number(opt["burn-in"]);

const BASE = "http://127.0.0.1:8088"; // Caddy стенда
const COOKIE = "ns_session"; // имя cookie без HTTPS (src/server/auth/cookie.ts)
const CPUS = { APP_CPUS: "0.35", DB_CPUS: "0.5", CADDY_CPUS: "0.3" };

// Страницы кабинета, которые открывает «пользователь»; 9 из 10 — студенты.
const STUDENT_PAGES = ["/", "/schedule", "/study", "/dekanat", "/notifications", "/profile"];
const STAFF_PAGES = ["/staff", "/staff?tab=in_progress", "/staff/announcements"];
const STAFF_SHARE = 0.1;

// Секреты стенда: только в окружении процессов docker compose.
const secret = () => randomBytes(24).toString("base64url");
const env = {
  ...process.env, ...CPUS,
  LOAD_DB_PASSWORD: secret(), LOAD_DEMO_PASSWORD: secret(), LOAD_RESET_TOKEN: secret(),
};
const compose = (...args) => ["compose", "-f", path.join(here, "docker-compose.yml"), ...args];

function docker(args, { quiet = false } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn("docker", args, { env, stdio: quiet ? "ignore" : ["ignore", "inherit", "inherit"] });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`docker ${args.slice(3).join(" ")}: код ${code}`))));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => console.log(`[${new Date().toLocaleTimeString("ru-RU")}] ${s}`);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
const get = (url, token) => fetch(url, { headers: { cookie: `${COOKIE}=${token}` }, redirect: "manual" });

async function healthy(url) {
  try {
    const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2000) });
    await res.arrayBuffer();
    return res.status === 200;
  } catch {
    return false;
  }
}

/** Адреса копий в обход Caddy: http://127.0.0.1:310x по номеру контейнера. */
async function copyUrls(n) {
  const urls = [];
  for (let i = 1; i <= n; i++) {
    const { stdout } = await run("docker", compose("port", "--index", String(i), "app", "3000"), { env });
    urls.push(`http://${stdout.trim()}`);
  }
  return urls;
}

async function scaleTo(n) {
  await docker(compose("up", "-d", "--scale", `app=${n}`));
  const deadline = Date.now() + 180_000;
  for (;;) {
    const urls = await copyUrls(n).catch(() => []);
    if (urls.length === n && (await Promise.all([...urls, BASE].map(healthy))).every(Boolean)) {
      await sleep(4000); // Caddy перечитывает список копий раз в 2 с
      return urls;
    }
    if (Date.now() > deadline) throw new Error(`копии не поднялись за 3 минуты (${n})`);
    await sleep(1000);
  }
}

/** Сессии всем пользователям демо-мира. Токены живут только в памяти этого процесса. */
async function createSessions(sql) {
  const users = await sql`select id, role from users order by role, id`;
  const out = [];
  for (const u of users) {
    const token = randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(token).digest("hex");
    await sql`insert into sessions (token_hash, user_id, expires_at, user_agent)
              values (${hash}, ${u.id}, now() + interval '1 day', 'loadtest')`;
    out.push({ userId: u.id, role: u.role, token });
  }
  return out;
}

/** Поток событий: ready — когда пришёл «: connected» (LISTEN уже готов). onText — всё, что пришло дальше. */
function openStream(url, token, onText = () => {}) {
  const ac = new AbortController();
  const ready = (async () => {
    const res = await fetch(`${url}/api/events`, {
      headers: { cookie: `${COOKIE}=${token}`, accept: "text/event-stream" }, signal: ac.signal,
    });
    if (res.status !== 200) throw new Error(`поток событий: ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let first = "";
    while (!first.includes(": connected")) {
      const { value, done } = await reader.read();
      if (done) throw new Error("поток закрылся до «connected»");
      first += dec.decode(value, { stream: true });
    }
    (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) return;
          onText(dec.decode(value, { stream: true }), Date.now());
        }
      } catch { /* закрыт нами */ }
    })();
  })();
  return { ready, close: () => ac.abort() };
}

/**
 * Нагрузчик процессора на место остановленных копий. На ноутбуке с ядрами двух типов Windows отдаёт
 * почти простаивающую виртуальную машину Docker медленным ядрам: одна копия в одиночку выдавала
 * 8 стр/с, а с фоновой нагрузкой 0,7 ядра — 17. Чтобы условия были одинаковыми, во всех замерах
 * машина загружена одинаково: на каждую недостающую до MAX_N копию — пустой цикл на APP_CPUS ядра.
 */
const BURNER = "nasvyazi-load-burner";
async function burner(copiesMissing) {
  await run("docker", ["rm", "-f", BURNER], { env }).catch(() => {});
  if (copiesMissing <= 0) return;
  const cpus = (Number(CPUS.APP_CPUS) * copiesMissing).toFixed(2);
  await run("docker", ["run", "-d", "--rm", "--name", BURNER, "--cpus", cpus,
    "postgres:17-alpine", "sh", "-c", "while :; do :; done"], { env });
}

async function dockerStats() {
  const { stdout } = await run("docker", ["stats", "--no-stream", "--format", "{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"], { env });
  return stdout.trim().split("\n").filter((l) => l.startsWith("nasvyazi-load-")).map((l) => {
    const [name, cpu, mem] = l.split("\t");
    return { name: name.replace("nasvyazi-load-", ""), cpu, mem: mem.split(" / ")[0] };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Новая копия стартует «холодной»: первые показы страниц в разы медленнее (загрузка модулей, JIT).
 * Каждую копию напрямую, мимо Caddy, прогоняем по всем страницам.
 */
async function warmCopies(urls, sessions, rounds = 5) {
  const student = sessions.find((s) => s.role === "student");
  const staffer = sessions.find((s) => s.role === "staff");
  const visits = [...STUDENT_PAGES.map((p) => [p, student.token]), ...STAFF_PAGES.map((p) => [p, staffer.token])];
  await Promise.all(urls.map(async (url) => {
    for (let i = 0; i < rounds; i++) {
      for (const [page, token] of visits) await (await get(url + page, token)).arrayBuffer();
    }
  }));
}

/**
 * Нагрузка через Caddy: `users` «пользователей» без пауз открывают страницы, `sse` потоков событий открыты.
 * Считаются только запросы, начатые и законченные в окне замера (после warmupS).
 */
async function loadRun({ copies, users, sse, warmupS = WARMUP_S, durationS = DURATION_S }, sessions) {
  const students = sessions.filter((s) => s.role === "student");
  const staffers = sessions.filter((s) => s.role === "staff");

  const holders = Array.from({ length: sse }, (_, i) => openStream(BASE, students[i % students.length].token));
  const opened = (await Promise.allSettled(holders.map((h) => h.ready))).filter((r) => r.status === "fulfilled").length;

  const recFrom = Date.now() + warmupS * 1000;
  const recTo = recFrom + durationS * 1000;
  const lat = [];
  const bad = {};
  const perPage = {};
  let ok = 0;

  async function user() {
    while (Date.now() < recTo) {
      const staff = Math.random() < STAFF_SHARE;
      const s = pick(staff ? staffers : students);
      const page = pick(staff ? STAFF_PAGES : STUDENT_PAGES);
      const t0 = Date.now();
      let status = "сеть";
      let size = 0;
      try {
        const res = await get(BASE + page, s.token);
        const body = await res.text();
        size = body.length;
        // Ошибка рендера после начала потока приходит со статусом 200, но с ErrorState — считаем её ошибкой.
        status = res.status === 200 && body.includes("Не получилось загрузить") ? "страница ошибки" : res.status;
      } catch { /* status = "сеть" */ }
      const t1 = Date.now();
      if (t0 >= recFrom && t1 <= recTo) {
        lat.push(t1 - t0);
        if (status === 200) ok++;
        else bad[status] = (bad[status] ?? 0) + 1;
        const p = (perPage[page] ??= { n: 0, ms: 0, chars: 0 });
        p.n++; p.ms += t1 - t0; p.chars += size;
      }
    }
  }

  const statsAt = durationS > 0 ? sleep((warmupS + durationS / 2) * 1000).then(dockerStats) : null;
  await Promise.all(Array.from({ length: users }, user));
  const stats = await statsAt;
  holders.forEach((h) => h.close());
  if (durationS === 0) return null;

  lat.sort((a, b) => a - b);
  const errors = Object.values(bad).reduce((a, b) => a + b, 0);
  return {
    copies, users, durationS, sseOpen: opened, sseAsked: sse,
    requests: lat.length, ok, errors, errorsByStatus: bad,
    rps: +(ok / durationS).toFixed(1),
    latencyMs: { p50: pct(lat, 50), p95: pct(lat, 95), p99: pct(lat, 99), max: lat.at(-1) },
    pages: Object.fromEntries(Object.entries(perPage).map(([p, v]) =>
      [p, { n: v.n, avgMs: Math.round(v.ms / v.n), avgKChars: +(v.chars / v.n / 1000).toFixed(1) }])),
    containers: stats,
  };
}

/** Действие на копии 1 → событие владельцу обращения на копиях 2..N, и только ему. */
async function realtimeCheck(urls, sessions, sql) {
  const students = sessions.filter((s) => s.role === "student");
  const staffer = sessions.find((s) => s.role === "staff");
  const others = urls.slice(1);
  const got = new Map(); // `${url} ${userId}` → [{ text, at }]
  const streams = others.flatMap((url) => students.map((s) =>
    openStream(url, s.token, (text, at) => {
      const key = `${url} ${s.userId}`;
      got.set(key, [...(got.get(key) ?? []), { text, at }]);
    })));
  await Promise.all(streams.map((s) => s.ready));
  log(`  подписаны: ${students.length} студентов × ${others.length} копии (${streams.length} потоков)`);

  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL: urls[0] });
    await context.addCookies([{ name: COOKIE, value: staffer.token, url: urls[0] }]);
    const page = await context.newPage();
    await page.goto("/staff");
    const clickedAt = Date.now();
    await page.getByRole("button", { name: "Взять следующее обращение" }).click();
    await page.waitForURL(/\/staff\/appeals\/[0-9a-f-]{36}/);
    const appealId = new URL(page.url()).pathname.split("/").pop();
    const [{ user_id: owner }] = await sql`
      select s.user_id from appeals a join students s on s.id = a.student_id where a.id = ${appealId}`;

    const deadline = Date.now() + 5000;
    const arrivals = {};
    while (Date.now() < deadline && Object.keys(arrivals).length < others.length) {
      for (const url of others) {
        const hit = (got.get(`${url} ${owner}`) ?? []).find((c) => c.text.includes(appealId));
        if (hit && !(url in arrivals)) arrivals[url] = hit.at - clickedAt;
      }
      await sleep(50);
    }
    const leaked = [...got.entries()]
      .filter(([k, v]) => !k.endsWith(owner) && v.some((c) => c.text.includes(appealId))).length;
    return {
      actionOn: urls[0], appealId,
      arrivedOn: others.map((url) => ({ copy: url, ms: arrivals[url] ?? null })),
      leakedToOtherStudents: leaked,
      ok: others.every((url) => url in arrivals) && leaked === 0,
    };
  } finally {
    await browser.close();
    streams.forEach((s) => s.close());
  }
}

async function environment() {
  const { stdout: ncpu } = await run("docker", ["info", "--format", "{{.NCPU}} {{.MemTotal}}"], { env });
  const [cpus, mem] = ncpu.trim().split(" ").map(Number);
  const { stdout: img } = await run("docker", ["image", "inspect", "nasvyazi-app:latest", "--format", "{{.Created}}"], { env });
  return {
    date: new Date().toISOString(),
    host: `${os.cpus()[0].model.trim()}, ${os.cpus().length} потоков`,
    docker: `${cpus} ядра, ${(mem / 2 ** 30).toFixed(1)} ГБ (ограничение .wslconfig)`,
    image: `nasvyazi-app:latest, собран ${img.trim().slice(0, 16)}`,
    limits: { appCopy: CPUS.APP_CPUS, db: CPUS.DB_CPUS, caddy: CPUS.CADDY_CPUS },
    generator: `node ${process.version} на хосте (вне Docker)`,
    load: { perCopyUsers: PER_COPY, perCopySse: SSE_PER_COPY, durationS: DURATION_S, warmupS: WARMUP_S, burnInS: BURN_IN_S },
    pages: { student: STUDENT_PAGES, staff: STAFF_PAGES, staffShare: STAFF_SHARE },
  };
}

const line = (r) => `${r.rps} стр/с, p50 ${r.latencyMs.p50} мс, p95 ${r.latencyMs.p95} мс, ошибок ${r.errors}, потоков ${r.sseOpen}/${r.sseAsked}`;

async function main() {
  const info = await environment();
  log(`стенд: ${info.docker}; копия ${CPUS.APP_CPUS} ядра, база ${CPUS.DB_CPUS}, Caddy ${CPUS.CADDY_CPUS}`);
  await docker(compose("down", "-v", "--remove-orphans"), { quiet: true });

  const results = [];
  let overload = null;
  let realtime = null;
  let sql;
  try {
    log(`поднимаю ${MAX_N} копии`);
    let urls = await scaleTo(MAX_N);
    sql = postgres(`postgres://nasvyazi:${env.LOAD_DB_PASSWORD}@127.0.0.1:5434/nasvyazi`, { max: 2, onnotice: () => {} });
    const sessions = await createSessions(sql);
    // База стенда только что заполнена, статистики планировщика нет (на сервере её давно собрал autovacuum).
    await sql`analyze`;
    const by = (r) => sessions.filter((s) => s.role === r).length;
    log(`сессии: студентов ${by("student")}, сотрудников ${by("staff")}`);

    log(`прогрев: страницы на каждой копии, затем ${BURN_IN_S} с общей нагрузкой`);
    await warmCopies(urls, sessions);
    await loadRun({ copies: MAX_N, users: PER_COPY * MAX_N, sse: 0, warmupS: BURN_IN_S, durationS: 0 }, sessions);

    if (MAX_N >= 2) {
      log(`живые обновления между копиями (${MAX_N})`);
      realtime = await realtimeCheck(urls, sessions, sql);
      log(`  ${realtime.ok ? "пришло" : "НЕ пришло"}: ${realtime.arrivedOn.map((a) => `${a.copy} — ${a.ms ?? "нет"} мс`).join("; ")}; чужим: ${realtime.leakedToOtherStudents}`);
    }

    for (const n of COPIES) {
      if (urls.length !== n) {
        log(`оставляю ${n} коп., нагрузчик на место ${MAX_N - n}`);
        urls = await scaleTo(n);
        await burner(MAX_N - n);
      }
      const r = await loadRun({ copies: n, users: PER_COPY * n, sse: SSE_PER_COPY * n }, sessions);
      results.push(r);
      log(`копий ${n}, пользователей ${r.users}: ${line(r)}`);
    }

    if (MIN_N < MAX_N) {
      overload = await loadRun({ copies: MIN_N, users: PER_COPY * MAX_N, sse: SSE_PER_COPY * MAX_N }, sessions);
      log(`копий ${MIN_N}, нагрузка ${MAX_N} копий (${overload.users} польз.): ${line(overload)}`);
    }
  } finally {
    await sql?.end();
    await burner(0);
    if (!opt.keep) await docker(compose("down", "-v"), { quiet: true });
  }

  const one = results.find((r) => r.copies === 1) ?? results.at(-1);
  console.log("\n| Копий | Пользователей | Потоков событий | Страниц/с | Рост | p50, мс | p95, мс | p99, мс | Ошибок |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const r of [...results].reverse().concat(overload ? [overload] : [])) {
    console.log(`| ${r.copies} | ${r.users} | ${r.sseOpen} | ${r.rps} | ×${(r.rps / one.rps).toFixed(2)} | ${r.latencyMs.p50} | ${r.latencyMs.p95} | ${r.latencyMs.p99} | ${r.errors} |`);
  }

  await mkdir(path.join(here, "results"), { recursive: true });
  const file = path.join(here, "results", `${info.date.slice(0, 16).replace(/[:T]/g, "-")}.json`);
  await writeFile(file, JSON.stringify({ info, results, overload, realtime }, null, 2) + "\n");
  log(`итог: ${path.relative(process.cwd(), file)}`);
}

main().catch((e) => {
  console.error("Замер прерван:", e.message);
  process.exitCode = 1;
});
