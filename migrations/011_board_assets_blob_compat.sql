-- Undo the column drop from 010 while production still runs the Vercel Blob
-- code from main, which reads and writes url/pathname directly. Restores the
-- 009 state that both the Blob (main) and MinIO (Express) code work with:
-- Blob rows set url/pathname, MinIO rows set object_key. Re-drop the Blob
-- columns only after production serves assets through the Express backend.

ALTER TABLE board_assets ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE board_assets ADD COLUMN IF NOT EXISTS pathname TEXT;
ALTER TABLE board_assets ALTER COLUMN object_key DROP NOT NULL;
