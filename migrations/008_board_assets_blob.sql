-- Move board asset bytes out of Postgres into Vercel Blob.
-- The table now holds only metadata; the file lives in the blob store and is
-- served through an access-controlled proxy route.
-- Existing test assets are discarded (none worth migrating).

TRUNCATE TABLE board_assets;

ALTER TABLE board_assets DROP COLUMN IF EXISTS data;
ALTER TABLE board_assets ADD COLUMN IF NOT EXISTS url TEXT NOT NULL;
ALTER TABLE board_assets ADD COLUMN IF NOT EXISTS pathname TEXT NOT NULL;
