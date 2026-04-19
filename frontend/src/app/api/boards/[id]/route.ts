import { NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import pool from '@/shared/lib/postgres/client';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { rows } = await pool.query(
    `SELECT b.*, u.name AS owner_name, u.image AS owner_image
     FROM boards b JOIN users u ON u.id = b.owner_id
     WHERE b.id = $1 AND b.owner_id = $2`,
    [id, session.user.id],
  );

  if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const row = rows[0];
  return NextResponse.json({
    id: row.id,
    title: row.title,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    ownerImage: row.owner_image,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { title } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 });

  const { rows } = await pool.query(
    `UPDATE boards SET title = $1, updated_at = now()
     WHERE id = $2 AND owner_id = $3
     RETURNING id, title, owner_id, created_at, updated_at`,
    [title.trim(), id, session.user.id],
  );

  if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const row = rows[0];
  return NextResponse.json({
    id: row.id,
    title: row.title,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

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
