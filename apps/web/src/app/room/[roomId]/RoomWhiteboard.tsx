"use client";

import { Tldraw } from 'tldraw';
import 'tldraw/tldraw.css';
import { useYjsStore } from './useYjsStore';

interface RoomWhiteboardProps {
  roomId: string;
}

export function RoomWhiteboard({ roomId }: RoomWhiteboardProps) {
  const storeWithStatus = useYjsStore({
    roomId: `room-${roomId}-whiteboard`,
  });

  const statusLabel =
    storeWithStatus.connectionStatus === 'online'
      ? 'Synced'
      : storeWithStatus.connectionStatus === 'connecting'
        ? 'Connecting...'
        : 'Offline';

  if (!storeWithStatus.store || storeWithStatus.status === 'loading') {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderRadius: '8px' }}>
        <p style={{ color: '#6b7280', fontSize: 14 }}>Loading whiteboard...</p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', background: '#fff', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 10,
          background: 'rgba(17, 24, 39, 0.75)',
          color: '#fff',
          fontSize: 12,
          lineHeight: 1,
          borderRadius: 999,
          padding: '8px 10px',
          backdropFilter: 'blur(6px)',
        }}
      >
        {statusLabel}
      </div>
      <Tldraw autoFocus={false} store={storeWithStatus.store} />
    </div>
  );
}
