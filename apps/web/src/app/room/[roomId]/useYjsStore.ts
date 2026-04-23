import { useEffect, useState } from 'react';
import { createTLStore, defaultShapeUtils } from 'tldraw';
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';

type SyncStatus = {
  status: 'loading' | 'ready';
  connectionStatus: 'connecting' | 'online' | 'offline';
  store: ReturnType<typeof createTLStore> | null;
};

function parseRecord(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// A simple hook that connects a Yjs document to a WebRTC provider
// and bridges it to the Tldraw store.
export function useYjsStore({
  roomId = 'tldraw-room',
  hostUrl = 'wss://signaling.yjs.dev',
}: {
  roomId?: string;
  hostUrl?: string;
}) {
  const [store] = useState(() => {
    return createTLStore({
      shapeUtils: defaultShapeUtils,
    });
  });

  const [storeWithStatus, setStoreWithStatus] = useState<SyncStatus>({
    status: 'loading',
    connectionStatus: 'connecting',
    store: null,
  });

  useEffect(() => {
    const tlStore = store as any;
    let isApplyingRemote = false;

    const yDoc = new Y.Doc();
    const provider = new WebrtcProvider(roomId, yDoc, {
      signaling: [hostUrl],
    });
    const yMap = yDoc.getMap<string>('tldraw-records');

    const applyRemoteToStore = () => {
      const records = Array.from(yMap.values())
        .map((value) => parseRecord(value))
        .filter(Boolean);

      if (records.length === 0) return;

      isApplyingRemote = true;
      if (typeof tlStore.mergeRemoteChanges === 'function') {
        tlStore.mergeRemoteChanges(() => {
          tlStore.put(records);
        });
      } else {
        tlStore.put(records);
      }
      isApplyingRemote = false;
    };

    // Hydrate from existing shared state if available.
    applyRemoteToStore();

    // If room is new, seed from local defaults once.
    if (yMap.size === 0 && typeof tlStore.allRecords === 'function') {
      const localRecords = tlStore.allRecords();
      yDoc.transact(() => {
        for (const record of localRecords) {
          yMap.set(record.id, JSON.stringify(record));
        }
      });
    }

    const observeRemote = () => {
      applyRemoteToStore();
    };
    yMap.observe(observeRemote);

    const unlistenLocal = tlStore.listen(
      (entry: any) => {
        if (isApplyingRemote) return;

        const changes = entry?.changes;
        const added = changes?.added || {};
        const updated = changes?.updated || {};
        const removed = changes?.removed || {};

        yDoc.transact(() => {
          for (const [id, record] of Object.entries(added)) {
            yMap.set(id, JSON.stringify(record));
          }
          for (const [id, nextRecord] of Object.entries(updated)) {
            const candidate = (nextRecord as any)?.[1] ?? nextRecord;
            yMap.set(id, JSON.stringify(candidate));
          }
          for (const id of Object.keys(removed)) {
            yMap.delete(id);
          }
        });
      },
      { source: 'user', scope: 'document' },
    );

    provider.on('status', (event: { status: 'connected' | 'disconnected' }) => {
      setStoreWithStatus((prev) => ({
        ...prev,
        status: 'ready',
        connectionStatus: event.status === 'connected' ? 'online' : 'offline',
      }));
    });

    // Set initial state. Provider status callback updates online/offline.
    setStoreWithStatus({
      store,
      status: 'ready',
      connectionStatus: 'connecting',
    });

    return () => {
      yMap.unobserve(observeRemote);
      if (typeof unlistenLocal === 'function') {
        unlistenLocal();
      }
      provider.destroy();
      yDoc.destroy();
    };
  }, [roomId, store, hostUrl]);

  return storeWithStatus;
}
