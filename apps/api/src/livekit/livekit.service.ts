import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

export interface TokenOptions {
  roomName: string;
  participantIdentity: string;
  participantName: string;
  canPublish: boolean;
  canSubscribe: boolean;
  canPublishData: boolean;
  isAdmin?: boolean;
}

@Injectable()
export class LivekitService {
  private readonly logger = new Logger(LivekitService.name);
  private readonly roomService: RoomServiceClient;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(private readonly config: ConfigService) {
    const apiUrl = this.config.get<string>('LIVEKIT_API_URL', 'http://localhost:7880');
    this.apiKey = this.config.get<string>('LIVEKIT_API_KEY', 'devkey');
    this.apiSecret = this.config.get<string>(
      'LIVEKIT_API_SECRET',
      'secret-dev-key-minimum-32-characters-long',
    );

    this.roomService = new RoomServiceClient(apiUrl, this.apiKey, this.apiSecret);
  }

  /**
   * Generate a LiveKit access token for a participant
   */
  async generateToken(options: TokenOptions): Promise<string> {
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity: options.participantIdentity,
      name: options.participantName,
    });

    token.addGrant({
      room: options.roomName,
      roomJoin: true,
      canPublish: options.canPublish,
      canSubscribe: options.canSubscribe,
      canPublishData: options.canPublishData,
      roomAdmin: options.isAdmin || false,
    });

    return await token.toJwt();
  }

  /**
   * Create a room in LiveKit
   */
  async createRoom(name: string, maxParticipants: number) {
    try {
      const room = await this.roomService.createRoom({
        name,
        maxParticipants,
        emptyTimeout: 600, // 10 minutes
        metadata: JSON.stringify({ service: 'gts-meet' }),
      });
      this.logger.log(`Created LiveKit room: ${name}`);
      return room;
    } catch (error) {
      this.logger.error(`Failed to create LiveKit room: ${error}`);
      throw error;
    }
  }

  /**
   * Delete a room in LiveKit
   */
  async deleteRoom(name: string) {
    try {
      await this.roomService.deleteRoom(name);
      this.logger.log(`Deleted LiveKit room: ${name}`);
    } catch (error) {
      this.logger.warn(`Failed to delete LiveKit room ${name}: ${error}`);
    }
  }

  /**
   * List active rooms
   */
  async listRooms() {
    return this.roomService.listRooms();
  }

  /**
   * Get participants in a room
   */
  async getParticipants(roomName: string) {
    return this.roomService.listParticipants(roomName);
  }

  /**
   * Remove a participant from a room
   */
  async removeParticipant(roomName: string, identity: string) {
    try {
      await this.roomService.removeParticipant(roomName, identity);
      this.logger.log(`Removed participant ${identity} from room ${roomName}`);
    } catch (error) {
      this.logger.warn(`Failed to remove participant: ${error}`);
    }
  }

  /**
   * Mute a participant's track
   */
  async muteParticipant(roomName: string, identity: string, trackSid: string, muted: boolean) {
    try {
      await this.roomService.mutePublishedTrack(roomName, identity, trackSid, muted);
    } catch (error) {
      this.logger.warn(`Failed to mute participant: ${error}`);
    }
  }
}
