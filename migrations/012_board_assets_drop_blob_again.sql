-- Re-apply 010 now that production serves every asset from R2 through the
-- Express backend (011 had restored the Blob columns while prod still ran the
-- Vercel Blob code). Blob-only rows can no longer be served and are removed;
-- object_key becomes required again.

DELETE FROM board_assets WHERE object_key IS NULL;

ALTER TABLE board_assets ALTER COLUMN object_key SET NOT NULL;
ALTER TABLE board_assets DROP COLUMN IF EXISTS url;
ALTER TABLE board_assets DROP COLUMN IF EXISTS pathname;
