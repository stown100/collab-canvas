import type { TLAssetStore, TLStore } from '@tldraw/tldraw';
import { useUploadStore } from '@/shared/store/uploadStore';

// A tldraw asset store backed by our own MinIO via the Next.js → Express proxy.
// Files stream through the backend (MinIO stays internal) and are referenced by
// an access-controlled proxy URL. XHR is used so upload progress can be shown.
//
// `getStore` defers reading the store until `remove` runs, breaking the
// circular dependency with `createTLStore`.
export function createMinioAssetStore(boardId: string, getStore: () => TLStore): TLAssetStore {
  const proxyPrefix = `/api/boards/${boardId}/assets/`;

  return {
    upload: (_asset, file) => {
      const { startUpload, setProgress, setProcessing, finishUpload, failUpload } =
        useUploadStore.getState();
      const uploadId = startUpload(file.name);

      return new Promise<{ src: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `/api/boards/${boardId}/assets`);
        xhr.responseType = 'json';
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.setRequestHeader('x-file-name', encodeURIComponent(file.name));

        const fail = (message: string) => {
          // Surface the failure briefly, then clear it.
          failUpload(uploadId);
          setTimeout(() => finishUpload(uploadId), 5000);
          reject(new Error(message));
        };

        xhr.upload.onprogress = ({ lengthComputable, loaded, total }) => {
          if (!lengthComputable) return;
          const percentage = Math.round((loaded / total) * 100);
          if (percentage >= 100) setProcessing(uploadId);
          else setProgress(uploadId, percentage);
        };
        xhr.onload = () => {
          const url = (xhr.response as { url?: string } | null)?.url;
          if (xhr.status >= 200 && xhr.status < 300 && url) {
            finishUpload(uploadId);
            resolve({ src: url });
          } else {
            fail(`Asset upload failed: ${xhr.status}`);
          }
        };
        xhr.onerror = () => fail('Asset upload failed');
        xhr.send(file);
      });
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
