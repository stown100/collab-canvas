-- Notes panel: notes shared by everyone on the board (owner and members); any
-- member may edit or delete them. A row holds a note's metadata and a
-- plain-text copy of its content (`body`, for search). The rich text of all
-- notes on a board lives in one Yjs document (a fragment per note), stored in
-- board_notes_docs as a merged Yjs update.

CREATE TABLE IF NOT EXISTS board_notes (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  board_id   UUID        NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  body       TEXT        NOT NULL DEFAULT '',
  color      TEXT        NOT NULL DEFAULT 'yellow',
  created_by UUID        REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS board_notes_board_id_created_idx ON board_notes(board_id, created_at DESC);

CREATE TABLE IF NOT EXISTS board_notes_docs (
  board_id   UUID        NOT NULL PRIMARY KEY REFERENCES boards(id) ON DELETE CASCADE,
  state      BYTEA       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
