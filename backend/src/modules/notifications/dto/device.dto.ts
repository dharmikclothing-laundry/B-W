import { IsIn, IsString, Length } from 'class-validator';

export class RegisterNotificationDeviceDto {
  @IsString()
  @Length(1, 4096)
  token!: string;

  @IsIn(['ios', 'android'])
  platform!: 'ios' | 'android';
}

export class DeactivateNotificationDeviceDto {
  @IsString()
  @Length(1, 4096)
  token!: string;
}
