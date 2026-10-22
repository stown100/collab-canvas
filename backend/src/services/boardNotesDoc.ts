import * as Y from 'yjs';
import { getPool } from './db';

// The content of a board's notes: one Yjs document per board, a fragment per
// note (`note-<id>`). Clients edit it live through Liveblocks and send their
// local Yjs updates here; the stored state is the merge of all of them, so
// concurrent saves from different members never overwrite each other.

const EMPTY_DOC = Buffer.from(Y.encodeStateAsUpdate(new Y.Doc()));

// Merges updates into a fresh document and re-encodes it, which also drops the
// content of deleted text (Yjs garbage collection) so the state stays compact.
function mergeCompact(updates: Uint8Array[]): Uint8Array {
  const doc = new Y.Doc();
  for (const update of updates) Y.applyUpdate(doc, update);
  return Y.encodeStateAsUpdate(doc);
}

export async function getNotesDoc(boardId: string): Promise<Buffer> {
  const { rows } = await getPool().query('SELECT state FROM board_notes_docs WHERE board_id = $1', [boardId]);
  return rows[0]?.state ?? EMPTY_DOC;
}

// Expects a valid Yjs update.
export async function applyNotesDocUpdate(boardId: string, update: Uint8Array): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    // Create the row on first save, then lock it so concurrent merges queue up.
    await client.query(
      'INSERT INTO board_notes_docs (board_id, state) VALUES ($1, $2) ON CONFLICT (board_id) DO NOTHING',
      [boardId, EMPTY_DOC],
    );
    const { rows } = await client.query('SELECT state FROM board_notes_docs WHERE board_id = $1 FOR UPDATE', [boardId]);
    const merged = mergeCompact([rows[0].state, update]);
    await client.query(
      'UPDATE board_notes_docs SET state = $2, updated_at = now() WHERE board_id = $1',
      [boardId, Buffer.from(merged)],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
