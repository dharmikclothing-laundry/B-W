import {Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards} from '@nestjs/common';
import {IsIn, IsUUID} from 'class-validator';
import {Roles} from '../../common/decorators/roles.decorator';
import {RolesGuard} from '../../common/guards/roles.guard';
import {AdminAssignmentsService} from './admin-assignments.service';

class AssignDto {
  @IsUUID() driverId!: string;
  @IsIn(['pickup', 'delivery']) type!: 'pickup' | 'delivery';
}
class ReassignDto { @IsUUID() driverId!: string; }

@Controller('admin/assignments')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminAssignmentsController {
  constructor(private readonly operations: AdminAssignmentsService) {}
  @Get() overview() { return this.operations.overview(); }
  @Get('orders/:orderId') detail(@Param('orderId', ParseUUIDPipe) id: string) { return this.operations.detail(id); }
  @Post('orders/:orderId/assign') assign(@Req() req: any, @Param('orderId', ParseUUIDPipe) id: string, @Body() body: AssignDto) {
    return this.operations.assign(req.user.id, id, body.driverId, body.type);
  }
  @Post(':assignmentId/reassign') reassign(@Req() req: any, @Param('assignmentId', ParseUUIDPipe) id: string, @Body() body: ReassignDto) {
    return this.operations.reassign(req.user.id, id, body.driverId);
  }
}
