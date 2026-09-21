import {
  Body,
  Controller,
  Post,
  Req,
} from '@nestjs/common';

import { DriversService } from './drivers.service';

@Controller('drivers')
export class DriversController {
  constructor(
    private readonly drivers: DriversService,
  ) {}

  @Post('me/location')
  location(
    @Req() req: any,
    @Body()
    body: {
      assignmentId: string;
      latitude: number;
      longitude: number;
      accuracyM?: number;
    },
  ) {
    return this.drivers.location(
      req.user.id,
      body.assignmentId,
      body.latitude,
      body.longitude,
      body.accuracyM,
    );
  }
}
