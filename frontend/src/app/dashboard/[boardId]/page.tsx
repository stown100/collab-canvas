import { redirect, notFound } from 'next/navigation';
import { auth } from '@/shared/lib/auth';
import pool from '@/shared/lib/postgres/client';
import { StoreInitializer } from '@/shared/lib/StoreInitializer';
import BoardHeader from './_components/BoardHeader';
import BoardCanvasLoader from './_components/BoardCanvasLoader';
import type { TLStoreSnapshot } from '@tldraw/tldraw';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ boardId: string }>;
}

export default async function BoardPage({ params }: Props) {
  const session = await auth();
  if (!session) redirect('/login');

  const { boardId } = await params;

  const [boardResult, recordsResult] = await Promise.all([
    pool.query(
      'SELECT title, tldraw_schema FROM boards WHERE id = $1 AND owner_id = $2',
      [boardId, session?.user?.id],
    ),
    pool.query(
      'SELECT data FROM board_records WHERE board_id = $1',
      [boardId],
    ),
  ]);

  if (!boardResult.rows[0]) notFound();

  const { title, tldraw_schema: schema } = boardResult.rows[0];

  const initialSnapshot: TLStoreSnapshot | null =
    schema && recordsResult.rows.length > 0
      ? {
          store: Object.fromEntries(
            recordsResult.rows.map((r) => [r.data.id, r.data]),
          ),
          schema,
        }
      : null;

  return (
    <>
      <StoreInitializer user={session.user ?? null} />
      <BoardHeader title={title} />
      <BoardCanvasLoader initialSnapshot={initialSnapshot} />
    </>
  );
}
