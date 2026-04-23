import { NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import pool from '@/shared/lib/postgres/client';

interface RecordsDelta {
  schema: unknown;
  upsert: Array<{ id: string;[key: string]: unknown }>;
  remove: string[];
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { schema, upsert, remove } = (await req.json()) as RecordsDelta;

  const { rowCount } = await pool.query(
    'SELECT 1 FROM boards WHERE id = $1 AND owner_id = $2',
    [id, session.user.id],
  );
  if (!rowCount) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (upsert.length > 0) {
      await client.query(
        `INSERT INTO board_records (board_id, record_id, data)
         SELECT $1, r->>'id', r
         FROM jsonb_array_elements($2::jsonb) r
         ON CONFLICT (board_id, record_id)
         DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [id, JSON.stringify(upsert)],
      );
    }

    if (remove.length > 0) {
      await client.query(
        'DELETE FROM board_records WHERE board_id = $1 AND record_id = ANY($2)',
        [id, remove],
      );
    }

    await client.query(
      'UPDATE boards SET tldraw_schema = $1, updated_at = now() WHERE id = $2',
      [JSON.stringify(schema), id],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return new NextResponse(null, { status: 204 });
}
