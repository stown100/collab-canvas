# Архитектура и запуск

Collab Canvas — совместная доска (tldraw). Данные принадлежат приложению:

- **Содержимое доски** (фигуры, текст, позиции) → свой **Postgres** (постоянное хранение) + **Liveblocks** (реал-тайм-транспорт).
- **Файлы** (картинки / страницы PDF) → S3-совместимое хранилище **Cloudflare R2** (код работает и с self-hosted MinIO).
- Любой доступ к БД и хранилищу идёт **только через Express-бэкенд**; браузер никогда не обращается к ним напрямую.

## Компоненты

| Компонент | Роль |
|---|---|
| **Frontend (Next.js)** | UI + API-роуты, которые аутентифицируют (NextAuth) и проксируют запросы на бэкенд |
| **Backend (Express)** | Единственный слой, который ходит в Postgres и хранилище файлов. Защищён внутренним секретом |
| **Postgres (Neon)** | `boards`, `board_members`, `board_records` (записи tldraw), `board_assets` (метаданные файлов), `board_notes` + `board_notes_docs` (заметки доски и их текст в Yjs), таблицы авторизации |
| **Cloudflare R2** | Приватный бакет `board-assets` для байтов файлов; локально и на проде — один и тот же |
| **Liveblocks** | Реал-тайм-синхронизация (курсоры, живой документ) — только транспорт; источник правды — своя БД |

## Поток данных

```
                         ┌──────────────┐  x-internal-secret   ┌──────────┐
  Браузер ──────────────▶│  Next.js API │ ───────────────────▶ │ Express  │──▶ Postgres
  (tldraw)   /api/...     │  (NextAuth + │                      │ (только  │──▶ R2
       ▲                  │   членство)  │                      │  он БД/  │
       │   realtime       └──────────────┘                      │ хранилище)│
       └──── Liveblocks ◀──────────────────────────────────────└──────────┘
```

### Содержимое доски (records)
- **Загрузка:** браузер → `GET /api/boards/[id]/records` → Express → Postgres. «Холодная» комната (пустой Liveblocks) гидрируется из БД. «Тёплая» открывается сразу из живого состояния Liveblocks, а копия в БД **сверяется в фоне**: недостающие/изменённые записи дописываются, удалённые с доски — удаляются (`diffBoardRecords`). Так БД догоняет правки, которые до неё не дошли (клиент без сохранения в БД, неудачный запрос, закрытая вкладка).
- **Сохранение:** локальное изменение tldraw → батчинг (throttle + бэкофф при сбое) → `PATCH /api/boards/[id]/records` → Express → `board_records` (+ `tldraw_schema`). Параллельно уходит в Liveblocks для реал-тайма.

### Файлы (assets)
- **Загрузка:** браузер (XHR, прогресс) → `POST /api/boards/[id]/assets` → Express → R2 + `board_assets`. Возвращает прокси-URL. На Vercel тело запроса ограничено 4.5 MB.
- **Выдача:** `<img src=прокси-URL>` → `GET /api/boards/[id]/assets/[assetId]` → Express стримит объект из R2 (только участникам).
- **Удаление:** → `DELETE` → Express → R2 + БД.

### Заметки (notes)
Панель «Notes» справа (кнопка в шапке доски). Заметки общие: их видят и могут править/удалять все участники доски (владелец и `board_members`). Каждая заметка — одно поле с форматированием (TipTap), редактируется прямо в списке; сверху всегда пустая заметка — начал печатать, и она создана.
- **Текст (совместное редактирование):** весь текст заметок доски — один Yjs-документ в той же комнате Liveblocks, что и доска (фрагмент `note-<id>` на заметку). Правки сливаются посимвольно, видны курсоры участников.
- **Сохранение текста:** клиент копит свои локальные Yjs-обновления (батчинг + бэкофф) → `POST /api/boards/[id]/notes/doc` (бинарно) → Express **сливает** их с сохранённым состоянием → `board_notes_docs` (одна строка на доску). Одновременные сохранения не затирают друг друга. При открытии панели состояние из БД вливается в живой документ (холодная комната), а то, чего в БД не хватает, дописывается.
- **Метаданные:** `/api/boards/[id]/notes` (`GET`, `POST`) и `/api/boards/[id]/notes/[noteId]` (`PATCH`, `DELETE`) → `board_notes`: цвет, автор / последний редактор, время и `body` — текстовая копия для поиска. id новой заметки генерирует клиент. Next.js передаёт id пользователя заголовком `x-user-id`.
- **Реал-тайм списка:** после изменения метаданных клиент шлёт в комнату событие `notes-changed` (без данных), остальные перечитывают список из БД.

## Авторизация и доступ
- Сессия NextAuth на Next.js-роутах; проверка членства (владелец или `board_members`).
- Next.js → Express защищён заголовком `x-internal-secret` (общий `INTERNAL_API_SECRET`).
- Доступ к комнате Liveblocks выдаётся в `/api/liveblocks-auth`.

