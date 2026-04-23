import { Module } from '@nestjs/common';
import { ClassroomGateway } from './classroom.gateway';
import { RoomsModule } from '../rooms/rooms.module';

@Module({
  imports: [RoomsModule],
  providers: [ClassroomGateway],
  exports: [ClassroomGateway],
})
export class WebsocketModule {}
