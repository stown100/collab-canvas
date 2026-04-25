'use client';

import '@/shared/lib/liveblocks.config';
import { useEffect, useState } from 'react';
import { useRoom } from '@liveblocks/react/suspense';
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
  type TLStoreEventInfo,
  type TLStoreWithStatus,
} from '@tldraw/tldraw';

interface User {
  id: string;
  name: string;
  color: string;
}

export function useStorageStore(user: User): TLStoreWithStatus {
  const room = useRoom();

  const [store] = useState(() =>
    createTLStore({ shapeUtils: [...defaultShapeUtils] }),
  );

  const [storeWithStatus, setStoreWithStatus] = useState<TLStoreWithStatus>({
    status: 'loading',
  });

  useEffect(() => {
    const unsubs: Array<() => void> = [];

    async function setup() {
      const { root } = await room.getStorage();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const liveRecords = root.get('records') as import('@liveblocks/client').LiveMap<string, any>;

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
          ...[...liveRecords.values()],
        ],
        'initialize',
      );

      // Local tldraw changes → Liveblocks Storage
      unsubs.push(
        store.listen(
          ({ changes }: TLStoreEventInfo) => {
            room.batch(() => {
              Object.values(changes.added).forEach(r => liveRecords.set(r.id, r));
              Object.values(changes.updated).forEach(([, r]) => liveRecords.set(r.id, r));
              Object.values(changes.removed).forEach(r => liveRecords.delete(r.id));
            });
          },
          { source: 'user', scope: 'document' },
        ),
      );

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

      // Local cursor/selection → presence derivation
      const userSignal = computed<{ id: string; name?: string | null; color?: string | null }>(
        'userPreferences',
        () => ({ id: user.id, name: user.name, color: user.color }),
      );

      const connectionId = String(room.getSelf()?.connectionId ?? 0);
      const presenceId = InstancePresenceRecordType.createId(connectionId);
      const presenceDeriv = createPresenceStateDerivation(userSignal, presenceId)(store);

      room.updatePresence({ presence: presenceDeriv.get() ?? null });
      unsubs.push(
        react('sync presence', () => {
          const presence = presenceDeriv.get() ?? null;
          requestAnimationFrame(() => room.updatePresence({ presence }));
        }),
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

      setStoreWithStatus({ store, status: 'synced-remote', connectionStatus: 'online' });
    }

    setup();
    return () => {
      unsubs.forEach(fn => fn());
      unsubs.length = 0;
    };
  }, [room, store, user.id, user.name, user.color]);

  return storeWithStatus;
}
