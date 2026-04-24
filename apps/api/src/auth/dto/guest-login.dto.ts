import { IsString, IsNotEmpty } from 'class-validator';

export class GuestLoginDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}
