import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

export class PackedItemDto {
  @IsUUID() orderItemId!: string;
  @IsInt() @Min(0) packedQuantity!: number;
}
export class ConfirmPackingDto {
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9-]{6,40}$/) parcelId?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PackedItemDto)
  items!: PackedItemDto[];
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
