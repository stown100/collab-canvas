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

// Headers for a JSON write on behalf of `userId`, whom the backend records as
// the author of the change.
export function userJsonHeaders(userId: string): Record<string, string> {
  return { ...internalSecretHeader(), 'Content-Type': 'application/json', 'x-user-id': userId };
}

type BoardAccess =
  | { userId: string; denied: null }
  | { userId: null; denied: NextResponse };

function deny(error: string, status: number): BoardAccess {
  return { userId: null, denied: NextResponse.json({ error }, { status }) };
}

// Checks that the current user may access the board (owner or member) and the
// backend is configured. On success returns the user's id (for routes that
// record who made a change), otherwise `denied` is the response to return.
export async function getBoardAccess(boardId: string): Promise<BoardAccess> {
  const session = await auth();
  if (!session?.user?.id) return deny('Unauthorized', 401);

  const { rowCount } = await pool.query(
    `SELECT 1 FROM boards b
     LEFT JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = $2
     WHERE b.id = $1 AND (b.owner_id = $2 OR bm.user_id IS NOT NULL)`,
    [boardId, session.user.id],
  );
  if (!rowCount) return deny('Forbidden', 403);

  if (!BACKEND_URL || !INTERNAL_API_SECRET) return deny('Backend is not configured', 500);

  return { userId: session.user.id, denied: null };
}

// Returns an error response if the current user may not access the board, or
// `null` if access is granted (owner or member) and the backend is configured.
export async function authorizeBoardMember(boardId: string): Promise<NextResponse | null> {
  return (await getBoardAccess(boardId)).denied;
}

// Relays a JSON (or empty) backend response to the browser as-is.
export async function relayJson(res: Response): Promise<NextResponse> {
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  return new NextResponse(await res.text(), {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
