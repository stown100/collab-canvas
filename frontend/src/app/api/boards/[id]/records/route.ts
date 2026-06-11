import { NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import pool from '@/shared/lib/postgres/client';

const BACKEND_URL = process.env.BACKEND_URL;
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

// Authenticates the user and checks board membership. Returns the proxy target
// on success, or a ready-to-return error response otherwise. The actual DB work
// happens in the Express backend — this layer only authorizes and forwards.
async function authorizeBoard(boardId: string): Promise<{ url: string } | { error: NextResponse }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { rowCount } = await pool.query(
    `SELECT 1 FROM boards b
     LEFT JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = $2
     WHERE b.id = $1 AND (b.owner_id = $2 OR bm.user_id IS NOT NULL)`,
    [boardId, session.user.id],
  );
  if (!rowCount) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  if (!BACKEND_URL || !INTERNAL_API_SECRET) {
    return { error: NextResponse.json({ error: 'Backend is not configured' }, { status: 500 }) };
  }

  return { url: `${BACKEND_URL}/api/boards/${boardId}/records` };
}

const internalHeaders: HeadersInit = {
  'Content-Type': 'application/json',
  'x-internal-secret': INTERNAL_API_SECRET ?? '',
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const gate = await authorizeBoard(id);
  if ('error' in gate) return gate.error;

  const res = await fetch(gate.url, { headers: internalHeaders, cache: 'no-store' });
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const gate = await authorizeBoard(id);
  if ('error' in gate) return gate.error;

  const payload = await req.text();
  const res = await fetch(gate.url, {
    method: 'PATCH',
    headers: internalHeaders,
    body: payload,
  });
  return new NextResponse(null, { status: res.status });
}
