import {
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SearchPlaceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  query!: string;
}
