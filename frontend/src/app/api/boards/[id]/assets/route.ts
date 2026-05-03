import { NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import pool from '@/shared/lib/postgres/client';

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { rowCount } = await pool.query(
    `SELECT 1 FROM boards b
     LEFT JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = $2
     WHERE b.id = $1 AND (b.owner_id = $2 OR bm.user_id IS NOT NULL)`,
    [id, session.user.id],
  );
  if (!rowCount) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File too large' }, { status: 413 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const { rows } = await pool.query(
    `INSERT INTO board_assets (board_id, mime_type, data, byte_size)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [id, file.type || 'application/octet-stream', buffer, buffer.length],
  );

  return NextResponse.json({ url: `/api/boards/${id}/assets/${rows[0].id}` });
}
