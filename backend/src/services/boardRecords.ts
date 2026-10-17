import { getPool } from './db';

// One incremental save: records to upsert, record ids to remove, and the
// current tldraw schema version. Shape matches what the client batches up.
export interface RecordsDelta {
  schema: unknown;
  upsert: Array<{ id: string;[key: string]: unknown }>;
  remove: string[];
}

export interface BoardRecordsSnapshot {
  records: unknown[];
  schema: unknown;
}

// Persist a delta of board records in a single transaction. Authorization is
// assumed to have happened upstream (Next.js); this only writes.
export async function saveRecords(boardId: string, delta: RecordsDelta): Promise<void> {
  const upsert = delta.upsert ?? [];
  const remove = delta.remove ?? [];

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    if (upsert.length > 0) {
      await client.query(
        `INSERT INTO board_records (board_id, record_id, data)
         SELECT $1, r->>'id', r
         FROM jsonb_array_elements($2::jsonb) r
         ON CONFLICT (board_id, record_id)
         DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [boardId, JSON.stringify(upsert)],
      );
    }

    if (remove.length > 0) {
      await client.query(
        'DELETE FROM board_records WHERE board_id = $1 AND record_id = ANY($2)',
        [boardId, remove],
      );
    }

    await client.query(
      'UPDATE boards SET tldraw_schema = $1, updated_at = now() WHERE id = $2',
      [JSON.stringify(delta.schema), boardId],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Load every record for a board plus its stored tldraw schema, used to hydrate
// the board on open.
export async function loadRecords(boardId: string): Promise<BoardRecordsSnapshot> {
  const pool = getPool();
  const [recordsRes, schemaRes] = await Promise.all([
    pool.query('SELECT data FROM board_records WHERE board_id = $1', [boardId]),
    pool.query('SELECT tldraw_schema FROM boards WHERE id = $1', [boardId]),
  ]);

  return {
    records: recordsRes.rows.map((row) => row.data),
    schema: schemaRes.rows[0]?.tldraw_schema ?? null,
  };
}
