import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
  ) {}

  @Get()
  list(@Req() req: any) {
    return this.orders.listMine(
      req.user.id,
    );
  }

  @Post()
  create(
    @Req() req: any,
    @Body() dto: CreateOrderDto,
  ) {
    return this.orders.create(
      req.user.id,
      dto,
    );
  }

  @Post(':id/cancel')
  cancel(
    @Req() req: any,
    @Param('id', ParseUUIDPipe)
    id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.orders.cancel(
      req.user.id,
      id,
      dto.reason,
    );
  }

  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @Post(':id/claim-period')
  activateClaimPeriod(
    @Param('id', ParseUUIDPipe)
    id: string,
  ) {
    return this.orders.activateClaimPeriod(
      id,
    );
  }

  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @Post(':id/complete-claim-period')
  completeClaimPeriod(
    @Param('id', ParseUUIDPipe)
    id: string,
  ) {
    return this.orders.completeClaimPeriod(
      id,
    );
  }

  @Get(':id/status-history')
  history(
    @Req() req: any,
    @Param('id', ParseUUIDPipe)
    id: string,
  ) {
    return this.orders.history(
      req.user.id,
      id,
    );
  }

  @Get(':id')
  one(
    @Req() req: any,
    @Param('id', ParseUUIDPipe)
    id: string,
  ) {
    return this.orders.getById(
      req.user.id,
      id,
    );
  }
}
