import { NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import pool from '@/shared/lib/postgres/client';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { rowCount } = await pool.query(
    'DELETE FROM boards WHERE id = $1 AND owner_id = $2',
    [id, session.user.id],
  );

  if (!rowCount) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return new NextResponse(null, { status: 204 });
}
