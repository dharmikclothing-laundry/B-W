import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CreateCustomerClaimDto {
  @IsUUID()
  clientRequestId!: string;

  @IsIn(['damage', 'missing_item', 'quality', 'delivery', 'other'])
  claimType!: string;

  @IsString()
  @Length(10, 4000)
  description!: string;

  @IsOptional()
  @IsUUID()
  orderItemId?: string;
}

export class CreateClaimPhotoUploadDto {
  @IsString()
  @Length(1, 255)
  fileName!: string;
}

export class AttachClaimPhotoDto {
  @IsString()
  @Length(1, 1024)
  photoPath!: string;
}
