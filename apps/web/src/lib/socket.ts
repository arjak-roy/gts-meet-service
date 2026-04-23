import { io, Socket } from 'socket.io-client';
import { WS_EVENTS } from '@gts-meet/shared';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(`${WS_URL}/classroom`, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function connectToRoom(wsTicket: string, roomId: string): Socket {
  const s = getSocket();

  if (!s.connected) {
    s.connect();
  }

  s.off('connect');
  s.on('connect', () => {
    s.emit(WS_EVENTS.AUTHENTICATE, { wsTicket, roomId });
  });

  // If already connected, authenticate immediately
  if (s.connected) {
    s.emit(WS_EVENTS.AUTHENTICATE, { wsTicket, roomId });
  }

  return s;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export { WS_EVENTS };
