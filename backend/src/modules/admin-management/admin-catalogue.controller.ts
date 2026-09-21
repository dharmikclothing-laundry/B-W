import {Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards} from '@nestjs/common';
import {IsBoolean, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min} from 'class-validator';
import {Roles} from '../../common/decorators/roles.decorator';
import {RolesGuard} from '../../common/guards/roles.guard';
import {AdminCatalogueService} from './admin-catalogue.service';

class CategoryDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
class ServiceDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsString() @MaxLength(30) pricingUnit?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
class PriceDto {
  @IsNumber({maxDecimalPlaces: 2}) @Min(0) price!: number;
  @IsOptional() @IsUUID() facilityId?: string;
}
class PolicyDto {
  @IsNumber({maxDecimalPlaces: 2}) @Min(0) pickupDeliveryFee!: number;
  @IsNumber({maxDecimalPlaces: 2}) @Min(0) freeDeliveryThreshold!: number;
  @IsNumber({maxDecimalPlaces: 2}) @Min(0) @Max(100) gstRatePercent!: number;
  @IsNumber({maxDecimalPlaces: 2}) @Min(0) minimumOrderAmount!: number;
}
class PackageEligibilityDto {
  @IsUUID() serviceId!: string;
  @IsBoolean() eligible!: boolean;
  @IsOptional() @IsNumber({maxDecimalPlaces: 0}) @Min(0) usageLimit?: number | null;
}

@Controller('admin/catalogue')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminCatalogueController {
  constructor(private readonly catalogue: AdminCatalogueService) {}
  @Get() overview() { return this.catalogue.overview(); }
  @Post('categories') createCategory(@Req() req: any, @Body() body: CategoryDto) { return this.catalogue.createCategory(req.user.id, body); }
  @Patch('categories/:id') updateCategory(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: CategoryDto) {
    return this.catalogue.updateCategory(req.user.id, id, body);
  }
  @Post('services') createService(@Req() req: any, @Body() body: ServiceDto) { return this.catalogue.createService(req.user.id, body); }
  @Patch('services/:id') updateService(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: ServiceDto) {
    return this.catalogue.updateService(req.user.id, id, body);
  }
  @Post('services/:id/prices') setPrice(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: PriceDto) {
    return this.catalogue.setPrice(req.user.id, id, body);
  }
  @Post('pricing-policy') setPolicy(@Req() req: any, @Body() body: PolicyDto) { return this.catalogue.setPolicy(req.user.id, body); }
  @Post('packages/:id/eligibility') setPackageEligibility(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: PackageEligibilityDto) {
    return this.catalogue.setPackageEligibility(req.user.id, id, body.serviceId, body.eligible, body.usageLimit ?? null);
  }
}
