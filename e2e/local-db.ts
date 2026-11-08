// Защита от сноса чужих данных: e2e пересобирает демо-мир (TRUNCATE всех таблиц),
// поэтому разрешён только для БД на этой машине. Адрес в ошибку не попадает: в нём пароль.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Бросает, если адрес БД не локальный (localhost, 127.0.0.1, [::1], *.localhost) или не разбирается. */
export function assertLocalDatabaseUrl(url: string | undefined): void {
  let host = "";
  try {
    host = new URL(url ?? "").hostname.toLowerCase();
  } catch {
    host = "";
  }
  if (!LOCAL_HOSTS.has(host) && !host.endsWith(".localhost")) {
    throw new Error(
      "Сброс демо-мира в e2e разрешён только для локальной БД (localhost, 127.0.0.1, [::1], *.localhost). " +
        "Проверь DATABASE_URL в .env или окружении.",
    );
  }
}
