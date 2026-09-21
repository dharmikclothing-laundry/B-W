import { Controller, Get, UseGuards } from '@nestjs/common';

import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ProductionService } from './production.service';

@Controller('admin/diagnostics')
@UseGuards(RolesGuard)
@Roles('admin', 'manager')
export class ProviderDiagnosticsController {
  constructor(private readonly service: ProductionService) {}

  @Get('providers')
  providers() {
    return this.service.providerDiagnostics();
  }
}
