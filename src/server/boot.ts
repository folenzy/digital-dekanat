import postgres from "postgres";
import { runMigrations } from "./db/migrate";
import { resetDemo } from "./demo/world";

// Подготовка базы при старте сервера (src/instrumentation.ts): дождаться БД, применить миграции,
// на пустой базе собрать демо-мир. Пока это не закончится, Next не принимает запросы.

/** Паузы между попытками достучаться до БД при старте, мс: всего около минуты. */
export const BOOT_RETRY_DELAYS_MS: readonly number[] = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000];

/** Ключ advisory-блокировки: копии приложения (`--scale app=N`) готовят базу по очереди, сид — один раз. */
const BOOT_LOCK_KEY = 0x6e735f62; // «ns_b»

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type RetryOptions = {
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (nextAttempt: number, delayMs: number, error: unknown) => void;
};

/** Вызывает fn; после ошибки ждёт очередную паузу и пробует снова. Паузы кончились — последняя ошибка. */
export async function retry<T>(
  fn: () => Promise<T>,
  delaysMs: readonly number[],
  { sleep = defaultSleep, onRetry }: RetryOptions = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= delaysMs.length) throw e;
      onRetry?.(attempt + 2, delaysMs[attempt], e);
      await sleep(delaysMs[attempt]);
    }
  }
}

/** Только код ошибки (ECONNREFUSED, 57P03…): ни адреса БД, ни пароля в логе. */
const errorCode = (e: unknown) => String((e as { code?: unknown })?.code ?? "без кода");

export type PrepareOptions = {
  /** Собрать демо-мир; вызывается, только если в базе нет ни одного пользователя. */
  seed: () => Promise<void>;
  delaysMs?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
};

/**
 * Ждёт БД (временная недоступность при старте — не повод падать), затем под advisory-блокировкой
 * применяет миграции и, если пользователей нет, вызывает seed. Если БД так и не ответила — ошибка:
 * процесс завершится, и Docker перезапустит контейнер (restart: unless-stopped).
 */
export async function prepareDatabase(url: string, opts: PrepareOptions): Promise<"seeded" | "ready"> {
  const { seed, delaysMs = BOOT_RETRY_DELAYS_MS, sleep, log = console.log } = opts;
  const sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 10 });
  try {
    await retry(() => sql`select 1`, delaysMs, {
      sleep,
      onRetry: (next, ms, e) => log(`БД пока недоступна (${errorCode(e)}), попытка ${next} через ${ms} мс`),
    });
    await sql`select pg_advisory_lock(${BOOT_LOCK_KEY})`;
    try {
      await runMigrations(url);
      const [{ empty }] = await sql<{ empty: boolean }[]>`select not exists (select 1 from users) as empty`;
      if (!empty) return "ready";
      await seed();
      return "seeded";
    } finally {
      await sql`select pg_advisory_unlock(${BOOT_LOCK_KEY})`;
    }
  } finally {
    await sql.end();
  }
}

/** Точка входа для src/instrumentation.ts (только рантайм Node). */
export async function bootDatabase(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL не задан");
  const result = await prepareDatabase(url, { seed: () => resetDemo() });
  console.log(result === "seeded" ? "Миграции применены, база была пустой — демо-мир собран" : "Миграции применены");
}
