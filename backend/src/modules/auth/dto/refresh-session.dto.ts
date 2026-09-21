import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RefreshSessionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  refreshToken!: string;
}
