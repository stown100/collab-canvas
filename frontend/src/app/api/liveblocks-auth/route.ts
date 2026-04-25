import { Liveblocks } from '@liveblocks/node';
import { auth } from '@/shared/lib/auth';
import pool from '@/shared/lib/postgres/client';

const liveblocks = new Liveblocks({
  secret: process.env.LIVEBLOCKS_SECRET_KEY!,
});

// Deterministic color from user ID so the same user always has the same cursor color.
function userColor(userId: string): string {
  const palette = ['#e03131', '#2f9e44', '#1971c2', '#f08c00', '#7048e8', '#0c8599', '#c2255c'];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response('Unauthorized', { status: 401 });

  const { room } = await req.json() as { room: string };

  // Allow access if the user is the owner OR has been invited as a member.
  const { rowCount } = await pool.query(
    `SELECT 1 FROM boards b
     LEFT JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = $2
     WHERE b.id = $1 AND (b.owner_id = $2 OR bm.user_id IS NOT NULL)`,
    [room, session.user.id],
  );
  if (!rowCount) return new Response('Forbidden', { status: 403 });

  const liveblocksSession = liveblocks.prepareSession(session.user.id, {
    userInfo: {
      name: session.user.name ?? 'Anonymous',
      color: userColor(session.user.id),
    },
  });

  liveblocksSession.allow(room, liveblocksSession.FULL_ACCESS);

  const { status, body } = await liveblocksSession.authorize();
  return new Response(body, { status });
}
