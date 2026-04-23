import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateRoomDto } from './dto/create-room.dto';

@Controller('rooms')
@UseGuards(JwtAuthGuard)
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  async create(@Body() dto: CreateRoomDto, @CurrentUser('id') userId: string) {
    return this.roomsService.create(dto, userId);
  }

  @Get()
  async findAll(@CurrentUser('id') userId: string) {
    return this.roomsService.findAll(userId);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.roomsService.findById(id);
  }

  @Get(':id/share-link')
  async getShareLink(@Param('id') id: string) {
    return this.roomsService.getShareLink(id);
  }

  @Post(':id/join')
  @HttpCode(HttpStatus.OK)
  async join(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.roomsService.join(id, userId);
  }

  @Post(':id/leave')
  @HttpCode(HttpStatus.OK)
  async leave(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.roomsService.leave(id, userId);
  }

  @Post(':id/end')
  @HttpCode(HttpStatus.OK)
  async end(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.roomsService.endRoom(id, userId);
  }

  @Get(':id/participants')
  async getParticipants(@Param('id') id: string) {
    return this.roomsService.getParticipants(id);
  }

  @Get(':id/lobby')
  async getLobbyQueue(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.roomsService.getLobbyQueue(id, userId);
  }

  @Post(':id/lobby/:requestId/admit')
  @HttpCode(HttpStatus.OK)
  async admitLobbyRequest(
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.roomsService.admitLobbyRequest(id, requestId, userId);
  }

  @Post(':id/lobby/:requestId/reject')
  @HttpCode(HttpStatus.OK)
  async rejectLobbyRequest(
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.roomsService.rejectLobbyRequest(id, requestId, userId);
  }
}