## Переменные окружения

### `frontend/.env.local`
| Переменная | Назначение |
|---|---|
| `DATABASE_URL` | Postgres (проверки членства/авторизации в Next.js-роутах) |
| `NEXTAUTH_URL`, `AUTH_SECRET` | NextAuth |
| `GOOGLE_CLIENT_ID/SECRET`, `YANDEX_CLIENT_ID/SECRET` | OAuth-провайдеры |
| `NEXT_PUBLIC_TLDRAW_LICENSE_KEY` | Лицензия tldraw |
| `LIVEBLOCKS_SECRET_KEY` | Серверная авторизация Liveblocks |
| `BACKEND_URL` | Базовый URL Express (напр. `http://localhost:4000`) |
| `INTERNAL_API_SECRET` | Общий секрет Next.js → Express |

### `backend/.env`
| Переменная | Назначение |
|---|---|
| `PORT` | Порт Express (по умолчанию 4000) |
| `FRONTEND_URL` | Источник для CORS |
| `DATABASE_URL` | Postgres |
| `INTERNAL_API_SECRET` | Должен совпадать с фронтендом |
| `MINIO_ENDPOINT`, `MINIO_REGION`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET` | Доступ к S3-совместимому хранилищу. Сейчас — **Cloudflare R2**: `MINIO_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, `MINIO_REGION=auto`, бакет `board-assets`. Для локального MinIO — `http://localhost:9000` |

### `docker-compose.yml` (локальный MinIO, опционально)
Не нужен, пока `MINIO_*` смотрят в R2. Пригодится для полностью офлайн-разработки: `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_BUCKET` — по умолчанию `minioadmin` / `minioadmin` / `board-assets`.

## Локальный запуск

```bash
# 1. Применить миграции (migrations/*.sql) к своему Postgres

# 2. Бэкенд → http://localhost:4000
cd backend && npm install && npm run dev

# 3. Фронтенд → http://localhost:3000
cd frontend && npm install && npm run dev
```

> Локальная версия работает с **той же** базой Neon, тем же бакетом R2 и теми же комнатами Liveblocks, что и прод: правки локально сразу видны на сайте, и наоборот. Поэтому миграции должны быть совместимы с кодом, который сейчас на проде.

## Миграции БД

| Файл | Что делает |
|---|---|
| `001_nextauth_tables.sql` | Таблицы NextAuth |
| `002_boards_table.sql` | `boards` |
| `003_board_content.sql` | Ранний контент доски |
| `004_board_records.sql` | `board_records` (дельты) + `boards.tldraw_schema` |
| `005_board_members.sql` | `board_members` |
| `006_board_assets.sql` | `board_assets` |
| `007_user_password.sql` | Пароль пользователя |
| `008_board_assets_blob.sql` | Перенос байтов ассетов в Vercel Blob |
| `009_board_assets_minio.sql` | `object_key` (MinIO), `url`/`pathname` → nullable |
| `010_board_assets_drop_blob.sql` | Удаление legacy-Blob и колонок `url`/`pathname` |
| `011_board_assets_blob_compat.sql` | Возврат `url`/`pathname` (nullable) и nullable `object_key`, пока прод на Blob-коде из `main` |
| `012_board_assets_drop_blob_again.sql` | Повтор `010` после перевода прода на R2: удаление Blob-строк и колонок `url`/`pathname`, `object_key NOT NULL` |
| `013_board_notes.sql` | `board_notes` (метаданные заметок: цвет, автор / последний редактор, текстовая копия для поиска) и `board_notes_docs` (Yjs-документ с текстом заметок, одна строка на доску) |

> Миграции, удаляющие колонки (как `010`), применяются к прод-БД только **после** деплоя кода, который эти колонки больше не использует. Иначе прод, работающий на старом коде, падает.

## Прод

Оба приложения на Vercel, деплой — автоматически при пуше в `main`:

| Проект Vercel | Root Directory | Домен | Переменные |
|---|---|---|---|
| `collab-canvas-frontend` | `frontend` | `collab-canvas-frontend-two.vercel.app` | как в `frontend/.env.local`; `BACKEND_URL=https://collab-canvas-snowy.vercel.app` |
| `collab-canvas-backend` | `backend` | `collab-canvas-snowy.vercel.app` | как в `backend/.env` (R2 в `MINIO_*`) |

- На Vercel `backend/src/index.ts` экспортирует `app` как serverless-функцию (без WebSocket), локально — обычный HTTP-сервер.
- Браузер к Express не обращается, поэтому отдельный адрес бэкенда пользователям не виден. Без `x-internal-secret` бэкенд отвечает 403.
- Переменные заданы только для Production — превью-деплои без них не собираются/не работают.

Подробнее — в [persistence-plan.md](persistence-plan.md), раздел «Этап 9a».
