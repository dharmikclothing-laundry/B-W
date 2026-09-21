import { Transform, Type } from "class-transformer";
import {
  IsNumber,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class VerifyPaymentDto {
  @IsString()
  @Matches(/^(?:order|mock_order)_[A-Za-z0-9-]+$/)
  razorpayOrderId!: string;

  @IsString()
  @Matches(/^(?:pay|mock_payment)_[A-Za-z0-9-]+$/)
  razorpayPaymentId!: string;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/i)
  razorpaySignature!: string;
}

export class RequestRefundDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  reason!: string;
}
