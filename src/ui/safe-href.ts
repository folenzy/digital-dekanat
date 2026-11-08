// Проверка ссылок из данных (уведомления, события): годится и для сервера, и для клиента.

/** Только относительные ссылки на этот же сайт: "/x", но не "//host" и не "/\host". */
export function isSafeHref(href: unknown): href is string {
  // Без пробелов и управляющих символов: парсер URL вырезает tab/CR/LF, и "/<tab>/host" стал бы "//host".
  if (typeof href !== "string" || !/^\/(?![\/\x5c])[^\x00-\x20\x7f]*$/.test(href)) return false;
  if (typeof location === "undefined") return true;
  try {
    return new URL(href, location.origin).origin === location.origin;
  } catch {
    return false;
  }
}
