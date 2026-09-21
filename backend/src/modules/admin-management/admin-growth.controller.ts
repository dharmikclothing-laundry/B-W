import {Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards} from '@nestjs/common';
import {IsBoolean, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min} from 'class-validator';
import {Roles} from '../../common/decorators/roles.decorator';
import {RolesGuard} from '../../common/guards/roles.guard';
import {AdminGrowthService} from './admin-growth.service';

class OfferDto {
  @IsString() @MaxLength(64) couponCode!: string;
  @IsString() @MaxLength(120) name!: string;
  @IsString() discountType!: string;
  @IsNumber() @Min(0.01) discountValue!: number;
  @IsNumber() @Min(0) minimumOrderAmount!: number;
  @IsOptional() @IsNumber() @Min(0) maximumDiscount?: number | null;
  @IsOptional() @IsString() startsAt?: string | null;
  @IsOptional() @IsString() expiresAt?: string | null;
  @IsOptional() @IsInt() @Min(1) usageLimit?: number | null;
  @IsOptional() @IsString() @MaxLength(500) eligibilityNote?: string | null;
}
class PackageDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsNumber() @Min(0.01) price!: number;
  @IsInt() @Min(1) validityDays!: number;
}
class ActiveDto {@IsBoolean() isActive!: boolean;}
class EligibilityDto {@IsBoolean() eligible!: boolean; @IsOptional() @IsInt() @Min(0) usageLimit?: number | null;}
class SettingsDto {
  @IsBoolean() referralEnabled!: boolean;
  @IsInt() @Min(0) referralRewardPoints!: number;
  @IsNumber() @Min(0) loyaltyEarnPointsPerRupee!: number;
  @IsInt() @Min(1) loyaltyPointsPerRupee!: number;
  @IsNumber() @Min(0) loyaltyMinimumRedemptionRupees!: number;
}

@Controller('admin/growth') @UseGuards(RolesGuard) @Roles('admin')
export class AdminGrowthController {
  constructor(private readonly service: AdminGrowthService) {}
  @Get() overview() {return this.service.overview();}
  @Post('offers') createOffer(@Req() req: any, @Body() body: OfferDto) {return this.service.createOffer(req.user.id, body);}
  @Patch('offers/:id') updateOffer(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: OfferDto) {return this.service.updateOffer(req.user.id, id, body);}
  @Patch('offers/:id/active') offerActive(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: ActiveDto) {return this.service.setOfferActive(req.user.id, id, body.isActive);}
  @Post('packages') createPackage(@Req() req: any, @Body() body: PackageDto) {return this.service.createPackage(req.user.id, body);}
  @Patch('packages/:id') updatePackage(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: PackageDto) {return this.service.updatePackage(req.user.id, id, body);}
  @Patch('packages/:id/active') packageActive(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: ActiveDto) {return this.service.setPackageActive(req.user.id, id, body.isActive);}
  @Patch('packages/:id/services/:serviceId') eligibility(@Req() req: any, @Param('id', ParseUUIDPipe) id: string,
    @Param('serviceId', ParseUUIDPipe) serviceId: string, @Body() body: EligibilityDto) {
    return this.service.setPackageEligibility(req.user.id, id, serviceId, body.eligible, body.usageLimit ?? null);
  }
  @Patch('settings') settings(@Req() req: any, @Body() body: SettingsDto) {return this.service.setSettings(req.user.id, body);}
}
