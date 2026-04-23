'use client';

import dynamic from 'next/dynamic';
import type { TLStoreSnapshot } from '@tldraw/tldraw';
import type { ComponentType } from 'react';

interface Props {
  initialSnapshot: TLStoreSnapshot | null;
}

const BoardCanvas = dynamic<Props>(
  () => import('./BoardCanvas') as Promise<{ default: ComponentType<Props> }>,
  { ssr: false },
);

export default function BoardCanvasLoader({ initialSnapshot }: Props) {
  return <BoardCanvas initialSnapshot={initialSnapshot} />;
}
