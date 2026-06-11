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

### Этап 5. Поднять MinIO и схему
- [ ] 19. Запустить MinIO (docker-compose для локалки), создать бакет (`board-assets`), ключи доступа.
- [ ] 20. Env (`backend/.env`): `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, `MINIO_REGION`.
- [ ] 21. Backend: `@aws-sdk/client-s3` (+ `@aws-sdk/s3-request-presigner`), S3-клиент на MinIO.
- [ ] 22. Миграция БД: скорректировать `board_assets` (хранить `bucket`/`object_key` вместо blob `url`/`pathname`).

### Этап 6. Express — загрузка/выдача/удаление файлов
- [ ] 23. `POST /api/boards/:id/assets/presign` — выдать presigned PUT URL на MinIO.
- [ ] 24. `POST /api/boards/:id/assets` — сохранить метаданные (`object_key`, mime, размер), вернуть прокси-URL.
- [ ] 25. `GET /api/boards/:id/assets/:assetId` — стримить объект из MinIO членам доски (S3 `GetObject`).
- [ ] 26. `DELETE` — `DeleteObject` в MinIO + удалить строку в БД.
- [ ] 27. Next.js-роуты `assets` → прокси на Express (auth + членство, дальше с секретом).

### Этап 7. Клиент — переключить аплоад на MinIO
- [ ] 28. В `blobAssetStore.ts` заменить `@vercel/blob` upload на: presigned URL → `PUT` в MinIO → сохранить метаданные. Прогресс-индикатор сохранить.
- [ ] 29. Настроить CORS на бакете MinIO для прямых PUT с браузера.
- [ ] 30. Тесты: дроп картинки/PDF → файл в MinIO, метаданные в БД, отдаётся только членам.

### Этап 8. Вывод Vercel Blob из эксплуатации
- [ ] 31. (Опц.) скрипт миграции существующих файлов из Blob в MinIO.
- [ ] 32. Убрать `@vercel/blob`, `blob/upload/route.ts`, env `BLOB_*`.

---

## ЧАСТЬ D. Надёжность и финал

### Этап 9
- [ ] 33. Ретраи/бэкофф на клиенте при недоступности бэкенда (Liveblocks при этом не «встаёт»).
- [ ] 34. Логи/метрики в Express (записи, ошибки транзакций, ошибки MinIO).
- [ ] 35. `docker-compose` для локалки (Postgres + MinIO + backend).
- [ ] 36. Документация: поток данных, env-переменные, удаление старого прямого-SQL пути и Vercel Blob.

---

## ЧАСТЬ E. Оптимизации на будущее (опционально, по мере роста)

> Реализовывать только если появятся «тяжёлые» доски (десятки тысяч фигур) или заметная задержка открытия.

### Этап 10. Быстрая загрузка больших досок
- [ ] 37. **Снапшот-колонка**: помимо дельт в `board_records`, хранить консолидированный слепок доски (`boards.snapshot JSONB` или отдельная таблица). Тогда загрузка = одно чтение одной строки вместо агрегации многих записей. Обновлять снапшот периодически/по триггеру.
- [ ] 38. **gzip/сжатие** ответа Express на `GET /records` — JSON жмётся в разы.
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
