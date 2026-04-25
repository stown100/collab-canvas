'use client';

import { LiveblocksProvider, RoomProvider, ClientSideSuspense } from '@liveblocks/react/suspense';
import { LiveMap } from '@liveblocks/client';
import type { ReactNode } from 'react';

interface Props {
  boardId: string;
  children: ReactNode;
}

export default function BoardRoom({ boardId, children }: Props) {
  return (
    <LiveblocksProvider authEndpoint="/api/liveblocks-auth">
      <RoomProvider
        id={boardId}
        initialPresence={{ presence: null }}
        initialStorage={{ records: new LiveMap() }}
      >
        <ClientSideSuspense fallback={null}>
          {children}
        </ClientSideSuspense>
      </RoomProvider>
    </LiveblocksProvider>
  );
}
