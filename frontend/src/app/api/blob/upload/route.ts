import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { auth } from '@/shared/lib/auth';
import pool from '@/shared/lib/postgres/client';

const MAX_BYTES = 25 * 1024 * 1024;

// Issues a short-lived client token so the browser can upload a file directly
// to Vercel Blob. The token is only granted to a board member, which is what
// gates who may add assets to a board.
export async function POST(req: Request): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const session = await auth();
        if (!session?.user?.id) throw new Error('Unauthorized');

        const { boardId } = JSON.parse(clientPayload ?? '{}') as { boardId?: string };
        if (!boardId) throw new Error('Missing boardId');

        const { rowCount } = await pool.query(
          `SELECT 1 FROM boards b
           LEFT JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = $2
           WHERE b.id = $1 AND (b.owner_id = $2 OR bm.user_id IS NOT NULL)`,
          [boardId, session.user.id],
        );
        if (!rowCount) throw new Error('Forbidden');

        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
        };
      },
      // Not relied upon: this callback does not fire on localhost. Asset
      // metadata is persisted by the client via POST /api/boards/[id]/assets.
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
