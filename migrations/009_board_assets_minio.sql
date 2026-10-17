-- Switch board_assets from Vercel Blob (url/pathname) to self-hosted MinIO
-- (object_key). Existing rows keep their url/pathname so the bytes can be
-- migrated later; new uploads only set object_key. url/pathname become nullable
-- so a MinIO-only row is valid.

ALTER TABLE board_assets ADD COLUMN IF NOT EXISTS object_key TEXT;
ALTER TABLE board_assets ALTER COLUMN url DROP NOT NULL;
ALTER TABLE board_assets ALTER COLUMN pathname DROP NOT NULL;
