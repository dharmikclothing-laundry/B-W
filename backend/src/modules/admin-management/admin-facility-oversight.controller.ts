import {Controller, Get, Param, ParseUUIDPipe, UseGuards} from '@nestjs/common';
import {Roles} from '../../common/decorators/roles.decorator';
import {RolesGuard} from '../../common/guards/roles.guard';
import {AdminFacilityOversightService} from './admin-facility-oversight.service';

@Controller('admin/facilities')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminFacilityOversightController {
  constructor(private readonly oversight: AdminFacilityOversightService) {}

  @Get() list() { return this.oversight.list(); }
  @Get(':facilityId') facility(@Param('facilityId', ParseUUIDPipe) id: string) { return this.oversight.facility(id); }
  @Get(':facilityId/orders/:orderId') order(@Param('facilityId', ParseUUIDPipe) facilityId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string) { return this.oversight.order(facilityId, orderId); }
}
