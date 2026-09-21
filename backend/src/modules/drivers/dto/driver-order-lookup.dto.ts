import {IsString, MaxLength, MinLength} from 'class-validator';

export class DriverOrderLookupDto {
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  code!: string;
}
