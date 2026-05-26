import { NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import pool from '@/shared/lib/postgres/client';

// Records metadata for a file already uploaded to Vercel Blob and returns the
// access-controlled proxy URL used as the tldraw asset src. The blob URL itself
// is never exposed to clients.
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

  const { url, pathname, mimeType, byteSize } = (await req.json()) as {
    url?: string;
    pathname?: string;
    mimeType?: string;
    byteSize?: number;
  };
  if (!url || !pathname) return NextResponse.json({ error: 'Missing blob metadata' }, { status: 400 });

  const { rows } = await pool.query(
    `INSERT INTO board_assets (board_id, url, pathname, mime_type, byte_size)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [id, url, pathname, mimeType || 'application/octet-stream', byteSize ?? 0],
  );

  return NextResponse.json({ url: `/api/boards/${id}/assets/${rows[0].id}` });
}
