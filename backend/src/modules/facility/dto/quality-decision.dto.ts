import {ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength} from 'class-validator';

export class QualityDecisionDto {
  @IsBoolean() approved!: boolean;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsIn(['stain', 'damage', 'finish', 'missing', 'other']) defectCode?: string;
  @IsOptional() @IsArray() @ArrayUnique() @IsUUID('4', {each: true}) affectedItemIds?: string[];
}
