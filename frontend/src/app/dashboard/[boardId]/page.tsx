import { redirect, notFound } from 'next/navigation';
import { auth } from '@/shared/lib/auth';
import pool from '@/shared/lib/postgres/client';
import { StoreInitializer } from '@/shared/lib/StoreInitializer';
import BoardHeader from './_components/BoardHeader';
import BoardCanvasLoader from './_components/BoardCanvasLoader';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ boardId: string }>;
}

export default async function BoardPage({ params }: Props) {
  const session = await auth();
  if (!session) redirect('/login');

  const { boardId } = await params;

  const { rows } = await pool.query(
    'SELECT title, content FROM boards WHERE id = $1 AND owner_id = $2',
    [boardId, session?.user?.id],
  );

  if (!rows[0]) notFound();

  return (
    <>
      <StoreInitializer user={session.user ?? null} />
      <BoardHeader title={rows[0].title} />
      <BoardCanvasLoader initialSnapshot={rows[0].content ?? null} />
    </>
  );
}
