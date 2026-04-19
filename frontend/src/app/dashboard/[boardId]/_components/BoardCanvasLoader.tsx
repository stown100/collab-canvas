'use client';

import dynamic from 'next/dynamic';
import type { TLEditorSnapshot } from '@tldraw/tldraw';
import type { ComponentType } from 'react';

interface Props {
  initialSnapshot: TLEditorSnapshot | null;
}

const BoardCanvas = dynamic<Props>(() => import('./BoardCanvas') as Promise<{ default: ComponentType<Props> }>, { ssr: false });

export default function BoardCanvasLoader({ initialSnapshot }: Props) {
  return <BoardCanvas initialSnapshot={initialSnapshot} />;
}
