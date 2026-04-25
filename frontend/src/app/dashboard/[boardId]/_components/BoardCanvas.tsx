'use client';

import { Tldraw, type Editor, type TLImageShape } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';
import { useSelf } from '@liveblocks/react/suspense';
import { useStorageStore } from '@/shared/lib/useStorageStore';
import { pdfToImageFiles } from '@/shared/lib/pdf/pdfToImages';

const licenseKey = process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY;

export default function BoardCanvas() {
  // useSelf reads from the Liveblocks auth endpoint response (identifyUser → userInfo)
  const id = useSelf(me => me.id);
  const info = useSelf(me => me.info);

  const store = useStorageStore({
    id: id ?? 'anonymous',
    name: info?.name ?? 'Anonymous',
    color: info?.color ?? '#1971c2',
  });

  function handleMount(editor: Editor) {
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
