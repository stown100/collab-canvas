# Архитектура и запуск

Collab Canvas — совместная доска (tldraw). Данные принадлежат приложению:

- **Содержимое доски** (фигуры, текст, позиции) → свой **Postgres** (постоянное хранение) + **Liveblocks** (реал-тайм-транспорт).
- **Файлы** (картинки / страницы PDF) → self-hosted **MinIO**.
- Любой доступ к БД и хранилищу идёт **только через Express-бэкенд**; браузер никогда не обращается к ним напрямую.

## Компоненты

| Компонент | Роль |
|---|---|
| **Frontend (Next.js)** | UI + API-роуты, которые аутентифицируют (NextAuth) и проксируют запросы на бэкенд |
| **Backend (Express)** | Единственный слой, который ходит в Postgres и MinIO. Защищён внутренним секретом |
| **Postgres (Neon)** | `boards`, `board_members`, `board_records` (записи tldraw), `board_assets` (метаданные файлов), таблицы авторизации |
| **MinIO** | Объектное хранилище для байтов файлов (локально — в docker) |
| **Liveblocks** | Реал-тайм-синхронизация (курсоры, живой документ) — только транспорт; источник правды — своя БД |

## Поток данных

```
                         ┌──────────────┐  x-internal-secret   ┌──────────┐
  Браузер ──────────────▶│  Next.js API │ ───────────────────▶ │ Express  │──▶ Postgres
  (tldraw)   /api/...     │  (NextAuth + │                      │ (только  │──▶ MinIO
       ▲                  │   членство)  │                      │  он БД/  │
       │   realtime       └──────────────┘                      │ хранилище)│
       └──── Liveblocks ◀──────────────────────────────────────└──────────┘
```

### Содержимое доски (records)
- **Загрузка:** браузер → `GET /api/boards/[id]/records` → Express → Postgres. «Холодная» комната гидрируется из БД; «тёплая» использует живое состояние Liveblocks.
- **Сохранение:** локальное изменение tldraw → батчинг (throttle + бэкофф при сбое) → `PATCH /api/boards/[id]/records` → Express → `board_records` (+ `tldraw_schema`). Параллельно уходит в Liveblocks для реал-тайма.

### Файлы (assets)
- **Загрузка:** браузер (XHR, прогресс) → `POST /api/boards/[id]/assets` → Express → MinIO + `board_assets`. Возвращает прокси-URL.
- **Выдача:** `<img src=прокси-URL>` → `GET /api/boards/[id]/assets/[assetId]` → Express стримит объект из MinIO (только участникам).
- **Удаление:** → `DELETE` → Express → MinIO + БД.

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
| `MINIO_ENDPOINT`, `MINIO_REGION`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET` | Доступ к MinIO |

### `docker-compose.yml` (MinIO, опционально)
`MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_BUCKET` — по умолчанию `minioadmin` / `minioadmin` / `board-assets`.

## Локальный запуск

```bash
# 1. Поднять MinIO (создаёт бакет board-assets). Консоль: http://localhost:9001
docker compose up -d

# 2. Применить миграции (migrations/*.sql) к своему Postgres

# 3. Бэкенд → http://localhost:4000
cd backend && npm install && npm run dev

# 4. Фронтенд → http://localhost:3000
cd frontend && npm install && npm run dev
```

> Остановка docker останавливает MinIO → файлы временно недоступны (содержимое доски при этом работает через Postgres/Liveblocks). Файлы хранятся в томе `minio-data`; `docker compose down -v` удалит их безвозвратно.

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

## Прод

Локально MinIO живёт в docker (окружение разработки). Для продакшена нужно:
- поднять MinIO (или S3/R2) на всегда-онлайн сервере, прописать прод `MINIO_*`;
- задеплоить Express (доступен из Next.js), прописать прод `BACKEND_URL` + `INTERNAL_API_SECRET`.

Подробнее — в [persistence-plan.md](persistence-plan.md), раздел «Этап 9a».
