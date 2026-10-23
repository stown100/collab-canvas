'use client';

import { DefaultColorThemePalette, FrameShapeUtil, NoteShapeUtil, Tldraw } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';
import { useSelf, useRoom } from '@liveblocks/react/suspense';
import { useStorageStore } from '@/shared/lib/useStorageStore';
import { setupBoardEditor } from '@/shared/lib/board/setupBoardEditor';
import { applyPaletteOverrides } from '@/shared/lib/board/palette';
import UploadProgress from './UploadProgress';

const licenseKey = process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY;

applyPaletteOverrides(DefaultColorThemePalette);

// As in Miro: sticky notes can be resized (scaled with their text; tldraw's
// default keeps them a fixed size) and frames show their colour as a background.
const shapeUtils = [
  NoteShapeUtil.configure({ resizeMode: 'scale' }),
  FrameShapeUtil.configure({ showColors: true }),
];

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
        <Tldraw
          store={store}
          shapeUtils={shapeUtils}
          licenseKey={licenseKey}
          onMount={setupBoardEditor}
        />
      </div>
      <UploadProgress />
    </>
  );
}
