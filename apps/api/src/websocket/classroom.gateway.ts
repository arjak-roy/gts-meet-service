import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { ForbiddenException, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { WS_EVENTS, MAX_CHAT_MESSAGE_LENGTH } from '@gts-meet/shared';
import { RoomsService } from '../rooms/rooms.service';

interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    roomId: string;
    role: string;
    userName: string;
    mode: 'ROOM' | 'LOBBY';
    lobbyRequestId?: string;
  };
}

@WebSocketGateway({
  namespace: '/classroom',
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
})
export class ClassroomGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ClassroomGateway.name);

  // Track connected users per room
  private roomUsers = new Map<string, Map<string, { userId: string; userName: string; role: string }>>();
  private lobbySocketsByRoom = new Map<string, Map<string, Set<string>>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly roomsService: RoomsService,
  ) {}

  private getLobbyRoomName(roomId: string) {
    return `lobby:${roomId}`;
  }

  private addLobbySocket(roomId: string, userId: string, socketId: string) {
    if (!this.lobbySocketsByRoom.has(roomId)) {
      this.lobbySocketsByRoom.set(roomId, new Map());
    }
    const roomMap = this.lobbySocketsByRoom.get(roomId)!;
    if (!roomMap.has(userId)) {
      roomMap.set(userId, new Set());
    }
    roomMap.get(userId)!.add(socketId);
  }

  private removeLobbySocket(roomId: string, userId: string, socketId: string) {
    const roomMap = this.lobbySocketsByRoom.get(roomId);
    if (!roomMap) return;

    const userSockets = roomMap.get(userId);
    if (!userSockets) return;

    userSockets.delete(socketId);
    if (userSockets.size === 0) {
      roomMap.delete(userId);
    }
    if (roomMap.size === 0) {
      this.lobbySocketsByRoom.delete(roomId);
    }
  }

  private getLobbySocketIds(roomId: string, userId: string): string[] {
    return Array.from(this.lobbySocketsByRoom.get(roomId)?.get(userId) || []);
  }

  private async broadcastLobbyQueue(roomId: string) {
    const snapshot = await this.roomsService.getLobbyQueueSnapshot(roomId);
    this.server.to(roomId).emit(WS_EVENTS.LOBBY_QUEUE, snapshot);
  }

  // ──────────────────────────────────────────────
  // Connection Lifecycle
  // ──────────────────────────────────────────────

  async handleConnection(client: AuthenticatedSocket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    const { userId, roomId, mode } = client.data || {};
    if (roomId && userId) {
      if (mode === 'LOBBY') {
        this.removeLobbySocket(roomId, userId, client.id);
        this.logger.log(`Lobby socket disconnected for ${userId} in room ${roomId}`);
        return;
      }

      // Remove from room tracking
      const roomMap = this.roomUsers.get(roomId);
      if (roomMap) {
        roomMap.delete(userId);
        if (roomMap.size === 0) {
          this.roomUsers.delete(roomId);
        }
      }

      // Broadcast leave
      client.to(roomId).emit(WS_EVENTS.PRESENCE_LEAVE, {
        userId,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`User ${userId} disconnected from room ${roomId}`);
    }
  }

  // ──────────────────────────────────────────────
  // Authentication & Room Join
  // ──────────────────────────────────────────────

  @SubscribeMessage(WS_EVENTS.AUTHENTICATE)
  async handleAuthenticate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { wsTicket: string; roomId: string },
  ) {
    try {
      // Decode the WS ticket
      const ticketData = JSON.parse(
        Buffer.from(data.wsTicket, 'base64').toString('utf-8'),
      );
      const mode = ticketData.mode === 'LOBBY' ? 'LOBBY' : 'ROOM';

      // Validate ticket expiry
      if (ticketData.exp < Date.now()) {
        client.emit(WS_EVENTS.ERROR, { message: 'Ticket expired' });
        client.disconnect();
        return;
      }

      // Validate room matches
      if (ticketData.roomId !== data.roomId) {
        client.emit(WS_EVENTS.ERROR, { message: 'Invalid room' });
        client.disconnect();
        return;
      }

      // Get user info
      const user = await this.prisma.user.findUnique({
        where: { id: ticketData.userId },
        select: { id: true, name: true, role: true },
      });

      if (!user) {
        client.emit(WS_EVENTS.ERROR, { message: 'User not found' });
        client.disconnect();
        return;
      }

      // Store user data on socket
      client.data = {
        userId: user.id,
        roomId: data.roomId,
        role: ticketData.role || user.role,
        userName: user.name,
        mode,
        lobbyRequestId: ticketData.requestId,
      };

      if (mode === 'LOBBY') {
        client.join(this.getLobbyRoomName(data.roomId));
        this.addLobbySocket(data.roomId, user.id, client.id);

        client.emit(WS_EVENTS.AUTHENTICATED, { success: true, mode: 'LOBBY' });

        if (ticketData.requestId) {
          const request = await this.prisma.lobbyRequest.findFirst({
            where: {
              id: ticketData.requestId,
              roomId: data.roomId,
              userId: user.id,
              status: 'PENDING',
            },
            select: {
              id: true,
              roomId: true,
              userId: true,
              requestedAt: true,
            },
          });

          if (request) {
            this.server.to(data.roomId).emit(WS_EVENTS.LOBBY_REQUEST, {
              id: request.id,
              roomId: request.roomId,
              userId: request.userId,
              userName: user.name,
              requestedAt: request.requestedAt.getTime(),
            });
            await this.broadcastLobbyQueue(data.roomId);
          }
        }

        return;
      }

      // Join the Socket.io room
      client.join(data.roomId);

      // Track user in room
      if (!this.roomUsers.has(data.roomId)) {
        this.roomUsers.set(data.roomId, new Map());
      }
      this.roomUsers.get(data.roomId)!.set(user.id, {
        userId: user.id,
        userName: user.name,
        role: ticketData.role,
      });

      // Send current presence list
      const presenceList = Array.from(
        this.roomUsers.get(data.roomId)!.values(),
      );
      client.emit(WS_EVENTS.AUTHENTICATED, { success: true });
      client.emit(WS_EVENTS.PRESENCE_LIST, presenceList);

      // Load recent chat history
      const chatHistory = await this.prisma.chatMessage.findMany({
        where: { roomId: data.roomId },
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
        orderBy: { sentAt: 'desc' },
        take: 100,
      });
      client.emit(WS_EVENTS.CHAT_HISTORY, chatHistory.reverse());

      // Broadcast join to others
      client.to(data.roomId).emit(WS_EVENTS.PRESENCE_JOIN, {
        userId: user.id,
        userName: user.name,
        role: ticketData.role,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(
        `User ${user.name} (${user.id}) authenticated and joined room ${data.roomId}`,
      );
    } catch (error) {
      this.logger.error(`Authentication failed: ${error}`);
      client.emit(WS_EVENTS.ERROR, { message: 'Authentication failed' });
      client.disconnect();
    }
  }

  @SubscribeMessage(WS_EVENTS.ROOM_ADMIT)
  async handleRoomAdmit(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { requestId: string },
  ) {
    const { userId, roomId, role, mode } = client.data;
    if (!userId || !roomId || mode !== 'ROOM') return;

    if (role !== 'INSTRUCTOR' && role !== 'TEACHING_ASSISTANT') {
      client.emit(WS_EVENTS.ERROR, { message: 'Not authorized to admit from lobby' });
      return;
    }

    try {
      const admitted = await this.roomsService.admitLobbyRequest(roomId, data.requestId, userId);
      const admittedUserId = admitted.request.userId;
      const joinPayload = await this.roomsService.join(roomId, admittedUserId);

      for (const socketId of this.getLobbySocketIds(roomId, admittedUserId)) {
        this.server.to(socketId).emit(WS_EVENTS.LOBBY_ADMITTED, {
          requestId: admitted.request.id,
          userId: admittedUserId,
          payload: joinPayload,
        });
      }

      await this.broadcastLobbyQueue(roomId);
      this.server.to(roomId).emit(WS_EVENTS.ROOM_ADMIT, {
        requestId: admitted.request.id,
        userId: admittedUserId,
      });
    } catch (error) {
      const message =
        error instanceof ForbiddenException
          ? 'Not authorized to admit from lobby'
          : 'Failed to admit from lobby';
      client.emit(WS_EVENTS.ERROR, { message });
      this.logger.error(`Lobby admit error: ${error}`);
    }
  }

  @SubscribeMessage(WS_EVENTS.LOBBY_REJECT)
  async handleLobbyReject(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { requestId: string },
  ) {
    const { userId, roomId, role, mode } = client.data;
    if (!userId || !roomId || mode !== 'ROOM') return;

    if (role !== 'INSTRUCTOR' && role !== 'TEACHING_ASSISTANT') {
      client.emit(WS_EVENTS.ERROR, { message: 'Not authorized to reject from lobby' });
      return;
    }

    try {
      const rejected = await this.roomsService.rejectLobbyRequest(roomId, data.requestId, userId);

      for (const socketId of this.getLobbySocketIds(roomId, rejected.request.userId)) {
        this.server.to(socketId).emit(WS_EVENTS.LOBBY_REJECTED, {
          requestId: rejected.request.id,
          userId: rejected.request.userId,
        });
      }

      await this.broadcastLobbyQueue(roomId);
    } catch (error) {
      const message =
        error instanceof ForbiddenException
          ? 'Not authorized to reject from lobby'
          : 'Failed to reject from lobby';
      client.emit(WS_EVENTS.ERROR, { message });
      this.logger.error(`Lobby reject error: ${error}`);
    }
  }

  // ──────────────────────────────────────────────
  // Chat
  // ──────────────────────────────────────────────

  @SubscribeMessage(WS_EVENTS.CHAT_SEND)
  async handleChatSend(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { content: string },
  ) {
    const { userId, roomId, userName } = client.data;
    if (!userId || !roomId) return;

    // Validate message
    const content = data.content?.trim();
    if (!content || content.length > MAX_CHAT_MESSAGE_LENGTH) return;

    // Persist message
    const message = await this.prisma.chatMessage.create({
      data: {
        roomId,
        userId,
        content,
      },
    });

    // Broadcast to room
    const chatMessage = {
      id: message.id,
      roomId,
      userId,
      userName,
      content,
      sentAt: message.sentAt.toISOString(),
    };

    this.server.to(roomId).emit(WS_EVENTS.CHAT_MESSAGE, chatMessage);
  }

  // ──────────────────────────────────────────────
  // Hand Raise
  // ──────────────────────────────────────────────

  @SubscribeMessage(WS_EVENTS.HAND_RAISE)
  async handleHandRaise(@ConnectedSocket() client: AuthenticatedSocket) {
    const { userId, roomId, userName } = client.data;
    if (!userId || !roomId) return;

    this.server.to(roomId).emit(WS_EVENTS.HAND_UPDATE, {
      userId,
      userName,
      isRaised: true,
      timestamp: new Date().toISOString(),
    });
  }

  @SubscribeMessage(WS_EVENTS.HAND_LOWER)
  async handleHandLower(@ConnectedSocket() client: AuthenticatedSocket) {
    const { userId, roomId, userName } = client.data;
    if (!userId || !roomId) return;

    this.server.to(roomId).emit(WS_EVENTS.HAND_UPDATE, {
      userId,
      userName,
      isRaised: false,
      timestamp: new Date().toISOString(),
    });
  }

  // ──────────────────────────────────────────────
  // Reactions
  // ──────────────────────────────────────────────

  @SubscribeMessage(WS_EVENTS.REACTION_SEND)
  async handleReaction(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { emoji: string },
  ) {
    const { userId, roomId, userName } = client.data;
    if (!userId || !roomId) return;

    this.server.to(roomId).emit(WS_EVENTS.REACTION_BROADCAST, {
      userId,
      userName,
      emoji: data.emoji,
      timestamp: new Date().toISOString(),
    });
  }

  // ──────────────────────────────────────────────
  // Polls
  // ──────────────────────────────────────────────

  @SubscribeMessage(WS_EVENTS.POLL_CREATE)
  async handlePollCreate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { question: string; options: string[] },
  ) {
    const { userId, roomId, role } = client.data;
    if (!userId || !roomId) return;

    // Only instructors and TAs can create polls
    if (role !== 'INSTRUCTOR' && role !== 'TEACHING_ASSISTANT') {
      client.emit(WS_EVENTS.ERROR, { message: 'Not authorized to create polls' });
      return;
    }

    // Create poll in database
    const poll = await this.prisma.poll.create({
      data: {
        roomId,
        createdBy: userId,
        question: data.question,
        status: 'ACTIVE',
        options: {
          create: data.options.map((text, index) => ({
            text,
            sortOrder: index,
          })),
        },
      },
      include: {
        options: { orderBy: { sortOrder: 'asc' } },
      },
    });

    // Broadcast to room
    this.server.to(roomId).emit(WS_EVENTS.POLL_STARTED, {
      id: poll.id,
      question: poll.question,
      options: poll.options.map((o) => ({
        id: o.id,
        text: o.text,
        sortOrder: o.sortOrder,
        voteCount: 0,
      })),
      status: poll.status,
      totalVotes: 0,
    });
  }

  @SubscribeMessage(WS_EVENTS.POLL_VOTE)
  async handlePollVote(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { pollId: string; optionId: string },
  ) {
    const { userId, roomId } = client.data;
    if (!userId || !roomId) return;

    try {
      // Check if already voted
      const existingVote = await this.prisma.pollVote.findUnique({
        where: { pollId_userId: { pollId: data.pollId, userId } },
      });

      if (existingVote) {
        client.emit(WS_EVENTS.ERROR, { message: 'Already voted' });
        return;
      }

      // Record vote
      await this.prisma.pollVote.create({
        data: {
          pollId: data.pollId,
          optionId: data.optionId,
          userId,
        },
      });

      // Get updated results
      const poll = await this.prisma.poll.findUnique({
        where: { id: data.pollId },
        include: {
          options: {
            orderBy: { sortOrder: 'asc' },
            include: { _count: { select: { votes: true } } },
          },
          _count: { select: { votes: true } },
        },
      });

      if (poll) {
        this.server.to(roomId).emit(WS_EVENTS.POLL_RESULTS, {
          pollId: poll.id,
          options: poll.options.map((o) => ({
            id: o.id,
            text: o.text,
            voteCount: o._count.votes,
          })),
          totalVotes: poll._count.votes,
        });
      }
    } catch (error) {
      this.logger.error(`Vote error: ${error}`);
    }
  }

  @SubscribeMessage(WS_EVENTS.POLL_CLOSE)
  async handlePollClose(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { pollId: string },
  ) {
    const { userId, roomId, role } = client.data;
    if (!userId || !roomId) return;

    if (role !== 'INSTRUCTOR' && role !== 'TEACHING_ASSISTANT') {
      client.emit(WS_EVENTS.ERROR, { message: 'Not authorized' });
      return;
    }

    await this.prisma.poll.update({
      where: { id: data.pollId },
      data: { status: 'CLOSED' },
    });

    // Get final results
    const poll = await this.prisma.poll.findUnique({
      where: { id: data.pollId },
      include: {
        options: {
          orderBy: { sortOrder: 'asc' },
          include: { _count: { select: { votes: true } } },
        },
        _count: { select: { votes: true } },
      },
    });

    if (poll) {
      this.server.to(roomId).emit(WS_EVENTS.POLL_ENDED, {
        pollId: poll.id,
        question: poll.question,
        options: poll.options.map((o) => ({
          id: o.id,
          text: o.text,
          voteCount: o._count.votes,
        })),
        totalVotes: poll._count.votes,
      });
    }
  }

  // ──────────────────────────────────────────────
  // Q&A
  // ──────────────────────────────────────────────

  @SubscribeMessage(WS_EVENTS.QNA_ASK)
  async handleQnAAsk(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { content: string },
  ) {
    const { userId, roomId, userName } = client.data;
    if (!userId || !roomId) return;

    const content = data.content?.trim();
    if (!content || content.length > 500) return;

    const question = await this.prisma.qnAQuestion.create({
      data: {
        roomId,
        askedById: userId,
        content,
      },
    });

    this.server.to(roomId).emit(WS_EVENTS.QNA_NEW, {
      id: question.id,
      content: question.content,
      askedBy: { id: userId, name: userName },
      upvoteCount: 0,
      isAnswered: false,
      createdAt: question.createdAt.toISOString(),
    });
  }

  @SubscribeMessage(WS_EVENTS.QNA_UPVOTE)
  async handleQnAUpvote(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { questionId: string },
  ) {
    const { userId, roomId } = client.data;
    if (!userId || !roomId) return;

    try {
      // Toggle upvote
      const existing = await this.prisma.qnAUpvote.findUnique({
        where: { questionId_userId: { questionId: data.questionId, userId } },
      });

      if (existing) {
        await this.prisma.qnAUpvote.delete({ where: { id: existing.id } });
        await this.prisma.qnAQuestion.update({
          where: { id: data.questionId },
          data: { upvoteCount: { decrement: 1 } },
        });
      } else {
        await this.prisma.qnAUpvote.create({
          data: { questionId: data.questionId, userId },
        });
        await this.prisma.qnAQuestion.update({
          where: { id: data.questionId },
          data: { upvoteCount: { increment: 1 } },
        });
      }

      // Get updated question
      const question = await this.prisma.qnAQuestion.findUnique({
        where: { id: data.questionId },
        include: {
          askedBy: { select: { id: true, name: true } },
          answeredBy: { select: { id: true, name: true } },
        },
      });

      if (question) {
        this.server.to(roomId).emit(WS_EVENTS.QNA_UPDATED, {
          id: question.id,
          content: question.content,
          askedBy: question.askedBy,
          upvoteCount: question.upvoteCount,
          isAnswered: question.isAnswered,
          answerText: question.answerText,
          answeredBy: question.answeredBy,
          createdAt: question.createdAt.toISOString(),
        });
      }
    } catch (error) {
      this.logger.error(`Upvote error: ${error}`);
    }
  }

  @SubscribeMessage(WS_EVENTS.QNA_ANSWER)
  async handleQnAAnswer(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { questionId: string; answerText: string },
  ) {
    const { userId, roomId, role } = client.data;
    if (!userId || !roomId) return;

    if (role !== 'INSTRUCTOR' && role !== 'TEACHING_ASSISTANT') {
      client.emit(WS_EVENTS.ERROR, { message: 'Not authorized' });
      return;
    }

    const question = await this.prisma.qnAQuestion.update({
      where: { id: data.questionId },
      data: {
        isAnswered: true,
        answerText: data.answerText,
        answeredById: userId,
      },
      include: {
        askedBy: { select: { id: true, name: true } },
        answeredBy: { select: { id: true, name: true } },
      },
    });

    this.server.to(roomId).emit(WS_EVENTS.QNA_UPDATED, {
      id: question.id,
      content: question.content,
      askedBy: question.askedBy,
      upvoteCount: question.upvoteCount,
      isAnswered: question.isAnswered,
      answerText: question.answerText,
      answeredBy: question.answeredBy,
      createdAt: question.createdAt.toISOString(),
    });
  }
}
