# Деплой «На связи» на VPS — пошагово для новичка (Windows)

> **Важно.** Ассистент (ИИ) этот сайт **не деплоил** и **ни на какой сервер не заходил**. Он подготовил файлы
> в папке `deploy/` и проверил весь стек локально в Docker Desktop (HTTPS, вход, ночной сброс, бэкап и
> восстановление). Всё ниже делаешь ты сам, на своём сервере.

Что получится: сайт по адресу вида `https://203-0-113-10.sslip.io`, который открывается из России без VPN.
На сервере работают четыре контейнера:

| Контейнер | Что делает |
|---|---|
| `caddy` | принимает запросы из интернета (порты 80 и 443), сам получает HTTPS-сертификат, сжимает ответы |
| `app` | само приложение (Next.js). Наружу не открыт, только для Caddy и cron |
| `db` | PostgreSQL 17 с урезанной памятью. Наружу не открыт |
| `cron` | в 03:30 МСК делает бэкап базы, в 04:00 МСК возвращает демо-данные к исходному состоянию |

Образ приложения собирается **у тебя на компьютере** и переносится на сервер файлом: на сервере с 1 ГБ памяти
сборка Next.js не поместится.

Обозначения ниже:
- `PS>` — команда в **PowerShell на твоём компьютере** (Windows), в папке проекта `digital-dekanat`;
- `#` — команда **на сервере** (после `ssh`), от пользователя root.

`203.0.113.10` — пример IP. Везде подставляй **IP своего сервера**.

---

## 1. Арендовать VPS

Нужно:
- ОС **Ubuntu 24.04**, архитектура **x86_64 (amd64)** — не ARM;
- **1 vCPU, 1 ГБ RAM**, диск от 10 ГБ;
- публичный **IPv4**-адрес;
- дата-центр в России (чтобы открывалось без VPN).

Подойдут российские провайдеры, например **Beget** или **Timeweb Cloud** (ориентир при планировании —
200–300 ₽/мес, но это из обзоров: **актуальные цены и тарифы проверь на их сайтах**). Если провайдер при создании
сервера предлагает добавить SSH-ключ — сначала сделай шаг 2 и вставь ключ туда.

## 2. SSH-ключ (один раз)

В Windows 11 SSH-клиент уже встроен.

```powershell
PS> ssh-keygen -t ed25519 -C "nasvyazi"
```
На вопросы можно нажимать Enter (пароль к ключу — по желанию). Получатся два файла в `C:\Users\<ты>\.ssh\`:
`id_ed25519` (секретный, никому не отдавать) и `id_ed25519.pub` (публичный). Показать публичный:

```powershell
PS> Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```
Скопируй эту строку в панель провайдера (раздел «SSH-ключи») при создании сервера.

## 3. Первый вход на сервер

```powershell
PS> ssh root@203.0.113.10
```
На вопрос `Are you sure you want to continue connecting` ответь `yes`. Если провайдер выдал только пароль
root — войди с ним и добавь ключ: `# mkdir -p ~/.ssh && nano ~/.ssh/authorized_keys` (вставить строку из
`id_ed25519.pub`, сохранить Ctrl+O, Enter, выйти Ctrl+X).

Обновить систему и включить файрвол (оставляем только SSH и веб):
```bash
# apt-get update && apt-get -y upgrade
# ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp
# ufw --force enable
```

## 4. Установить Docker

