'use client';

import { Tldraw } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';
import { useSelf, useRoom } from '@liveblocks/react/suspense';
import { useStorageStore } from '@/shared/lib/useStorageStore';
import { setupBoardEditor } from '@/shared/lib/board/setupBoardEditor';
import UploadProgress from './UploadProgress';

const licenseKey = process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY;

export default function BoardCanvas() {
  // useSelf reads from the Liveblocks auth endpoint response (identifyUser → userInfo)
  const id = useSelf(me => me.id);
  const info = useSelf(me => me.info);
  const boardId = useRoom().id;

  const store = useStorageStore({
    user: {
      id: id ?? 'anonymous',
      name: info?.name ?? 'Anonymous',
      color: info?.color ?? '#1971c2',
    },
    boardId,
  });

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, top: 56 }}>
        <Tldraw store={store} licenseKey={licenseKey} onMount={setupBoardEditor} />
      </div>
      <UploadProgress />
    </>
  );
}
