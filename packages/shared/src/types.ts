// ──────────────────────────────────────────────
// User & Auth Types
// ──────────────────────────────────────────────

export enum UserRole {
  ADMIN = 'ADMIN',
  INSTRUCTOR = 'INSTRUCTOR',
  TEACHING_ASSISTANT = 'TEACHING_ASSISTANT',
  STUDENT = 'STUDENT',
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: UserRole;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  role?: UserRole;
}

// ──────────────────────────────────────────────
// Room Types
// ──────────────────────────────────────────────

export enum RoomType {
  ONE_ON_ONE = 'ONE_ON_ONE',
  SMALL_CLASS = 'SMALL_CLASS',
  MEDIUM_CLASS = 'MEDIUM_CLASS',
  LARGE_LECTURE = 'LARGE_LECTURE',
  WEBINAR = 'WEBINAR',
}

export enum RoomStatus {
  SCHEDULED = 'SCHEDULED',
  LIVE = 'LIVE',
  ENDED = 'ENDED',
}

export interface RoomFeatures {
  whiteboard: boolean;
  polling: boolean;
  qna: boolean;
  recording: boolean;
  breakoutRooms: boolean;
  screenShare: boolean;
  chat: boolean;
}

export interface Room {
  id: string;
  title: string;
  description?: string;
  type: RoomType;
  status: RoomStatus;
  createdBy: string;
  livekitRoomName: string;
  maxParticipants: number;
  maxPublishers: number;
  features: RoomFeatures;
  scheduledAt?: string;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
}

export interface CreateRoomRequest {
  title: string;
  description?: string;
  type: RoomType;
  scheduledAt?: string;
  features?: Partial<RoomFeatures>;
}

export interface JoinRoomResponse {
  room: Room;
  livekitToken: string;
  wsTicket: string;
  participantRole: ParticipantRole;
}

// ──────────────────────────────────────────────
// Participant Types
// ──────────────────────────────────────────────

export enum ParticipantRole {
  INSTRUCTOR = 'INSTRUCTOR',
  TEACHING_ASSISTANT = 'TEACHING_ASSISTANT',
  STUDENT = 'STUDENT',
}

export interface Participant {
  id: string;
  roomId: string;
  userId: string;
  user: User;
  role: ParticipantRole;
  joinedAt: string;
  leftAt?: string;
  isHandRaised: boolean;
  isMuted: boolean;
  isCameraOff: boolean;
}

// ──────────────────────────────────────────────
// Poll Types
// ──────────────────────────────────────────────

export enum PollStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
}

export interface PollOption {
  id: string;
  text: string;
  sortOrder: number;
  voteCount: number;
}

export interface Poll {
  id: string;
  roomId: string;
  createdBy: string;
  question: string;
  options: PollOption[];
  status: PollStatus;
  totalVotes: number;
  createdAt: string;
}

export interface CreatePollRequest {
  question: string;
  options: string[];
}

// ──────────────────────────────────────────────
// Q&A Types
// ──────────────────────────────────────────────

export interface QnAQuestion {
  id: string;
  roomId: string;
  askedBy: User;
  content: string;
  isAnswered: boolean;
  answerText?: string;
  answeredBy?: User;
  upvoteCount: number;
  hasUpvoted: boolean;
  createdAt: string;
}

export interface AskQuestionRequest {
  content: string;
}

// ──────────────────────────────────────────────
// Chat Types
// ──────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  sentAt: string;
}

export interface SendMessageRequest {
  content: string;
}
