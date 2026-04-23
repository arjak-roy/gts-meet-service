import { IsString, IsOptional, IsEnum, IsDateString, IsObject, MinLength, MaxLength } from 'class-validator';
import { RoomType } from '@gts-meet/shared';

export class CreateRoomDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsEnum(RoomType)
  type: RoomType;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsObject()
  features?: Record<string, boolean>;
}
