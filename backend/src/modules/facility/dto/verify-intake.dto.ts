import {Type} from 'class-transformer';
import {ArrayMinSize, IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested} from 'class-validator';

export class IntakeItemMeasurementDto {
  @IsUUID() orderItemId!: string;
  @IsInt() @Min(0) countedQuantity!: number;
  @IsOptional() @IsNumber({maxDecimalPlaces: 2}) @Min(0) weightKg?: number | null;
  @IsOptional() @IsBoolean() damaged?: boolean;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class VerifyIntakeDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({each: true}) @Type(() => IntakeItemMeasurementDto)
  items!: IntakeItemMeasurementDto[];
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class ResolveIntakeDiscrepancyDto {
  @IsString() @MaxLength(1000) notes!: string;
}