Способ из официальной документации Docker для Ubuntu
(https://docs.docker.com/engine/install/ubuntu/ — сверься с ней, если команды поменялись):

```bash
# apt-get install -y ca-certificates curl
# install -m 0755 -d /etc/apt/keyrings
# curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
# chmod a+r /etc/apt/keyrings/docker.asc
# echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" > /etc/apt/sources.list.d/docker.list
# apt-get update
# apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
# docker compose version
```
Последняя команда должна напечатать версию Compose.

Если `download.docker.com` с сервера недоступен — поставь Docker из репозитория Ubuntu:
`# apt-get install -y docker.io docker-compose-v2` (версии там старше, но для этого стека подходят;
проверь `docker compose version`).

## 5. Swap 1 ГБ (подстраховка памяти)

```bash
# fallocate -l 1G /swapfile
# chmod 600 /swapfile
# mkswap /swapfile && swapon /swapfile
# echo '/swapfile none swap sw 0 0' >> /etc/fstab
# free -h
```
В строке `Swap:` должно быть `1.0Gi`. (Если swap уже был у провайдера — этот шаг пропусти.)

## 6. Собрать образы у себя и перенести на сервер

Запусти Docker Desktop. В PowerShell в папке проекта:

```powershell
PS> docker build --platform linux/amd64 -f deploy/Dockerfile -t nasvyazi-app:latest .
PS> docker pull --platform linux/amd64 postgres:17-alpine
PS> docker pull --platform linux/amd64 caddy:2
PS> docker save -o nasvyazi.tar nasvyazi-app:latest postgres:17-alpine caddy:2
```
Переносим все три образа сразу: тогда серверу не нужно ничего скачивать с Docker Hub (из России он бывает
недоступен).

> **Не используй** `docker save ... | ssh ... docker load` в Windows PowerShell 5.1: PowerShell портит двоичные
> данные в конвейере, образ на сервере окажется битым. Только через файл, как здесь.

Создать папку на сервере и скопировать файлы (это **отдельные файлы**, а не всю папку `deploy/`: в ней у тебя
может лежать локальный `.env`, ему на сервере делать нечего):

```powershell
PS> ssh root@203.0.113.10 "mkdir -p /opt/nasvyazi"
PS> scp deploy\docker-compose.yml deploy\Caddyfile deploy\crontab deploy\backup.sh deploy\demo-reset.sh deploy\.env.example root@203.0.113.10:/opt/nasvyazi/
PS> scp nasvyazi.tar root@203.0.113.10:/opt/nasvyazi/
```
На сервере загрузить образы:
```bash
# cd /opt/nasvyazi
# docker load -i nasvyazi.tar
# docker image ls
# rm nasvyazi.tar
```
В списке должны быть `nasvyazi-app`, `postgres` (тег `17-alpine`) и `caddy` (тег `2`).

## 7. Файл `.env` на сервере

Адрес сайта без домена — бесплатный сервис **sslip.io**: имя `203-0-113-10.sslip.io` само указывает на
IP `203.0.113.10`. Правило: возьми IP сервера, **замени точки дефисами**, допиши `.sslip.io`.

```bash
# cd /opt/nasvyazi
# cp .env.example .env
# chmod 600 .env
# sed -i "s/^SITE_HOST=.*/SITE_HOST=203-0-113-10.sslip.io/" .env
# sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" .env
# sed -i "s/^DEMO_RESET_TOKEN=.*/DEMO_RESET_TOKEN=$(openssl rand -hex 32)/" .env
```
Пароль базы и токен сброса сгенерируются случайно и сразу запишутся в файл — их не нужно ни видеть, ни
запоминать. Пароли тестовых учёток в `.env.example` уже совпадают с таблицей в `README.md` (жюри входит
с ними); если поменяешь их в README — поменяй и здесь. Остальное (`DATABASE_URL`, `APP_ORIGIN`,
`COOKIE_SECURE=true`) трогать не нужно.

Проверить, что всё подставилось, **не показывая секреты**:
```bash
# docker compose config --quiet && echo "конфиг в порядке"
# grep -E '^(SITE_HOST|APP_ORIGIN|COOKIE_SECURE)=' .env
```

## 8. Запуск

```bash
# cd /opt/nasvyazi
# docker compose up -d
# docker compose ps
```
Через полминуты у `app` и `db` должен быть статус `(healthy)`. При первом старте приложение само применит
миграции и соберёт демо-мир (в логе: `Миграции применены, база была пустой — демо-мир собран`):
```bash
# docker compose logs app
```

### HTTPS для sslip.io — проверить при первом старте

Caddy сам запрашивает сертификат Let's Encrypt. Смотри лог:
```bash
# docker compose logs caddy | grep -iE "certificate obtained|error"
```
- Есть `certificate obtained successfully` — всё хорошо, переходи к шагу 9.
- Есть ошибки (`rateLimited`, `too many certificates`, `timeout`) — Let's Encrypt не выдал сертификат на
  `sslip.io` (у общего домена бывают лимиты), либо закрыты порты 80/443 (проверь шаг 3 и файрвол в панели
  провайдера). Если дело в лимитах — **купи домен** (любой регистратор, например `.ru`), в его DNS добавь
  **A-запись** на IP сервера (AAAA-запись на IPv6 не добавляй: по IPv6 все посетители будут видны приложению
  под одним адресом и упрутся в общий лимит попыток входа). Через 5–30 минут, когда домен начнёт
  открываться, поменяй **одну переменную** и перезапусти:
  ```bash
  # sed -i "s/^SITE_HOST=.*/SITE_HOST=nasvyazi.example.ru/" .env
  # docker compose up -d
  ```
  (`APP_ORIGIN` подставится из `SITE_HOST` сам.) Ссылку на сайт в работе для конкурса тогда тоже обнови.

## 9. Проверка

С компьютера:
```powershell
PS> curl.exe https://203-0-113-10.sslip.io/api/health
```
Ответ: `{"ok":true}`.

**С телефона через мобильный интернет, без VPN и без Wi-Fi:** открой `https://203-0-113-10.sslip.io`,
войди как Алина (логин и пароль — в `README.md`), открой «Пары» и «Деканат». Потом выйди и войди как Ирина
(сотрудник). Это главная проверка «открывается из России без VPN».

Служебный адрес снаружи закрыт — так и должно быть:
```powershell
PS> curl.exe -X POST https://203-0-113-10.sslip.io/api/internal/demo-reset
```
Ответ: `404`.

## 10. Повседневные команды (на сервере, в `/opt/nasvyazi`)

| Что | Команда |
|---|---|
| Состояние | `docker compose ps` |
| Логи приложения (последние 100 строк) | `docker compose logs --tail 100 app` |
| Логи в реальном времени (выход Ctrl+C) | `docker compose logs -f app caddy` |
| Логи ночного сброса и бэкапа | `docker compose logs cron` |
| Перезапустить приложение | `docker compose restart app` |
| Перезапустить всё | `docker compose restart` |
| Сбросить демо-данные прямо сейчас | `docker compose exec cron sh /deploy/demo-reset.sh` |
| Остановить всё (данные сохранятся) | `docker compose down` |

После перезагрузки сервера контейнеры поднимутся сами (`restart: unless-stopped`).
**Никогда не запускай `docker compose down -v`**: флаг `-v` удаляет базу и сертификаты.

## 11. Обновление сайта

У себя (PowerShell, в папке проекта, с последними изменениями):
```powershell
PS> docker build --platform linux/amd64 -f deploy/Dockerfile -t nasvyazi-app:latest .
PS> docker save -o nasvyazi-app.tar nasvyazi-app:latest
PS> scp nasvyazi-app.tar root@203.0.113.10:/opt/nasvyazi/
```
Если менялись файлы в `deploy/` (кроме `.env.example`) — скопируй их тоже, как в шаге 6.
На сервере:
```bash
# cd /opt/nasvyazi
# docker load -i nasvyazi-app.tar && rm nasvyazi-app.tar
# docker compose up -d
# docker image prune -f
```
`up -d` пересоздаст только то, что изменилось; новые миграции базы применятся при старте приложения.
Перерыв — несколько секунд.

## 12. Бэкап и восстановление

Бэкап делается сам каждый день в 03:30 МСК в `/opt/nasvyazi/backups/` (хранятся 7 последних файлов
`nasvyazi-ГГГГ-ММ-ДД_ЧЧММ.dump`). Сделать бэкап вручную и посмотреть список:
```bash
# docker compose exec cron sh /deploy/backup.sh
# ls -lh backups/
```
Скачать бэкап к себе:
```powershell
PS> scp root@203.0.113.10:/opt/nasvyazi/backups/nasvyazi-2026-11-20_0330.dump .
```
Восстановить базу из бэкапа (на сервере; приложение и cron на это время останавливаем):
```bash
# cd /opt/nasvyazi
# docker compose stop app cron
# docker compose exec -T db pg_restore --clean --if-exists --no-owner -U nasvyazi -d nasvyazi < backups/nasvyazi-2026-11-20_0330.dump
# docker compose start app cron
```
Помни: в 04:00 МСК ночной сброс всё равно вернёт демо-данные к исходному состоянию — для демо-сайта бэкап
нужен на случай, если сломается сама база.

## 13. Если сайт не открывается

1. `docker compose ps` — все четыре контейнера `Up`? Если какой-то перезапускается или `unhealthy`, смотри его
   лог: `docker compose logs --tail 100 <имя>`.
2. `app` в логе пишет `БД пока недоступна` / `Подготовка БД не удалась` — проверь `docker compose logs db`.
   Приложение само повторяет подключение, а если база так и не ответила, завершается, и Docker перезапускает его.
3. `caddy` пишет об ошибках сертификата — см. «HTTPS для sslip.io» в шаге 8.
4. Нет места на диске: `df -h`. Освободить: `docker image prune -f`.
5. Не хватает памяти: `free -h`, `docker stats --no-stream`. Проверь, что swap включён (шаг 5).
6. Сервер вообще не отвечает на `ssh` — перезагрузи его из панели провайдера; контейнеры поднимутся сами.
7. Ошибка `required variable ... is missing` при `docker compose up` — в `.env` не заполнена переменная (шаг 7).

## Чек-лист перед отправкой работы

- [ ] Ссылка `https://…` открывается **с телефона через мобильный интернет без VPN**, замок в адресной строке
      есть (сертификат настоящий, без предупреждений).
- [ ] Вход работает для всех трёх тестовых учёток из `README.md` (Алина, Денис — студенты; Ирина — сотрудник).
- [ ] `https://…/api/health` отвечает `{"ok":true}`.
- [ ] Ночной сброс запланирован: `docker compose ps` показывает `cron` в состоянии `Up`;
      на следующий день в `docker compose logs cron` есть строка `demo-reset: ok, демо-мир пересобран` (около 04:00 МСК)
      и строка бэкапа `backup: ok` (около 03:30 МСК).
- [ ] Ссылка в README и в описании работы совпадает с реальным адресом (`SITE_HOST`).
- [ ] Сервер оплачен **как минимум до 28 ноября** включительно.
