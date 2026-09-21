import { Type } from "class-transformer";
import {
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

export class CreateOrderItemDto {
  @IsUUID()
  serviceId!: string;

  @IsString()
  itemName!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsNumber()
  weightKg?: number;

  @IsOptional()
  @IsString()
  customerNotes?: string;
}

export class CreateOrderDto {
  @IsUUID()
  idempotencyKey!: string;

  @IsOptional()
  @IsUUID()
  packageSubscriptionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  couponCode?: string;

  @IsOptional()
  @IsInt()
  @Min(1000, {message: 'Redeem at least 1,000 points (₹100)'})
  loyaltyPointsToRedeem?: number;
  @IsUUID()
  pickupAddressId!: string;

  @IsUUID()
  deliveryAddressId!: string;

  @IsOptional()
  @IsUUID()
  facilityId?: string;

  @IsISO8601()
  pickupScheduledAt!: string;

  @IsString()
  @MaxLength(100)
  pickupSlotLabel!: string;

  @IsEnum([
    "razorpay",
    "cash_on_delivery",
    "package_credit",
    "loyalty_points",
  ] as const)
  paymentMethod!: string;

  /*
   * Customer must explicitly accept
   * Terms & Conditions before the
   * backend allows order creation.
   */
  @IsBoolean()
  @Equals(true, {
    message:
      "Terms and Conditions must be accepted before placing the order",
  })
  termsAccepted!: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
