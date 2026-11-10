#!/bin/sh
# Ежедневный бэкап базы (cron-контейнер, 03:30 МСК, см. deploy/crontab).
# pg_dump в формате custom кладёт файл в /backups — на сервере это папка backups/ рядом с docker-compose.yml.
# Хранятся 7 последних дампов. Подключение — из переменных PGHOST/PGUSER/PGDATABASE/PGPASSWORD контейнера.
# Восстановление: docs/DEPLOY.md, раздел «Бэкап и восстановление».
# Вручную: docker compose exec cron sh /deploy/backup.sh
set -eu

# Дамп — вся база, в том числе хеши паролей: файлы доступны только владельцу.
umask 077

dir=/backups
keep=7
name="nasvyazi-$(date +%Y-%m-%d_%H%M).dump"

log() { echo "$(date '+%F %T %Z') backup: $*"; }

# Пишем во временный файл: недописанный дамп не должен выглядеть как готовый.
if pg_dump --format=custom --no-owner --file="$dir/$name.part"; then
  mv "$dir/$name.part" "$dir/$name"
  log "ok $name ($(du -h "$dir/$name" | cut -f1))"
else
  rm -f "$dir/$name.part"
  log "ОШИБКА: pg_dump не удался"
  exit 1
fi

# Имена начинаются с даты, поэтому сортировка по имени — по времени. Оставляем $keep последних.
ls -1 "$dir"/nasvyazi-*.dump | sort -r | tail -n +$((keep + 1)) | while read -r old; do
  rm -f "$old"
  log "удалён старый $(basename "$old")"
done
