import { create } from 'zustand';

export type UploadStatus = 'uploading' | 'processing' | 'error';

export interface UploadItem {
  id: string;
  name: string;
  progress: number; // 0..100, meaningful while status === 'uploading'
  status: UploadStatus;
}

interface UploadState {
  uploads: UploadItem[];
  /** Register a new upload and return its generated id. */
  startUpload: (name: string) => string;
  setProgress: (id: string, progress: number) => void;
  /** Bytes are sent; the server is now reading/persisting the file. */
  setProcessing: (id: string) => void;
  failUpload: (id: string) => void;
  finishUpload: (id: string) => void;
}

export const useUploadStore = create<UploadState>((set) => ({
  uploads: [],
  startUpload: (name) => {
    const id = crypto.randomUUID();
    set((s) => ({ uploads: [...s.uploads, { id, name, progress: 0, status: 'uploading' }] }));
    return id;
  },
  setProgress: (id, progress) =>
    set((s) => ({ uploads: s.uploads.map((u) => (u.id === id ? { ...u, progress } : u)) })),
  setProcessing: (id) =>
    set((s) => ({
      uploads: s.uploads.map((u) => (u.id === id ? { ...u, progress: 100, status: 'processing' } : u)),
    })),
  failUpload: (id) =>
    set((s) => ({ uploads: s.uploads.map((u) => (u.id === id ? { ...u, status: 'error' } : u)) })),
  finishUpload: (id) => set((s) => ({ uploads: s.uploads.filter((u) => u.id !== id) })),
}));
