import { redirect, notFound } from 'next/navigation';
import { auth } from '@/shared/lib/auth';
import pool from '@/shared/lib/postgres/client';
import { StoreInitializer } from '@/shared/lib/StoreInitializer';
import BoardHeader from './_components/BoardHeader';
import BoardCanvasLoader from './_components/BoardCanvasLoader';
import BoardRoom from './_components/BoardRoom';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ boardId: string }>;
}

export default async function BoardPage({ params }: Props) {
  const session = await auth();
  if (!session) redirect('/login');

  const { boardId } = await params;

  const { rows } = await pool.query(
    `SELECT b.title,
            CASE WHEN b.owner_id = $2 THEN 'owner' ELSE 'member' END AS role
     FROM boards b
     LEFT JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = $2
     WHERE b.id = $1 AND (b.owner_id = $2 OR bm.user_id IS NOT NULL)`,
    [boardId, session?.user?.id],
  );

  if (!rows[0]) notFound();

  const isOwner = rows[0].role === 'owner';

  return (
    <>
      <StoreInitializer user={session.user ?? null} />
      <BoardHeader boardId={boardId} title={rows[0].title} isOwner={isOwner} />
      <BoardRoom boardId={boardId}>
        <BoardCanvasLoader />
      </BoardRoom>
    </>
  );
}
