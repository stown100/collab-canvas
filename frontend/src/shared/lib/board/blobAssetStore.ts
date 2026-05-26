import type { TLAssetStore, TLStore } from '@tldraw/tldraw';
import { upload } from '@vercel/blob/client';
import { useUploadStore } from '@/shared/store/uploadStore';

// A tldraw asset store backed by Vercel Blob. Files are uploaded straight to
// Blob (private) — bypassing the database — and referenced only by an
// access-controlled proxy URL. Liveblocks Storage caps records at ~1MB, so the
// default base64 asset store would lose larger files on reload.
//
// `getStore` defers reading the store until `remove` runs, breaking the
// circular dependency with `createTLStore`.
export function createBlobAssetStore(boardId: string, getStore: () => TLStore): TLAssetStore {
  const proxyPrefix = `/api/boards/${boardId}/assets/`;

  return {
    upload: async (_asset, file) => {
      const { startUpload, setProgress, setProcessing, finishUpload, failUpload } =
        useUploadStore.getState();
      const uploadId = startUpload(file.name);
      try {
        const blob = await upload(`boards/${boardId}/${file.name}`, file, {
          access: 'private',
          handleUploadUrl: '/api/blob/upload',
          clientPayload: JSON.stringify({ boardId }),
          contentType: file.type || undefined,
          onUploadProgress: ({ percentage }) => {
            if (percentage >= 100) setProcessing(uploadId);
            else setProgress(uploadId, Math.round(percentage));
          },
        });

        // Persist metadata and get back our access-controlled proxy URL.
        const res = await fetch(`/api/boards/${boardId}/assets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: blob.url,
            pathname: blob.pathname,
            mimeType: file.type,
            byteSize: file.size,
          }),
        });
        if (!res.ok) throw new Error(`Asset metadata save failed: ${res.status}`);
        const { url } = (await res.json()) as { url: string };

        finishUpload(uploadId);
        return { src: url };
      } catch (err) {
        // Surface the failure briefly, then clear it.
        failUpload(uploadId);
        setTimeout(() => finishUpload(uploadId), 5000);
        throw err;
      }
    },

    remove: async (ids) => {
      // Snapshot src URLs synchronously — tldraw removes the records right after this call.
      const store = getStore();
      const urls: string[] = [];
      for (const id of ids) {
        const record = store.get(id);
        if (record?.typeName === 'asset' && record.type === 'image') {
          const src = record.props.src;
          if (src && src.startsWith(proxyPrefix)) urls.push(src);
        }
      }
      await Promise.allSettled(urls.map((url) => fetch(url, { method: 'DELETE' })));
    },
  };
}
