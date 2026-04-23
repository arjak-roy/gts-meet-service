import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { LivekitService } from '../livekit/livekit.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { ROOM_TIER_LIMITS, DEFAULT_ROOM_FEATURES } from '@gts-meet/shared';
import { RoomType, RoomStatus, LobbyRequestStatus } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly livekit: LivekitService,
    private readonly configService: ConfigService,
  ) {}

  private getAppUrl(): string {
    return this.configService.get<string>('NEXT_PUBLIC_APP_URL') || 'http://localhost:3000';
  }

  private createWsTicket(payload: Record<string, unknown>) {
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  private serializeLobbyRequest(request: {
    id: string;
    roomId: string;
    userId: string;
    status: LobbyRequestStatus;
    requestedAt: Date;
    decidedAt: Date | null;
    decidedById: string | null;
    updatedAt: Date;
    user?: { id: string; name: string };
  }, position?: number) {
    return {
      id: request.id,
      roomId: request.roomId,
      userId: request.userId,
      userName: request.user?.name,
      status: request.status,
      requestedAt: request.requestedAt.getTime(),
      decidedAt: request.decidedAt ? request.decidedAt.getTime() : null,
      decidedById: request.decidedById,
      updatedAt: request.updatedAt.getTime(),
      ...(typeof position === 'number' ? { position } : {}),
    };
  }

  private async assertLobbyModerator(roomId: string, userId: string) {
    const room = await this.findById(roomId);

    if (room.createdBy === userId) {
      return room;
    }

    const moderatorParticipant = await this.prisma.roomParticipant.findFirst({
      where: {
        roomId,
        userId,
        leftAt: null,
        role: {
          in: ['INSTRUCTOR', 'TEACHING_ASSISTANT'],
        },
      },
    });

    if (!moderatorParticipant) {
      throw new ForbiddenException('Only instructors or teaching assistants can manage lobby');
    }

    return room;
  }

  async getLobbyQueue(roomId: string, userId: string) {
    await this.assertLobbyModerator(roomId, userId);

    return this.getLobbyQueueSnapshot(roomId);
  }

  async getLobbyQueueSnapshot(roomId: string) {
    const requests = await this.prisma.lobbyRequest.findMany({
      where: {
        roomId,
        status: LobbyRequestStatus.PENDING,
      },
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
      orderBy: { requestedAt: 'asc' },
    });

    const pending = requests.map((request, index) => this.serializeLobbyRequest(request, index + 1));

    return {
      roomId,
      pending,
    };
  }

  async admitLobbyRequest(roomId: string, requestId: string, userId: string) {
    await this.assertLobbyModerator(roomId, userId);

    const request = await this.prisma.lobbyRequest.findFirst({
      where: {
        id: requestId,
        roomId,
      },
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Lobby request not found');
    }

    const updated = await this.prisma.lobbyRequest.update({
      where: { id: request.id },
      data: {
        status: LobbyRequestStatus.ADMITTED,
        decidedAt: new Date(),
        decidedById: userId,
      },
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
    });

    return {
      roomId,
      request: this.serializeLobbyRequest(updated),
    };
  }

  async rejectLobbyRequest(roomId: string, requestId: string, userId: string) {
    await this.assertLobbyModerator(roomId, userId);

    const request = await this.prisma.lobbyRequest.findFirst({
      where: {
        id: requestId,
        roomId,
      },
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Lobby request not found');
    }

    const updated = await this.prisma.lobbyRequest.update({
      where: { id: request.id },
      data: {
        status: LobbyRequestStatus.REJECTED,
        decidedAt: new Date(),
        decidedById: userId,
      },
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
    });

    return {
      roomId,
      request: this.serializeLobbyRequest(updated),
    };
  }

  async create(dto: CreateRoomDto, userId: string) {
    const tierConfig = ROOM_TIER_LIMITS[dto.type as keyof typeof ROOM_TIER_LIMITS];
    if (!tierConfig) {
      throw new BadRequestException(`Invalid room type: ${dto.type}`);
    }

    const livekitRoomName = `gts-${uuidv4().slice(0, 8)}`;
    const features = { ...DEFAULT_ROOM_FEATURES, ...(dto.features || {}) };

    // Create room in database
    const room = await this.prisma.room.create({
      data: {
        title: dto.title,
        description: dto.description,
        type: dto.type as RoomType,
        livekitRoomName,
        maxParticipants: tierConfig.maxParticipants,
        maxPublishers: tierConfig.maxPublishers,
        features,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        createdBy: userId,
      },
      include: {
        creator: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
      },
    });

    this.logger.log(`Room created: ${room.id} (${room.title}) by ${userId}`);
    return {
      ...room,
      inviteLink: `${this.getAppUrl()}/room/${room.id}`,
    };
  }

  async findAll(userId: string) {
    const rooms = await this.prisma.room.findMany({
      where: {
        OR: [
          { createdBy: userId },
          { participants: { some: { userId } } },
        ],
      },
      include: {
        creator: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        _count: {
          select: { participants: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return rooms.map((room) => ({
      ...room,
      inviteLink: `${this.getAppUrl()}/room/${room.id}`,
    }));
  }

  async findById(roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        creator: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        _count: {
          select: { participants: true },
        },
      },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    return {
      ...room,
      inviteLink: `${this.getAppUrl()}/room/${room.id}`,
    };
  }

  async getShareLink(roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true, title: true, status: true },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    return {
      roomId: room.id,
      title: room.title,
      status: room.status,
      inviteLink: `${this.getAppUrl()}/room/${room.id}`,
    };
  }

  async join(roomId: string, userId: string) {
    const room = await this.findById(roomId);

    // Check if room is active or scheduled
    if (room.status === 'ENDED') {
      throw new BadRequestException('This room has ended');
    }

    // Check capacity
    const activeParticipants = await this.prisma.roomParticipant.count({
      where: { roomId, leftAt: null },
    });

    if (activeParticipants >= room.maxParticipants) {
      throw new BadRequestException('Room is full');
    }

    // Get user info
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Determine participant role
    const isCreator = room.createdBy === userId;
    const participantRole = isCreator
      ? 'INSTRUCTOR'
      : user.role === 'TEACHING_ASSISTANT'
        ? 'TEACHING_ASSISTANT'
        : 'STUDENT';

    const features = room.features as Record<string, any>;
    const waitingRoomEnabled = Boolean(features?.waitingRoom);

    if (waitingRoomEnabled && participantRole === 'STUDENT') {
      const existingParticipant = await this.prisma.roomParticipant.findFirst({
        where: { roomId, userId, leftAt: null },
      });

      if (!existingParticipant) {
        const existingRequest = await this.prisma.lobbyRequest.findUnique({
          where: {
            roomId_userId: { roomId, userId },
          },
          include: {
            user: { select: { id: true, name: true } },
          },
        });

        const lobbyRequest = existingRequest
          ? existingRequest.status === LobbyRequestStatus.REJECTED
            ? await this.prisma.lobbyRequest.update({
                where: { id: existingRequest.id },
                data: {
                  status: LobbyRequestStatus.PENDING,
                  requestedAt: new Date(),
                  decidedAt: null,
                  decidedById: null,
                },
                include: {
                  user: { select: { id: true, name: true } },
                },
              })
            : existingRequest
          : await this.prisma.lobbyRequest.create({
              data: {
                roomId,
                userId,
                status: LobbyRequestStatus.PENDING,
              },
              include: {
                user: { select: { id: true, name: true } },
              },
            });

        if (lobbyRequest.status !== LobbyRequestStatus.ADMITTED) {
          const pendingQueue = await this.prisma.lobbyRequest.findMany({
            where: {
              roomId,
              status: LobbyRequestStatus.PENDING,
            },
            orderBy: { requestedAt: 'asc' },
            select: { userId: true },
          });

          const queuePosition = pendingQueue.findIndex((entry) => entry.userId === userId);
          const wsTicket = this.createWsTicket({
            userId,
            roomId,
            mode: 'LOBBY',
            requestId: lobbyRequest.id,
            exp: Date.now() + 3600000,
          });

          return {
            room: {
              ...room,
              status: 'LIVE' as const,
              inviteLink: `${this.getAppUrl()}/room/${room.id}`,
            },
            status: 'LOBBY',
            wsTicket,
            participantRole,
            lobby: {
              requestId: lobbyRequest.id,
              status: lobbyRequest.status,
              queuePosition: queuePosition >= 0 ? queuePosition + 1 : null,
              requestedAt: lobbyRequest.requestedAt.getTime(),
            },
          };
        }
      }
    }

    // Check if can publish
    const canPublish =
      participantRole === 'INSTRUCTOR' ||
      participantRole === 'TEACHING_ASSISTANT' ||
      room.type === 'ONE_ON_ONE' ||
      room.type === 'SMALL_CLASS';

    // Create participant record if user is not already active in room.
    const activeParticipant = await this.prisma.roomParticipant.findFirst({
      where: { roomId, userId, leftAt: null },
      orderBy: { joinedAt: 'desc' },
    });

    if (!activeParticipant) {
      await this.prisma.roomParticipant.create({
        data: {
          roomId,
          userId,
          role: participantRole,
        },
      });
    }

    // If room is scheduled, start it
    if (room.status === 'SCHEDULED') {
      await this.prisma.room.update({
        where: { id: roomId },
        data: { status: 'LIVE', startedAt: new Date() },
      });

      // Create LiveKit room
      try {
        await this.livekit.createRoom(room.livekitRoomName, room.maxParticipants);
      } catch (error) {
        this.logger.warn(`LiveKit room creation failed (may already exist): ${error}`);
      }
    }

    // Generate LiveKit token
    const livekitToken = await this.livekit.generateToken({
      roomName: room.livekitRoomName,
      participantIdentity: userId,
      participantName: user.name,
      canPublish,
      canSubscribe: true,
      canPublishData: true,
      isAdmin: participantRole === 'INSTRUCTOR',
    });

    // Generate a simple WS ticket (in production, use a more secure approach)
    const wsTicket = this.createWsTicket({
      userId,
      roomId,
      role: participantRole,
      mode: 'ROOM',
      exp: Date.now() + 3600000,
    });

    return {
      room: {
        ...room,
        status: 'LIVE' as const,
        inviteLink: `${this.getAppUrl()}/room/${room.id}`,
      },
      status: 'READY',
      livekitToken,
      wsTicket,
      participantRole,
    };
  }

  async leave(roomId: string, userId: string) {
    await this.prisma.lobbyRequest.deleteMany({
      where: { roomId, userId },
    });

    // Mark participant as left
    const participant = await this.prisma.roomParticipant.findFirst({
      where: { roomId, userId, leftAt: null },
      orderBy: { joinedAt: 'desc' },
    });

    if (participant) {
      await this.prisma.roomParticipant.update({
        where: { id: participant.id },
        data: { leftAt: new Date() },
      });
    }

    // Check if room is now empty
    const remaining = await this.prisma.roomParticipant.count({
      where: { roomId, leftAt: null },
    });

    if (remaining === 0) {
      const room = await this.prisma.room.findUnique({ where: { id: roomId } });
      if (room && room.status === 'LIVE') {
        await this.prisma.room.update({
          where: { id: roomId },
          data: { status: 'ENDED', endedAt: new Date() },
        });

        // Clean up LiveKit room
        await this.livekit.deleteRoom(room.livekitRoomName);
      }
    }

    return { message: 'Left room successfully' };
  }

  async endRoom(roomId: string, userId: string) {
    const room = await this.findById(roomId);

    if (room.createdBy !== userId) {
      throw new ForbiddenException('Only the room creator can end the room');
    }

    await this.prisma.room.update({
      where: { id: roomId },
      data: { status: 'ENDED', endedAt: new Date() },
    });

    // Mark all participants as left
    await this.prisma.roomParticipant.updateMany({
      where: { roomId, leftAt: null },
      data: { leftAt: new Date() },
    });

    // Clean up LiveKit room
    await this.livekit.deleteRoom(room.livekitRoomName);

    return { message: 'Room ended' };
  }

  async getParticipants(roomId: string) {
    return this.prisma.roomParticipant.findMany({
      where: { roomId, leftAt: null },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatarUrl: true, role: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }
}
