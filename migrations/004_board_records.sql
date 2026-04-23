-- Drop old monolithic snapshot column
ALTER TABLE boards DROP COLUMN IF EXISTS content;

-- Store tldraw schema version (one per board, updated on every write)
ALTER TABLE boards ADD COLUMN IF NOT EXISTS tldraw_schema JSONB DEFAULT NULL;

-- Per-record storage for delta saves
CREATE TABLE IF NOT EXISTS board_records (
  board_id   UUID        NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  record_id  TEXT        NOT NULL,
  data       JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, record_id)
);

CREATE INDEX IF NOT EXISTS board_records_board_id_idx ON board_records(board_id);
