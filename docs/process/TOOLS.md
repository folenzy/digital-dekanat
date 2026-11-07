# Инструменты, IDE и сервисы

Обновляется по ходу работы.

| Инструмент | Для чего использован |
|---|---|
| **Claude Code** (десктоп-приложение, Windows) | Основной ИИ-ассистент: брейншторм, спецификация, план, весь код, тесты, документы |
| Модель Claude Sonnet 5.5 (`claude-sonnet-5-5`) | Этап 0: исследование хостинга, мастер-промпт |
| Модель Claude Opus 5.5 (`claude-opus-5-5`) | Начиная с этапа 1: брейншторм, дизайн, реализация |
| Скилл `superpowers:brainstorming` | Вопросы по одному, выбор подхода, дизайн-документ, визуальный компаньон с макетами |
| Визуальный компаньон (сервер из скилла brainstorming) | Показ трёх вариантов стиля на макетах телефона |
| Субагент general-purpose («builder check») | Независимая проверка спеки глазами исполнителя |
| WebSearch (в Claude Code) | Исследование хостинга и блокировок в РФ |
| curl + Google Fonts CSS API | Проверка, есть ли у шрифтов кириллица |
| Встроенный браузер Claude Code | Просмотр макетов и проверка интерфейса |
| Git | Контроль версий, коммиты небольшими шагами |
| Docker | Локальная PostgreSQL, сборка образа для VPS |

Планируется: `superpowers:writing-plans`, `superpowers:test-driven-development`, `frontend-design`, `webapp-testing` (Playwright для Node), `security-review`, `superpowers:verification-before-completion`, субагенты для параллельных задач.
