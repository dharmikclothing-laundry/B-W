import {IsBoolean, IsNumber, IsOptional, IsString, Matches, MaxLength, MinLength} from 'class-validator';

export class UpdateCustomerDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(150)
  @Matches(/^(?=.*\p{L})[\p{L}\p{M} .'’-]+$/u)
  fullName?: string;

  @IsOptional() @IsString() avatarPath?: string;
}

export class CreateAddressDto {
  @IsOptional() @IsString() label?: string;
  @IsString() addressLine1!: string;
  @IsOptional() @IsString() addressLine2?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() postalCode?: string;
  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}
