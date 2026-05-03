CREATE TABLE IF NOT EXISTS board_assets (
  id         UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  board_id   UUID         NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  mime_type  TEXT         NOT NULL,
  data       BYTEA        NOT NULL,
  byte_size  INTEGER      NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS board_assets_board_id_idx ON board_assets(board_id);
