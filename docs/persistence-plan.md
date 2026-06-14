# План: перенос хранения на свою инфраструктуру

**Ветка:** `feat/self-hosted-persistence`

## Цель

- Все данные доски — в **своём Postgres**.
- Все файлы (картинки/PDF) — в **своём MinIO** (self-hosted S3).
- Все запросы к БД/хранилищу — **только из Express-бэкенда**.
- Авторизация — на Next.js API-роутах. Поток: **браузер → Next.js API (auth) → Express → Postgres/MinIO**. Прямых запросов из браузера в БД нет.
- **Liveblocks остаётся** как живой реал-тайм-слой (синхронизация, курсоры), но **источник правды и загрузки — своя БД**.

## Архитектура

```
┌──────────┐  изменения доски   ┌──────────────┐  внутр. вызов    ┌──────────────┐
│ Браузер  │ ─── (throttled) ──▶│  Next.js API │ ─── + secret ──▶ │   Express    │──▶ Postgres
│ (tldraw) │                    │  (NextAuth:  │                  │  (board_     │   (board_records,
│          │◀── realtime ──┐    │  проверка    │                  │   records)   │    tldraw_schema)
└────┬─────┘   (Liveblocks)│    │  сессии +    │                  └──────┬───────┘
     │                     │    │  членства)   │                         │
     ▼                     │    └──────────────┘                         ▼
  Liveblocks ──────────────┘                                          MinIO (файлы)
  (синхронизация, курсоры)
```

## Заметка про переносимость

- Данные полностью в своей БД → полное владение, переход с Liveblocks/tldraw в будущем возможен.
- Записи хранятся в **формате tldraw** (+ `tldraw_schema`). Смена доски на другую библиотеку = разовая миграция-конвертер, не «переключение тумблера».
- Liveblocks по данным не запирает: это транспорт, а не хранилище правды.

---

## ЧАСТЬ A. Данные доски в свою БД (через Express)

### Этап 0. Конфигурация
- [x] 1. Ветка `feat/self-hosted-persistence` от `main`. ✅
- [x] 2. Env: `backend/.env` → `INTERNAL_API_SECRET`; `frontend/.env.local` → `BACKEND_URL` + тот же `INTERNAL_API_SECRET`. ✅
- [x] 3. Миграция 004 применена (`board_records`, `boards.tldraw_schema`) — подтверждено UI-проверкой. ✅

### Этап 1. Express — запись/чтение данных доски
- [x] 4. Middleware проверки заголовка `x-internal-secret` (без него — 403). → `backend/src/middleware/internalAuth.ts`
- [x] 5. `PATCH /api/boards/:id/records` — транзакционный апсерт. → `backend/src/services/boardRecords.ts`, `backend/src/routes/records.ts`
- [x] 6. `GET /api/boards/:id/records` — все записи доски + `tldraw_schema`. → `backend/src/services/boardRecords.ts`
- [x] 7. Проверка ручек `curl`: 403 без/с неверным секретом, 200 с верным (читает Neon), 204 на PATCH. ✅

### Этап 2. Next.js API — тонкий прокси с авторизацией
- [x] 8. Переписать `PATCH /api/boards/[id]/records`: `auth()` + проверка членства → `fetch(BACKEND_URL…)`. → `frontend/src/app/api/boards/[id]/records/route.ts`
- [x] 9. Добавить `GET /api/boards/[id]/records` (прокси на Express).
- [x] 10. Проверить связку браузер → Next → Express → БД. ✅ (UI-проверка: фигуры сохраняются в `board_records`)

### Этап 3. Клиент — throttled-отправка дельт
- [x] 11. Накопление `upsert`/`remove` в буфер. → `frontend/src/shared/lib/board/boardRecordsSync.ts`
- [x] 12. Throttle (~1.5 сек) → `PATCH` на Next.js-роут вместе с `schema`. → `boardRecordsSync.ts`
- [x] 13. Flush буфера на `visibilitychange` / размонтировании. → `useStorageStore.ts`

