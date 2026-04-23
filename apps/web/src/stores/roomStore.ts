import { create } from 'zustand';
import { api } from '@/lib/api';

interface Room {
  id: string;
  title: string;
  inviteLink?: string;
  description?: string;
  type: string;
  status: string;
  maxParticipants: number;
  maxPublishers: number;
  features: Record<string, boolean>;
  creator: { id: string; name: string; email: string };
  _count?: { participants: number };
  createdAt: string;
  scheduledAt?: string;
}

interface RoomState {
  rooms: Room[];
  currentRoom: Room | null;
  livekitToken: string | null;
  wsTicket: string | null;
  participantRole: string | null;
  joinStatus: 'READY' | 'LOBBY' | null;
  lobby: {
    requestId: string;
    status: 'PENDING' | 'ADMITTED' | 'REJECTED';
    queuePosition: number | null;
    requestedAt: number;
  } | null;
  isLoading: boolean;

  fetchRooms: () => Promise<void>;
  createRoom: (data: { title: string; type: string; description?: string }) => Promise<Room>;
  joinRoom: (roomId: string) => Promise<any>;
  leaveRoom: (roomId: string) => Promise<void>;
  endRoom: (roomId: string) => Promise<void>;
  setCurrentRoom: (room: Room | null) => void;
  clearRoomState: () => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  rooms: [],
  currentRoom: null,
  livekitToken: null,
  wsTicket: null,
  participantRole: null,
  joinStatus: null,
  lobby: null,
  isLoading: false,

  fetchRooms: async () => {
    set({ isLoading: true });
    try {
      const rooms = await api.getRooms();
      set({ rooms, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  createRoom: async (data) => {
    const room = await api.createRoom(data);
    set((state) => ({ rooms: [room, ...state.rooms] }));
    return room;
  },

  joinRoom: async (roomId) => {
    const result = await api.joinRoom(roomId);
    set({
      currentRoom: result.room,
      livekitToken: result.livekitToken || null,
      wsTicket: result.wsTicket || null,
      participantRole: result.participantRole,
      joinStatus: result.status || null,
      lobby: result.lobby || null,
    });
    return result;
  },

  leaveRoom: async (roomId) => {
    await api.leaveRoom(roomId);
    set({ currentRoom: null, livekitToken: null, wsTicket: null, participantRole: null, joinStatus: null, lobby: null });
  },

  endRoom: async (roomId) => {
    await api.endRoom(roomId);
    set({ currentRoom: null, livekitToken: null, wsTicket: null, participantRole: null, joinStatus: null, lobby: null });
  },

  setCurrentRoom: (room) => set({ currentRoom: room }),
  clearRoomState: () => set({ currentRoom: null, livekitToken: null, wsTicket: null, participantRole: null, joinStatus: null, lobby: null }),
}));
