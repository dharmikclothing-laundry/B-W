import {
  Type,
} from 'class-transformer';

import {
  IsNumber,
  Max,
  Min,
} from 'class-validator';

export class ReverseGeocodeDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;
}
