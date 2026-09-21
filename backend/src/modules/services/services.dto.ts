import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsUUID } from "class-validator";

export class ListServicesQueryDto {
  @ApiPropertyOptional({
    format: "uuid",
    description:
      "Active facility UUID. Omit to use global prices; no facility is inferred and no global fallback is applied for a supplied facility.",
  })
  @IsOptional()
  @IsUUID()
  facilityId?: string;
}

export class ServicePriceDto {
  @ApiProperty({
    format: "uuid",
    description: "Service UUID.",
  })
  id!: string;

  @ApiProperty({
    type: String,
    format: "uuid",
    nullable: true,
    description:
      "Service category UUID. Null means the service is not assigned to a category.",
  })
  categoryId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "Customer-facing category name, for example Wash & Iron or Dry Cleaning.",
  })
  categoryName!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty({
    type: String,
    nullable: true,
  })
  description!: string | null;

  @ApiProperty({
    description:
      "Stored pricing unit, for example piece, set, kg, pair, order, or quote.",
  })
  pricingUnit!: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      "Current database price. Null means there is no current fixed price in the requested scope, for example quote-based services. Order creation rechecks prices.",
  })
  price!: number | null;

  @ApiProperty({
    type: String,
    format: "uuid",
    nullable: true,
    description:
      "Requested facility UUID, or null when global pricing is being used.",
  })
  facilityId!: string | null;
}
