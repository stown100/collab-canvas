import type { LiveMap } from '@liveblocks/client';

declare global {
  interface Liveblocks {
    // Presence holds arbitrary tldraw session/presence records keyed by record id,
    // plus a top-level `presence` key for cursor/selection derivation.
    // We use Record<string, any> to satisfy Liveblocks' Lson constraint while
    // remaining compatible with tldraw's non-indexable record types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Presence: Record<string, any>;
    Storage: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      records: LiveMap<string, any>;
    };
    UserMeta: {
      id: string;
      info: {
        name: string;
        color: string;
      };
    };
    RoomEvent: never;
  }
}

export {};
