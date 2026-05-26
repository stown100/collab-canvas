import { NextResponse } from 'next/server';
import { get, del } from '@vercel/blob';
import { auth } from '@/shared/lib/auth';
import pool from '@/shared/lib/postgres/client';

async function hasBoardAccess(boardId: string, userId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM boards b
     LEFT JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = $2
     WHERE b.id = $1 AND (b.owner_id = $2 OR bm.user_id IS NOT NULL)`,
    [boardId, userId],
  );
  return Boolean(rowCount);
}

// Streams a private blob to board members only. The blob is stored with
// `access: 'private'`, so it cannot be read without the store token even if its
// URL leaks — access is enforced here by board membership.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse('Unauthorized', { status: 401 });

  const { id, assetId } = await params;
  if (!(await hasBoardAccess(id, session.user.id))) return new NextResponse('Forbidden', { status: 403 });

  const { rows } = await pool.query(
    'SELECT pathname, mime_type FROM board_assets WHERE id = $1 AND board_id = $2',
    [assetId, id],
  );
  if (!rows[0]) return new NextResponse('Not found', { status: 404 });

  const blob = await get(rows[0].pathname, { access: 'private' });
  if (!blob?.stream) return new NextResponse('Not found', { status: 404 });

  return new NextResponse(blob.stream, {
    headers: {
      'Content-Type': rows[0].mime_type,
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse('Unauthorized', { status: 401 });

  const { id, assetId } = await params;
  if (!(await hasBoardAccess(id, session.user.id))) return new NextResponse('Forbidden', { status: 403 });

  const { rows } = await pool.query(
    'SELECT url FROM board_assets WHERE id = $1 AND board_id = $2',
    [assetId, id],
  );
  if (rows[0]) {
    await del(rows[0].url).catch(() => {});
    await pool.query('DELETE FROM board_assets WHERE id = $1 AND board_id = $2', [assetId, id]);
  }

  return new NextResponse(null, { status: 204 });
}
