import { Controller, Get, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { ListServicesQueryDto, ServicePriceDto } from "./services.dto";
import { ServicesService } from "./services.service";

@ApiTags("services")
@ApiBearerAuth()
@Controller("services")
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get('pricing-policy')
  pricingPolicy() { return this.services.pricingPolicy(); }

  @Get()
  @ApiOperation({
    summary: "List active services with current prices",
    description:
      "Available to authenticated active profiles, including customers. Uses the same price scope and effective dates as order creation. Missing prices are null; a facility-specific request does not fall back to global prices.",
  })
  @ApiOkResponse({ type: ServicePriceDto, isArray: true })
  @ApiBadRequestResponse({ description: "Invalid query parameter" })
  @ApiUnauthorizedResponse({
    description: "Missing/invalid session or inactive profile",
  })
  @ApiNotFoundResponse({ description: "Facility is missing or inactive" })
  @ApiServiceUnavailableResponse({
    description: "Catalogue database lookup failed",
  })
  list(@Query() query: ListServicesQueryDto) {
    return this.services.list(query.facilityId);
  }
}