---

## ЧАСТЬ B. Загрузка доски из своей БД вместо Liveblocks

> Liveblocks тоже держит свою копию состояния. Чтобы своя БД стала источником правды, делаем «гидрацию»: при «холодном» старте комнаты содержимое берётся из своей БД, а не из старого слепка Liveblocks.

### Этап 4. Гидрация состояния из БД
- [x] 14. При входе запрашиваем `GET /api/boards/[id]/records`. → `frontend/src/shared/lib/board/boardRecordsLoad.ts` (`fetchBoardRecords`)
- [x] 15. «Холодный» старт (`liveRecords.size === 0`) — гидрация tldraw-store + Liveblocks из БД; «тёплый» — живое состояние Liveblocks. → `useStorageStore.ts`
- [x] 16. Применяем `tldraw_schema` из БД через `store.schema.migrateStoreSnapshot`. → `migrateBoardRecords` в `boardRecordsLoad.ts`
  - Защита: `isTldrawRecord` отфильтровывает записи, чей `id` не имеет формы `typeName:...` (чужие/легаси-данные), чтобы один битый record не ломал доску.
- [x] 17. БД — источник правды (полная durable-копия + гидрация cold-room). Примечание: «тёплые» комнаты намеренно читают живой Liveblocks (он сам гидрирован из БД); полный отказ от слепка Liveblocks произойдёт при уходе от Liveblocks.
  - Сидинг store вынесен в эффект с ключами `[room, store, boardId]` и выполняется **один раз** (флаг `cancelled`); presence — в отдельный эффект по `user.*`. Это устраняет повторный `store.clear()` при смене пользователя/StrictMode, который ронял доску (`gridSize`) и пропагировал удаления в Liveblocks/БД.
- [x] 18. Тесты (UI): правки сохраняются в `board_records` и переживают перезагрузку; крэш устранён. ✅

---

## ЧАСТЬ C. Файлы (картинки/PDF): Vercel Blob → MinIO

> Подход выбран: **stream-through-backend** — байты идут браузер → Next.js → Express → MinIO (и загрузка, и выдача). MinIO полностью внутренний, presigned URL и CORS не нужны.

