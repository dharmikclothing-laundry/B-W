import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ClaimsService } from './claims.service';
import {
  AttachClaimPhotoDto,
  CreateClaimPhotoUploadDto,
  CreateCustomerClaimDto,
} from './dto/claim.dto';

@Controller()
export class ClaimsController {
  constructor(private readonly claims: ClaimsService) {}

  @Post('orders/:orderId/claims')
  create(
    @Req() req: any,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() body: CreateCustomerClaimDto,
  ) {
    return this.claims.create(req.user.id, orderId, body);
  }

  @Get('orders/:orderId/claims')
  list(
    @Req() req: any,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.claims.listForOrder(req.user.id, orderId);
  }

  @Get('claims/:claimId')
  one(
    @Req() req: any,
    @Param('claimId', ParseUUIDPipe) claimId: string,
  ) {
    return this.claims.getOne(req.user.id, claimId);
  }

  @Post('claims/:claimId/photos/upload-url')
  upload(
    @Req() req: any,
    @Param('claimId', ParseUUIDPipe) claimId: string,
    @Body() body: CreateClaimPhotoUploadDto,
  ) {
    return this.claims.createPhotoUpload(req.user.id, claimId, body.fileName);
  }

  @Post('claims/:claimId/photos')
  attach(
    @Req() req: any,
    @Param('claimId', ParseUUIDPipe) claimId: string,
    @Body() body: AttachClaimPhotoDto,
  ) {
    return this.claims.attachPhoto(req.user.id, claimId, body.photoPath);
  }
}
