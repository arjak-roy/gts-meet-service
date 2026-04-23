import { RoomType } from './types';

// ──────────────────────────────────────────────
// Room Tier Limits
// ──────────────────────────────────────────────

export interface RoomTierConfig {
  maxParticipants: number;
  maxPublishers: number;
  label: string;
  description: string;
}

export const ROOM_TIER_LIMITS: Record<RoomType, RoomTierConfig> = {
  [RoomType.ONE_ON_ONE]: {
    maxParticipants: 2,
    maxPublishers: 2,
    label: '1:1 Tutoring',
    description: 'Private tutoring or office hours',
  },
  [RoomType.SMALL_CLASS]: {
    maxParticipants: 15,
    maxPublishers: 15,
    label: 'Small Class',
    description: 'Seminars and workshops — all can publish',
  },
  [RoomType.MEDIUM_CLASS]: {
    maxParticipants: 50,
    maxPublishers: 6,
    label: 'Medium Class',
    description: 'Standard lectures — instructor + 5 active students',
  },
  [RoomType.LARGE_LECTURE]: {
    maxParticipants: 150,
    maxPublishers: 3,
    label: 'Large Lecture',
    description: 'University lectures — instructor and TAs only',
  },
  [RoomType.WEBINAR]: {
    maxParticipants: 500,
    maxPublishers: 1,
    label: 'Webinar',
    description: 'Broadcast mode — single presenter',
  },
};

// ──────────────────────────────────────────────
// Default Room Features
// ──────────────────────────────────────────────

export const DEFAULT_ROOM_FEATURES = {
  whiteboard: true,
  polling: true,
  qna: true,
  recording: false,
  breakoutRooms: false,
  screenShare: true,
  chat: true,
  waitingRoom: false,
};

// ──────────────────────────────────────────────
// WebSocket Events
// ──────────────────────────────────────────────

export const WS_EVENTS = {
  // Connection
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  AUTHENTICATE: 'authenticate',
  AUTHENTICATED: 'authenticated',

  // Presence
  PRESENCE_JOIN: 'presence:join',
  PRESENCE_LEAVE: 'presence:leave',
  PRESENCE_UPDATE: 'presence:update',
  PRESENCE_LIST: 'presence:list',

  // Chat
  CHAT_SEND: 'chat:send',
  CHAT_MESSAGE: 'chat:message',
  CHAT_HISTORY: 'chat:history',

  // Hand Raise
  HAND_RAISE: 'hand:raise',
  HAND_LOWER: 'hand:lower',
  HAND_UPDATE: 'hand:update',

  // Reactions
  REACTION_SEND: 'reaction:send',
  REACTION_BROADCAST: 'reaction:broadcast',

  // Poll
  POLL_CREATE: 'poll:create',
  POLL_STARTED: 'poll:started',
  POLL_VOTE: 'poll:vote',
  POLL_RESULTS: 'poll:results',
  POLL_CLOSE: 'poll:close',
  POLL_ENDED: 'poll:ended',

  // Q&A
  QNA_ASK: 'qna:ask',
  QNA_NEW: 'qna:new',
  QNA_UPVOTE: 'qna:upvote',
  QNA_ANSWER: 'qna:answer',
  QNA_UPDATED: 'qna:updated',
  QNA_LIST: 'qna:list',

  // Room Control
  ROOM_MUTE: 'room:mute',
  ROOM_KICK: 'room:kick',
  ROOM_LOCK: 'room:lock',
  ROOM_END: 'room:end',
  ROOM_ADMIT: 'room:admit',

  // Lobby
  LOBBY_REQUEST: 'lobby:request',
  LOBBY_QUEUE: 'lobby:queue',
  LOBBY_ADMITTED: 'lobby:admitted',
  LOBBY_REJECT: 'lobby:reject',
  LOBBY_REJECTED: 'lobby:rejected',

  // Errors
  ERROR: 'error',
} as const;

// ──────────────────────────────────────────────
// Reactions
// ──────────────────────────────────────────────

export const REACTIONS = ['👏', '👍', '❓', '🔥', '😂', '❤️', '🎉', '✋'] as const;
export type Reaction = (typeof REACTIONS)[number];

// ──────────────────────────────────────────────
// Misc Constants
// ──────────────────────────────────────────────

export const MAX_CHAT_MESSAGE_LENGTH = 1000;
export const MAX_QNA_QUESTION_LENGTH = 500;
export const MAX_POLL_OPTIONS = 8;
export const CHAT_HISTORY_LIMIT = 100;
