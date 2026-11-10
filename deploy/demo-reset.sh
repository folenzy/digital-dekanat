#!/bin/sh
# Ночной сброс демо-мира (cron-контейнер, 04:00 МСК, см. deploy/crontab):
# POST http://app:3000/api/internal/demo-reset с заголовком x-reset-token.
# Снаружи маршрут закрыт (Caddy отвечает 404), сюда идём по внутренней сети Docker.
# Токен берётся из окружения контейнера. Запрос собирает встроенный в shell printf и отправляет nc,
# поэтому токен не попадает ни в аргументы процессов (их видно в ps на сервере), ни в лог:
# печатаем только строку статуса ответа. Ответ приходит, когда сброс уже закончен.
set -u

log() { echo "$(date '+%F %T %Z') demo-reset: $*"; }

tmp=$(mktemp -d)
trap 'kill "$keeper" 2>/dev/null; rm -rf "$tmp"' EXIT
mkfifo "$tmp/request"

# busybox nc выходит сразу, как только кончается ввод, и ответа не дождался бы, а пока ввод открыт —
# не выходит и после ответа. Поэтому ввод держит sleep, а прочитав строку статуса, мы его завершаем.
(
  printf 'POST /api/internal/demo-reset HTTP/1.1\r\nHost: app:3000\r\nx-reset-token: %s\r\nContent-Length: 0\r\nConnection: close\r\n\r\n' \
    "$DEMO_RESET_TOKEN"
  exec sleep 130
) > "$tmp/request" &
keeper=$!

status=$(nc -w 120 app 3000 < "$tmp/request" | {
  IFS= read -r line
  kill "$keeper" 2>/dev/null
  printf '%s' "$line" | tr -d '\r'
})

case "$status" in
  "HTTP/1.1 200"*) log "ok, демо-мир пересобран" ;;
  *) log "ОШИБКА: ${status:-нет ответа от app}"; exit 1 ;;
esac
