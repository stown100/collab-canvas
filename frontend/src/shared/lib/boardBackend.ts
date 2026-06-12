import { NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import pool from '@/shared/lib/postgres/client';

// Server-side helpers shared by the board proxy routes. They authenticate the
// user and check board membership, then forward to the Express backend — which
// is the only layer that touches the DB / object storage.

export const BACKEND_URL = process.env.BACKEND_URL;
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

export function internalSecretHeader(): Record<string, string> {
  return { 'x-internal-secret': INTERNAL_API_SECRET ?? '' };
}

// Returns an error response if the current user may not access the board, or
// `null` if access is granted (owner or member) and the backend is configured.
export async function authorizeBoardMember(boardId: string): Promise<NextResponse | null> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { rowCount } = await pool.query(
    `SELECT 1 FROM boards b
     LEFT JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = $2
     WHERE b.id = $1 AND (b.owner_id = $2 OR bm.user_id IS NOT NULL)`,
    [boardId, session.user.id],
  );
  if (!rowCount) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!BACKEND_URL || !INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'Backend is not configured' }, { status: 500 });
  }

  return null;
}