### Этап 5. Поднять MinIO и схему
- [x] 19. `docker-compose.yml` (MinIO + авто-создание бакета `board-assets`). → запуск за пользователем
- [x] 20. Env (`backend/.env`): `MINIO_ENDPOINT`, `MINIO_REGION`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`. ✅
- [x] 21. Backend: `@aws-sdk/client-s3`, S3-клиент на MinIO. → `backend/src/services/storage.ts`
- [x] 22. Миграция `009_board_assets_minio.sql`: `object_key` + `url/pathname` nullable. → применена ✅

### Этап 6. Express — загрузка/выдача/удаление файлов
- [x] 23. `POST /api/boards/:id/assets` — приём файла (raw body) → MinIO put + insert метаданных → `{assetId,url}`. → `backend/src/services/boardAssets.ts`, `backend/src/routes/assets.ts`
- [x] 24. `GET /api/boards/:id/assets/:assetId` — стрим объекта из MinIO. → `boardAssets.ts`/`assets.ts`
- [x] 25. `DELETE /api/boards/:id/assets/:assetId` — `DeleteObject` + удаление строки. → `boardAssets.ts`/`assets.ts`
- [x] 26. Проверка ручек `curl`: 403 без секрета, 415 неподдерж. тип, upload → get (стрим из MinIO) → delete → 404. ✅

### Этап 7. Next.js-прокси + клиент
- [x] 27. Next.js-роуты `assets` (POST/GET/DELETE) → прокси на Express. Общий хелпер `authorizeBoardMember` → `frontend/src/shared/lib/boardBackend.ts` (records-роут переведён на него же).
- [x] 28. Клиент: `minioAssetStore.ts` (XHR-загрузка с прогрессом, прокси-URL); `useStorageStore` переключён; старые `blobAssetStore.ts` и `api/blob/upload` удалены.
- [x] 29. Тесты (UI): дроп картинки → файл в MinIO, строка в `board_assets` с `object_key`, отдаётся участникам (проверено на двух аккаунтах на localhost). ✅

### Этап 8. Вывод Vercel Blob из эксплуатации
- [x] 30. Старые Blob-ассеты удалены (решение: чистый старт). Миграция `010_board_assets_drop_blob.sql`: `DELETE` legacy + `object_key NOT NULL` + удаление колонок `url`/`pathname`. board_assets: 42 → 4. ✅
- [x] 31. Убраны `@vercel/blob` (frontend) и `api/blob/upload`. Env `BLOB_STORE_ID`/`BLOB_READ_WRITE_TOKEN` — убрать из `frontend/.env.local` (за пользователем, не критично).

---

## ЧАСТЬ D. Надёжность и финал

### Этап 9
- [x] 33. Экспоненциальный бэкофф ретраев в `boardRecordsSync` (1.5s→3s→6s… до 30s, сброс при успехе). Liveblocks при недоступности бэкенда не «встаёт». ✅
- [ ] 34. Логи/метрики в Express (записи, ошибки транзакций, ошибки MinIO).
- [ ] 35. `docker-compose` для локалки (Postgres + MinIO + backend).
- [x] 36. Документация: `docs/architecture.md` — компоненты, поток данных, env-переменные, локальный запуск, миграции, прод-заметки. ✅

### Этап 9a. Прод-инфраструктура (деплой)
> Сейчас MinIO живёт только локально в docker — это окружение разработки. В продакшене файлы работать не будут, пока хранилище не поднято на всегда-онлайн сервере.
- [ ] **Поднять MinIO-сервер для прода** на постоянно доступной машине (VPS / отдельный хост), либо взять управляемый S3-совместимый бэкенд (Cloudflare R2 / AWS S3) — код на `@aws-sdk/client-s3` работает с любым без изменений.
  - Закрыть доступ (приватный бакет), HTTPS, отдельный access key (не root).
  - Express должен ходить в это хранилище; прописать прод-значения `MINIO_ENDPOINT`/`MINIO_*`.
- [ ] Задеплоить Express-бэкенд (всегда онлайн, доступен из Next.js); прописать прод `BACKEND_URL` + общий `INTERNAL_API_SECRET`.
- [ ] Проверить сетевой путь: Vercel (Next.js) → Express → MinIO/Postgres из прод-окружения.

---

## ЧАСТЬ E. Оптимизации на будущее (опционально, по мере роста)

> Реализовывать только если появятся «тяжёлые» доски (десятки тысяч фигур) или заметная задержка открытия.

### Этап 10. Быстрая загрузка больших досок
- [ ] 37. **Снапшот-колонка**: помимо дельт в `board_records`, хранить консолидированный слепок доски (`boards.snapshot JSONB` или отдельная таблица). Тогда загрузка = одно чтение одной строки вместо агрегации многих записей. Обновлять снапшот периодически/по триггеру.
- [x] 38. **gzip/сжатие** ответов Express через middleware `compression` (JSON жмётся, бинарные ассеты пропускаются). Проверено: `Content-Encoding: gzip`, 15.0MB → 11.0MB. ✅
- [ ] 39. **Агрегация строк** в один JSON-массив на стороне БД (`jsonb_agg`) — меньше накладных расходов на множество строк.
- [ ] 40. (Крайний случай) ленивая подгрузка записей вне видимой области.

---

## Оценка

| Часть | Сложность | Время |
|---|---|---|
| A. Данные доски в БД | низкая–средняя | ~2 дня |
| B. Загрузка из БД (гидрация) | средняя | ~1–2 дня |
| C. Файлы → MinIO | средняя | ~2–3 дня |
| D. Надёжность/финал | низкая–средняя | ~1 день |
| **Итого** | **средняя** | **~6–8 дней** |

Порядок выполнения: **A → B → C → D**. После каждой части — рабочий результат.
