import { NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import pool from '@/shared/lib/postgres/client';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { rows } = await pool.query(
    `SELECT b.id, b.title, b.owner_id, b.created_at, b.updated_at,
            u.name AS owner_name, u.image AS owner_image
     FROM boards b
     JOIN users u ON u.id = b.owner_id
     WHERE b.owner_id = $1
     ORDER BY b.updated_at DESC`,
    [session.user.id],
  );

  const boards = rows.map((r) => ({
    id: r.id,
    title: r.title,
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    ownerImage: r.owner_image,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  return NextResponse.json(boards);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { title } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

  const { rows } = await pool.query(
    `INSERT INTO boards (title, owner_id)
     VALUES ($1, $2)
     RETURNING id, title, owner_id, created_at, updated_at`,
    [title.trim(), session.user.id],
  );

  const b = rows[0];
  return NextResponse.json({
    id: b.id,
    title: b.title,
    ownerId: b.owner_id,
    ownerName: session.user.name ?? null,
    ownerImage: session.user.image ?? null,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
  });
}
