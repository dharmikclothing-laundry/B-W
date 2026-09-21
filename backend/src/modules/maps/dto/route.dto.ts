import { Type } from "class-transformer";
import { IsNumber, Max, Min, ValidateNested } from "class-validator";

export class RouteCoordinateDto {
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

export class ComputeRouteDto {
  @ValidateNested()
  @Type(() => RouteCoordinateDto)
  origin!: RouteCoordinateDto;

  @ValidateNested()
  @Type(() => RouteCoordinateDto)
  destination!: RouteCoordinateDto;
}
