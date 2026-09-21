import { Controller, Get, Param, ParseUUIDPipe, Req } from '@nestjs/common';
import { DriversService } from './drivers.service';

@Controller('drivers/me')
export class DriverDashboardController {
  constructor(private readonly drivers: DriversService) {}

  @Get('dashboard')
  dashboard(@Req() request: any) {
    return this.drivers.dashboard(request.user.id);
  }

  @Get('assignments/:id')
  assignment(@Req() request: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.drivers.assignment(request.user.id, id);
  }

  @Get('assignments/:id/handoff-qr')
  handoffQr(@Req() request: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.drivers.handoffQr(request.user.id, id);
  }
}
