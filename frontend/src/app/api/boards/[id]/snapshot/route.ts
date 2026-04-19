import { NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import pool from '@/shared/lib/postgres/client';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const content = await req.json();

  const { rowCount } = await pool.query(
    'UPDATE boards SET content = $1, updated_at = now() WHERE id = $2 AND owner_id = $3',
    [content, id, session.user.id],
  );

  if (!rowCount) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return new NextResponse(null, { status: 204 });
}
