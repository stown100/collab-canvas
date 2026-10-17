'use client';

import '@/shared/lib/liveblocks.config';
import { useEffect, useState } from 'react';
import { useRoom } from '@liveblocks/react/suspense';
import { createMinioAssetStore } from '@/shared/lib/board/minioAssetStore';
import { createBoardRecordsSync } from '@/shared/lib/board/boardRecordsSync';
import {
  diffBoardRecords,
  fetchBoardRecords,
  migrateBoardRecords,
} from '@/shared/lib/board/boardRecordsLoad';
import {
  computed,
  createPresenceStateDerivation,
  createTLStore,
  defaultShapeUtils,
  DocumentRecordType,
  InstancePresenceRecordType,
  PageRecordType,
  react,
  type IndexKey,
  type TLDocument,
  type TLInstancePresence,
  type TLPageId,
  type TLRecord,
  type TLStore,
  type TLStoreEventInfo,
  type TLStoreWithStatus,
} from '@tldraw/tldraw';

interface User {
  id: string;
  name: string;
  color: string;
}

interface UseStorageStoreOpts {
  user: User;
  boardId: string;
}

export function useStorageStore({ user, boardId }: UseStorageStoreOpts): TLStoreWithStatus {
  const room = useRoom();

  const [store] = useState(() => {
    const created: TLStore = createTLStore({
      shapeUtils: [...defaultShapeUtils],
      assets: createMinioAssetStore(boardId, () => created),
    });
    return created;
  });

  const [storeWithStatus, setStoreWithStatus] = useState<TLStoreWithStatus>({
    status: 'loading',
  });

  // Sync the document between tldraw, Liveblocks (realtime) and our own DB
  // (durable). Keyed on room/board only, so the store is seeded exactly once —
  // re-seeding while the editor is mounted would clear the document mid-render.
  // The `cancelled` flag stops a torn-down run (StrictMode / remount) from
  // mutating the store after its cleanup.
  useEffect(() => {
    let cancelled = false;
    const unsubs: Array<() => void> = [];

    async function setup() {
      const { root } = await room.getStorage();
      if (cancelled) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const liveRecords = root.get('records') as import('@liveblocks/client').LiveMap<string, any>;

      // A warm room (live Liveblocks data) opens straight away from that state;
      // its DB copy is reconciled in the background once the board is shown. A
      // cold room is hydrated from our own DB, the source of truth — on a load
      // failure it opens empty rather than not at all.
      const isWarm = liveRecords.size > 0;
      let dbRecords: TLRecord[] = [];
      if (!isWarm) {
        try {
          dbRecords = migrateBoardRecords(store, await fetchBoardRecords(boardId));
        } catch (err) {
          console.error('Board DB load failed, opening an empty board:', err);
        }
        if (cancelled) return;
      }
      const seedRecords = isWarm ? [...liveRecords.values()] : dbRecords;

      // Seed default records so tldraw has a valid document and page.
      store.clear();
      store.put(
        [
          DocumentRecordType.create({ id: 'document:document' as TLDocument['id'] }),
          PageRecordType.create({
            id: 'page:page' as TLPageId,
            name: 'Page 1',
            index: 'a1' as IndexKey,
          }),
          ...seedRecords,
        ],
        'initialize',
      );

      // Cold room: push the DB state into Liveblocks so collaborators load the same.
      if (!isWarm && dbRecords.length > 0) {
        room.batch(() => {
          dbRecords.forEach(r => liveRecords.set(r.id, r));
        });
      }

      // Local tldraw changes → Liveblocks Storage (realtime) + own DB (durable).
      const recordsSync = createBoardRecordsSync(boardId, store);
      unsubs.push(
        store.listen(
          ({ changes }: TLStoreEventInfo) => {
            room.batch(() => {
              Object.values(changes.added).forEach(r => liveRecords.set(r.id, r));
              Object.values(changes.updated).forEach(([, r]) => liveRecords.set(r.id, r));
              Object.values(changes.removed).forEach(r => liveRecords.delete(r.id));
            });
            recordsSync.enqueue(changes);
          },
          { source: 'user', scope: 'document' },
        ),
      );

      // Flush pending edits when the tab is hidden so nothing is lost on close.
      const flushOnHide = () => {
        if (document.visibilityState === 'hidden') void recordsSync.flush();
      };
      document.addEventListener('visibilitychange', flushOnHide);
      unsubs.push(() => document.removeEventListener('visibilitychange', flushOnHide));
      unsubs.push(() => recordsSync.stop());

      // Local session/presence → Liveblocks Presence
      const syncPresence = ({ changes }: TLStoreEventInfo) => {
        room.batch(() => {
          Object.values(changes.added).forEach(r => room.updatePresence({ [r.id]: r }));
          Object.values(changes.updated).forEach(([, r]) => room.updatePresence({ [r.id]: r }));
          Object.values(changes.removed).forEach(r => room.updatePresence({ [r.id]: null }));
        });
      };
      unsubs.push(store.listen(syncPresence, { source: 'user', scope: 'session' }));
      unsubs.push(store.listen(syncPresence, { source: 'user', scope: 'presence' }));

      // Liveblocks Storage changes → tldraw store
      unsubs.push(
        room.subscribe(
          liveRecords,
          storageChanges => {
            const toRemove: TLRecord['id'][] = [];
            const toPut: TLRecord[] = [];

            for (const update of storageChanges) {
              if (update.type !== 'LiveMap') continue;
              for (const [id, { type }] of Object.entries(update.updates)) {
                if (type === 'delete') {
                  toRemove.push(id as TLRecord['id']);
                } else if (type === 'update') {
                  const curr = update.node.get(id);
                  if (curr) toPut.push(curr as unknown as TLRecord);
                }
              }
            }

            store.mergeRemoteChanges(() => {
              if (toRemove.length) store.remove(toRemove);
              if (toPut.length) store.put(toPut);
            });
          },
          { isDeep: true },
        ),
      );

      // Remote cursors/selections → tldraw store
      unsubs.push(
        room.subscribe('others', (others, event) => {
          const toRemove: TLInstancePresence['id'][] = [];
          const toPut: TLInstancePresence[] = [];

          if (event.type === 'leave' && event.user.connectionId) {
            toRemove.push(InstancePresenceRecordType.createId(String(event.user.connectionId)));
          } else if (event.type === 'reset') {
            others.forEach(o =>
              toRemove.push(InstancePresenceRecordType.createId(String(o.connectionId))),
            );
          } else if (event.type === 'enter' || event.type === 'update') {
            const p = event.user?.presence?.presence;
            if (p) toPut.push(p);
          }

          store.mergeRemoteChanges(() => {
            if (toRemove.length) store.remove(toRemove);
            if (toPut.length) store.put(toPut);
          });
        }),
      );

      if (cancelled) return;
      setStoreWithStatus({ store, status: 'synced-remote', connectionStatus: 'online' });

      // Warm room: bring the DB copy in line with what the board shows — write
      // edits that never reached it, drop records deleted meanwhile.
      if (isWarm) {
        try {
          const { upsert, remove } = diffBoardRecords(store, await fetchBoardRecords(boardId));
          if (!cancelled) recordsSync.enqueueDiff(upsert, remove);
        } catch (err) {
          console.error('Board DB reconcile failed:', err);
        }
      }
    }

    setup();
    return () => {
      cancelled = true;
      unsubs.forEach(fn => fn());
      unsubs.length = 0;
    };
  }, [room, store, boardId]);

  // Publish this user's cursor/selection as Liveblocks presence. Kept separate
  // from the storage setup so a change of user info never re-seeds the document.
  useEffect(() => {
    const userSignal = computed<{ id: string; name?: string | null; color?: string | null }>(
      'userPreferences',
      () => ({ id: user.id, name: user.name, color: user.color }),
    );

    const connectionId = String(room.getSelf()?.connectionId ?? 0);
    const presenceId = InstancePresenceRecordType.createId(connectionId);
    const presenceDeriv = createPresenceStateDerivation(userSignal, presenceId)(store);

    room.updatePresence({ presence: presenceDeriv.get() ?? null });
    const unsub = react('sync presence', () => {
      const presence = presenceDeriv.get() ?? null;
      requestAnimationFrame(() => room.updatePresence({ presence }));
    });

    return () => unsub();
  }, [room, store, user.id, user.name, user.color]);

  return storeWithStatus;
}
