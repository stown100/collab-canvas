import type { SerializedSchema, TLRecord, TLStore } from '@tldraw/tldraw';

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
