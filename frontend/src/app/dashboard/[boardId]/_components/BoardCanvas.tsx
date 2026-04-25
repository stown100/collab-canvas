'use client';

import { useEffect, useMemo } from 'react';
import { Tldraw, createTLStore, loadSnapshot, type Editor, type TLImageShape, type TLStoreSnapshot } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';
import { useParams } from 'next/navigation';
import { pdfToImageFiles } from '@/shared/lib/pdf/pdfToImages';

const DEBOUNCE_MS = 500;
const MAX_WAIT_MS = 5_000;
const licenseKey = process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY;

interface Props {
  initialSnapshot: TLStoreSnapshot | null;
}

export default function BoardCanvas({ initialSnapshot }: Props) {
  const { boardId } = useParams();

  // Pre-populate the store synchronously before first render so tldraw's async
  // initialization cannot overwrite the snapshot after mount.
  const store = useMemo(
    () => {
      const s = createTLStore();
      if (initialSnapshot) loadSnapshot(s, initialSnapshot);
      return s;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    const upsertMap = new Map<string, unknown>();
    const removeSet = new Set<string>();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
    let inFlight: AbortController | null = null;

    const flush = (onUnload = false) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (maxWaitTimer) clearTimeout(maxWaitTimer);
      debounceTimer = null;
      maxWaitTimer = null;

      if (upsertMap.size === 0 && removeSet.size === 0) return;

      const upsert = [...upsertMap.values()];
      const remove = [...removeSet];
      upsertMap.clear();
      removeSet.clear();

      inFlight?.abort();
      const controller = onUnload ? null : new AbortController();
      inFlight = controller;

      fetch(`/api/boards/${boardId}/records`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema: store.schema.serialize(), upsert, remove }),
        keepalive: onUnload,
        signal: controller?.signal,
      }).catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
      });
    };

    const schedule = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => flush(), DEBOUNCE_MS);
      if (!maxWaitTimer) maxWaitTimer = setTimeout(() => flush(), MAX_WAIT_MS);
    };

    const unsubscribe = store.listen(
      ({ changes }) => {
        for (const record of Object.values(changes.added)) {
          upsertMap.set(record.id, record);
        }
        for (const [, next] of Object.values(changes.updated)) {
          upsertMap.set(next.id, next);
        }
        for (const id of Object.keys(changes.removed)) {
          upsertMap.delete(id);
          removeSet.add(id);
        }
        schedule();
      },
      { source: 'user', scope: 'document' },
    );

    const flushOnUnload = () => flush(true);
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flushOnUnload();
    };

    window.addEventListener('pagehide', flushOnUnload);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      unsubscribe();
      window.removeEventListener('pagehide', flushOnUnload);
      document.removeEventListener('visibilitychange', handleVisibility);
      flushOnUnload();
    };
  }, [store, boardId]);

  function handleMount(editor: Editor) {
    editor.registerExternalContentHandler('files', async ({ files, point }) => {
      // Split PDF and non-PDF files
      const pdfs = files.filter(f => f.type === 'application/pdf');
      const others = files.filter(f => f.type !== 'application/pdf');

      // Convert PDF pages to PNG files and append to the queue
      const pdfPages: File[] = [];
      for (const pdf of pdfs) {
        const pages = await pdfToImageFiles(pdf);
        pdfPages.push(...pages);
      }

      const allImageFiles = [...others, ...pdfPages];

      const bounds = editor.getViewportPageBounds();
      const dropPoint = point ?? { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
      let offsetY = 0;

      for (const file of allImageFiles) {
        // Let tldraw's default asset handler resolve image files
        const asset = await editor.getAssetForExternalContent({ type: 'file', file });
        if (!asset || asset.type !== 'image') continue;

        const { w, h } = asset.props;
        editor.createAssets([asset]);
        editor.createShape<TLImageShape>({
          type: 'image',
          x: dropPoint.x - w / 2,
          y: dropPoint.y + offsetY,
          props: {
            assetId: asset.id,
            w,
            h,
            playing: false,
            url: '',
            crop: null,
            flipX: false,
            flipY: false,
            altText: file.name,
          },
        });
        // Stack pages vertically with a small gap
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
