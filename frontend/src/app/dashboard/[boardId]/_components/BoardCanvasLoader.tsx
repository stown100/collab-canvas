'use client';

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';

const BoardCanvas = dynamic(() => import('./BoardCanvas') as Promise<{ default: ComponentType }>, {
  ssr: false,
});

export default function BoardCanvasLoader() {
  return <BoardCanvas />;
}
