import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { ProductionService } from './production.service';

@Controller('health')
export class ProductionController {
  constructor(private readonly service: ProductionService) {}

  @Public()
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  async ready() {
    const result = await this.service.readiness();
    if (!result.ready) {
      throw new ServiceUnavailableException({ status: 'not_ready', ...result });
    }
    return { status: 'ready', ...result };
  }
}
