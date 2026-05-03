'use client';

import { Tldraw, type Editor, type TLAssetId, type TLImageShape, type TLStoreEventInfo } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';
import { useSelf, useRoom } from '@liveblocks/react/suspense';
import { useStorageStore } from '@/shared/lib/useStorageStore';
import { pdfToImageFiles } from '@/shared/lib/pdf/pdfToImages';

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

  function handleMount(editor: Editor) {
    // When an image shape is locally removed, drop its backing asset if no other
    // shape still references it. editor.deleteAssets fires assets.remove (which
    // hits the backend DELETE) and removes the asset record so Liveblocks syncs.
    editor.store.listen(
      ({ changes }: TLStoreEventInfo) => {
        const removedAssetIds = new Set<TLAssetId>();
        for (const r of Object.values(changes.removed)) {
          if (r.typeName === 'shape' && r.type === 'image') {
            const assetId = (r as TLImageShape).props.assetId;
            if (assetId) removedAssetIds.add(assetId);
          }
        }
        if (removedAssetIds.size === 0) return;

        for (const r of editor.store.allRecords()) {
          if (r.typeName === 'shape' && r.type === 'image') {
            const assetId = (r as TLImageShape).props.assetId;
            if (assetId) removedAssetIds.delete(assetId);
          }
        }

        if (removedAssetIds.size > 0) {
          editor.deleteAssets([...removedAssetIds]);
        }
      },
      { source: 'user', scope: 'document' },
    );

    editor.registerExternalContentHandler('files', async ({ files, point }) => {
      const pdfs = files.filter(f => f.type === 'application/pdf');
      const others = files.filter(f => f.type !== 'application/pdf');

      const pdfPages: File[] = [];
      for (const pdf of pdfs) {
        const pages = await pdfToImageFiles(pdf);
        pdfPages.push(...pages);
      }

      const allFiles = [...others, ...pdfPages];
      const bounds = editor.getViewportPageBounds();
      const dropPoint = point ?? { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
      let offsetY = 0;

      for (const file of allFiles) {
        const asset = await editor.getAssetForExternalContent({ type: 'file', file });
        if (!asset || asset.type !== 'image') continue;
        const { w, h } = asset.props;
        editor.createAssets([asset]);
        editor.createShape<TLImageShape>({
          type: 'image',
          x: dropPoint.x - w / 2,
          y: dropPoint.y + offsetY,
          props: { assetId: asset.id, w, h, playing: false, url: '', crop: null, flipX: false, flipY: false, altText: file.name },
        });
        offsetY += h + 16;
      }
    });
  }

  return (
    <div style={{ position: 'fixed', inset: 0, top: 56 }}>
      <Tldraw store={store} licenseKey={licenseKey} onMount={handleMount} />
    </div>
  );
}
