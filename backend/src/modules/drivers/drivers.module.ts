import { Module } from '@nestjs/common';
import { DriversService } from './drivers.service';
import { DriverDashboardController } from './driver-dashboard.controller';

@Module({
  providers: [DriversService],
  controllers: [DriverDashboardController],
  exports: [DriversService],
})
export class DriversModule {}
