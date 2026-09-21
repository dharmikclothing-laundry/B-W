import {Controller, Get, Header, Query, UseGuards} from '@nestjs/common';
import {Roles} from '../../common/decorators/roles.decorator';
import {RolesGuard} from '../../common/guards/roles.guard';
import {AnalyticsReportsService} from './analytics-reports.service';

@Controller('admin/analytics')
@UseGuards(RolesGuard)
@Roles('admin')
export class AnalyticsReportsController {
  constructor(private readonly reports: AnalyticsReportsService) {}
  @Get('report') report(@Query() filters: Record<string, string>) { return this.reports.report(filters); }
  @Get('audit') audit(@Query() filters: Record<string, string>) { return this.reports.audit(filters); }
  @Get('report.csv') @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="bw-admin-report.csv"')
  reportCsv(@Query() filters: Record<string, string>) { return this.reports.reportCsv(filters); }
  @Get('audit.csv') @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="bw-admin-audit.csv"')
  auditCsv(@Query() filters: Record<string, string>) { return this.reports.auditCsv(filters); }
}
