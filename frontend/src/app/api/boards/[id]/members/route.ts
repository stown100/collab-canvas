import { NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import pool from '@/shared/lib/postgres/client';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: boardId } = await params;
  const { email } = await req.json() as { email: string };

  if (!email?.trim()) return NextResponse.json({ error: 'Email is required' }, { status: 400 });

  const normalizedEmail = email.trim().toLowerCase();

  const [ownerResult, userResult] = await Promise.all([
    pool.query('SELECT 1 FROM boards WHERE id = $1 AND owner_id = $2', [boardId, session.user.id]),
    pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]),
  ]);

  if (!ownerResult.rowCount) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!userResult.rows[0]) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const inviteeId: string = userResult.rows[0].id;

  if (inviteeId === session.user.id) {
    return NextResponse.json({ error: 'You are already the owner' }, { status: 400 });
  }

  await pool.query(
    'INSERT INTO board_members (board_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [boardId, inviteeId],
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: boardId } = await params;
  const { userId } = await req.json() as { userId: string };

  const { rowCount: ownerCheck } = await pool.query(
    'SELECT 1 FROM boards WHERE id = $1 AND owner_id = $2',
    [boardId, session.user.id],
  );
  if (!ownerCheck) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await pool.query(
    'DELETE FROM board_members WHERE board_id = $1 AND user_id = $2',
    [boardId, userId],
  );

  return new Response(null, { status: 204 });
}
