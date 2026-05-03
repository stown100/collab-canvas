import { NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import pool from '@/shared/lib/postgres/client';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse('Unauthorized', { status: 401 });

  const { id, assetId } = await params;

  const { rowCount: hasAccess } = await pool.query(
    `SELECT 1 FROM boards b
     LEFT JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = $2
     WHERE b.id = $1 AND (b.owner_id = $2 OR bm.user_id IS NOT NULL)`,
    [id, session.user.id],
  );
  if (!hasAccess) return new NextResponse('Forbidden', { status: 403 });

  const { rows } = await pool.query(
    'SELECT mime_type, data FROM board_assets WHERE id = $1 AND board_id = $2',
    [assetId, id],
  );
  if (!rows[0]) return new NextResponse('Not found', { status: 404 });

  const data = rows[0].data as Buffer;
  return new NextResponse(new Uint8Array(data), {
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

  const { rowCount: hasAccess } = await pool.query(
    `SELECT 1 FROM boards b
     LEFT JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = $2
     WHERE b.id = $1 AND (b.owner_id = $2 OR bm.user_id IS NOT NULL)`,
    [id, session.user.id],
  );
  if (!hasAccess) return new NextResponse('Forbidden', { status: 403 });

  await pool.query(
    'DELETE FROM board_assets WHERE id = $1 AND board_id = $2',
    [assetId, id],
  );

  return new NextResponse(null, { status: 204 });
}
