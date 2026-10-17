-- Finish the move to MinIO: drop legacy Vercel Blob asset metadata and the
-- url/pathname columns. The blob bytes (if any) stay orphaned in the Blob store
-- and can be removed there separately. All remaining assets live in MinIO.

DELETE FROM board_assets WHERE object_key IS NULL;

ALTER TABLE board_assets ALTER COLUMN object_key SET NOT NULL;
ALTER TABLE board_assets DROP COLUMN IF EXISTS url;
ALTER TABLE board_assets DROP COLUMN IF EXISTS pathname;
