import {Module} from '@nestjs/common';
import {SupabaseModule} from '../supabase/supabase.module';
import {AdminManagementController} from './admin-management.controller';
import {AdminManagementService} from './admin-management.service';
import {AdminAssignmentsController} from './admin-assignments.controller';
import {AdminAssignmentsService} from './admin-assignments.service';
import {AdminCatalogueController} from './admin-catalogue.controller';
import {AdminCatalogueService} from './admin-catalogue.service';
import {AdminIssuesController} from './admin-issues.controller';
import {AdminIssuesService} from './admin-issues.service';
import {PaymentsModule} from '../payments/payments.module';
import {AdminGrowthController} from './admin-growth.controller';
import {AdminGrowthService} from './admin-growth.service';
import {AdminFacilityOversightController} from './admin-facility-oversight.controller';
import {AdminFacilityOversightService} from './admin-facility-oversight.service';

@Module({imports: [SupabaseModule, PaymentsModule], controllers: [AdminManagementController, AdminAssignmentsController, AdminCatalogueController, AdminIssuesController, AdminGrowthController, AdminFacilityOversightController], providers: [AdminManagementService, AdminAssignmentsService, AdminCatalogueService, AdminIssuesService, AdminGrowthService, AdminFacilityOversightService]})
export class AdminManagementModule {}
