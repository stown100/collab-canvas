import { isEqual, type SerializedSchema, type TLRecord, type TLStore } from '@tldraw/tldraw';

// Loading side of the own-DB persistence: reads the durable board copy back
// from Postgres (via the Next.js proxy → Express) so a board can be hydrated
// from our database rather than relying on Liveblocks' stored snapshot.

interface BoardRecordsSnapshot {
  records: TLRecord[];
  schema: SerializedSchema | null;
}

export async function fetchBoardRecords(boardId: string): Promise<BoardRecordsSnapshot> {
  const res = await fetch(`/api/boards/${boardId}/records`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load board records: ${res.status}`);
  return res.json() as Promise<BoardRecordsSnapshot>;
}

// Keeps only well-formed tldraw records (id shaped as `typeName:...`), dropping
// any foreign or legacy rows so a single bad record can't break the whole board.
function isTldrawRecord(r: TLRecord): boolean {
  return (
    !!r &&
    typeof r.typeName === 'string' &&
    typeof r.id === 'string' &&
    r.id.startsWith(`${r.typeName}:`)
  );
}

// Brings DB-stored records up to the store's current tldraw schema. Returns the
// records as-is when nothing was stored yet (new board) or no schema is known.
export function migrateBoardRecords(store: TLStore, snapshot: BoardRecordsSnapshot): TLRecord[] {
  const records = snapshot.records.filter(isTldrawRecord);
  if (!snapshot.schema || records.length === 0) return records;

  const serializedStore = Object.fromEntries(records.map((r) => [r.id, r]));
  const result = store.schema.migrateStoreSnapshot({
    store: serializedStore,
    schema: snapshot.schema,
  });
  if (result.type === 'error') {
    throw new Error(`tldraw schema migration failed: ${result.reason}`);
  }
  return Object.values(result.value) as TLRecord[];
}

// Compares the board as shown (the store's document records) with the DB copy:
// records to upsert so the DB matches, and stored ids to delete. Catches up on
// edits that never reached the DB — made by a client that doesn't persist, a
// failed save, a tab closed mid-flush.
export function diffBoardRecords(
  store: TLStore,
  snapshot: BoardRecordsSnapshot,
): { upsert: TLRecord[]; remove: string[] } {
  const documentTypes = store.scopedTypes.document;
  const live = store.allRecords().filter((r) => documentTypes.has(r.typeName));
  const liveIds = new Set<string>(live.map((r) => r.id));

  let stored: TLRecord[] = [];
  try {
    stored = migrateBoardRecords(store, snapshot);
  } catch (err) {
    // An unmigratable copy is rewritten from the live board as a whole.
    console.error('Board DB copy could not be migrated, rewriting it:', err);
  }
  const storedById = new Map<string, TLRecord>(stored.map((r) => [r.id, r]));

  return {
    upsert: live.filter((r) => !isEqual(storedById.get(r.id), r)),
    // Raw ids, so malformed or legacy rows are removed too.
    remove: snapshot.records
      .map((r) => r?.id as string | undefined)
      .filter((id): id is string => typeof id === 'string' && !liveIds.has(id)),
  };
}
