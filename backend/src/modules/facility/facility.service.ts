import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { SupabaseService } from "../supabase/supabase.service";
import {VerifyIntakeDto} from './dto/verify-intake.dto';

@Injectable()
export class FacilityService {
  constructor(private readonly supabase: SupabaseService) {}

  private db() {
    return this.supabase.admin;
  }

  private async requireFacilityEmployee(profileId: string) {
    const { data: employee, error: employeeError } = await this.db()
      .from("facility_employees")
      .select("id,facility_id,profile_id,employee_role,is_active")
      .eq("profile_id", profileId)
      .eq("is_active", true)
      .maybeSingle();

    if (employeeError || !employee) {
      throw new ForbiddenException("Active facility employee access required");
    }

    const { data: facility, error: facilityError } = await this.db()
      .from('facilities').select('id,name,address,is_active')
      .eq('id', employee.facility_id).maybeSingle();
    if (facilityError || !facility?.is_active) {
      throw new ForbiddenException('Active facility required');
    }
    return { facilityId: employee.facility_id, role: employee.employee_role, facility };
  }

  async dashboard(profileId: string) {
    const access = await this.requireFacilityEmployee(profileId);
    const { data: orders, error } = await this.db().from('orders')
      .select('id,order_number,current_status,created_at,updated_at')
      .eq('facility_id', access.facilityId)
      .in('current_status', ['in_transit_to_facility', 'received_at_facility', 'verification', 'processing', 'quality_check', 'rework_required', 'ready_for_delivery'])
      .order('updated_at', { ascending: false }).limit(100);
    if (error) throw new BadRequestException('Facility dashboard unavailable');
    const queue = orders ?? [];
    return {
      facility: { id: access.facility.id, name: access.facility.name, address: access.facility.address },
      role: access.role,
      summary: {
        incoming: queue.filter(order => order.current_status === 'in_transit_to_facility').length,
        received: queue.filter(order => ['received_at_facility', 'verification'].includes(order.current_status)).length,
        processing: queue.filter(order => ['processing', 'quality_check', 'rework_required'].includes(order.current_status)).length,
        ready: queue.filter(order => order.current_status === 'ready_for_delivery').length,
      },
      orders: queue,
    };
  }

  private async requireOrder(orderId: string) {
    const { data, error } = await this.db()
      .from("orders")
      .select("id,facility_id,current_status")
      .eq("id", orderId)
      .maybeSingle();

    if (error || !data) {
      throw new NotFoundException("Order not found");
    }

    return data;
  }

  private ensureFacilityMatch(
    access: {
      facilityId: string | null;
    },
    orderFacilityId: string | null,
  ) {
    if (access.facilityId !== orderFacilityId) {
      throw new ForbiddenException("Order belongs to another facility");
    }
  }

  private async operationForOrder(orderId: string) {
    const { data, error } = await this.db()
      .from("facility_order_operations")
      .select("*")
      .eq("order_id", orderId)
      .order("started_at", {
        ascending: false,
        nullsFirst: false,
      })
      .order("id", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data;
  }

  private throwProcessingRpcError(
    error:
      | {
          code?: string;
          message?: string;
        }
      | null
      | undefined,
    fallback: string,
  ): never {
    const message = error?.message ?? fallback;

    if (error?.code === "P0002") {
      throw new NotFoundException(message);
    }

    if (error?.code === "42501") {
      throw new ForbiddenException(message);
    }

    if (["23505", "23514", "40001"].includes(error?.code ?? "")) {
      throw new ConflictException(message);
    }

    throw new BadRequestException(message);
  }

  private async receiptCandidate(profileId: string, token: string) {
    const access = await this.requireFacilityEmployee(profileId);
    if (typeof token !== 'string' || !/^(?:BW1:)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token.trim())) {
      throw new BadRequestException('Valid handoff code is required');
    }
    const secureToken = token.trim().replace(/^BW1:/, '');
    const { data: qr, error: qrError } = await this.db().from('order_qr_codes')
      .select('id,order_id,is_active').eq('secure_token', secureToken).maybeSingle();
    if (qrError || !qr?.is_active) throw new NotFoundException('Invalid QR code');
    const { data: order, error: orderError } = await this.db().from('orders')
      .select('id,order_number,facility_id,current_status,created_at').eq('id', qr.order_id).maybeSingle();
    if (orderError || !order) throw new NotFoundException('Order not found');
    this.ensureFacilityMatch(access, order.facility_id);
    if (order.current_status !== 'in_transit_to_facility') {
      throw new ConflictException(`Facility receipt is not allowed while order is ${order.current_status}`);
    }
    return {access, qr, order, secureToken};
  }

  async previewReceipt(profileId: string, token: string) {
    const {access, order} = await this.receiptCandidate(profileId, token);
    const {data: items, error} = await this.db().from('order_items')
      .select('item_name,quantity,weight_kg').eq('order_id', order.id);
    if (error) throw new BadRequestException('Order intake details unavailable');
    return {orderId: order.id, orderNumber: order.order_number, orderStatus: order.current_status,
      facility: {id: access.facility.id, name: access.facility.name}, items: items ?? []};
  }

  async receiveByQr(
    profileId: string,
    token: string,
    latitude?: number,
    longitude?: number,
  ) {
    const {secureToken} = await this.receiptCandidate(profileId, token);

    const { data: receipt, error: receiptError } = await this.db().rpc(
      "receive_facility_order_atomic",
      {
        p_secure_token: secureToken,
        p_scanner_profile_id: profileId,
        p_latitude: latitude ?? null,
        p_longitude: longitude ?? null,
      },
    );

    if (receiptError || !receipt) {
      throw new BadRequestException(
        receiptError?.message ?? "Unable to receive order at facility",
      );
    }

    return {
      orderId: receipt.orderId,
      operationId: receipt.operationId,
      facilityStatus: receipt.facilityStatus,
      orderStatus: receipt.orderStatus,
      pickupAssignmentStatus: receipt.pickupAssignmentStatus,
      received: receipt.received,
    };
  }

  async verifyOrder(
    profileId: string,
    orderId: string,
    body: {
      itemCount?: number;
      weightKg?: number;
      notes?: string;
    },
  ) {
    const access = await this.requireFacilityEmployee(profileId);

    const order = await this.requireOrder(orderId);

    this.ensureFacilityMatch(access, order.facility_id);

    if (order.current_status !== "received_at_facility") {
      throw new ConflictException(
        `Verification is not allowed while order is ${order.current_status}`,
      );
    }

    const operation = await this.operationForOrder(orderId);

    if (!operation) {
      throw new ConflictException("Facility operation has not been created");
    }

    if (operation.current_status !== "received") {
      throw new ConflictException(
        `Facility operation is already ${operation.current_status}`,
      );
    }

    const { data: verification, error: verificationError } =
      await this.db().rpc("record_facility_verification_atomic", {
        p_order_id: orderId,
        p_performed_by: profileId,
        p_item_count: body.itemCount ?? null,
        p_weight_kg: body.weightKg ?? null,
        p_notes: body.notes ?? null,
      });

    if (verificationError || !verification) {
      throw new BadRequestException(
        verificationError?.message ??
          "Unable to record facility verification",
      );
    }

    return {
      orderId,
      operationId: verification.operationId,
      verified: true,
      facilityStatus: "verification",
      orderStatus: "verification",
    };
  }

  async intakeDetails(profileId: string, orderId: string) {
    const access = await this.requireFacilityEmployee(profileId);
    const {data: order, error: orderError} = await this.db().from('orders')
      .select('id,order_number,facility_id,current_status').eq('id', orderId).maybeSingle();
    if (orderError || !order) throw new NotFoundException('Order not found');
    this.ensureFacilityMatch(access, order.facility_id);
    const [items, inspections, discrepancies] = await Promise.all([
      this.db().from('order_items').select('id,item_name,quantity,weight_kg').eq('order_id', orderId).order('id'),
      this.db().from('garment_inspections').select('id,order_item_id,counted_quantity,weight_kg,condition_notes,created_at')
        .eq('order_id', orderId).not('order_item_id', 'is', null).order('created_at'),
      this.db().from('facility_intake_discrepancies')
        .select('id,order_item_id,kind,expected_quantity,counted_quantity,expected_weight_kg,measured_weight_kg,notes,status,created_at,resolved_at,resolution_notes')
        .eq('order_id', orderId).order('created_at'),
    ]);
    if (items.error || inspections.error || discrepancies.error) {
      throw new BadRequestException('Facility intake details unavailable');
    }
    return {orderId, orderNumber: order.order_number, orderStatus: order.current_status,
      facility: {id: access.facility.id, name: access.facility.name}, role: access.role,
      items: items.data ?? [], inspections: inspections.data ?? [], discrepancies: discrepancies.data ?? []};
  }

  async verifyIntake(profileId: string, orderId: string, body: VerifyIntakeDto) {
    const access = await this.requireFacilityEmployee(profileId);
    const order = await this.requireOrder(orderId);
    this.ensureFacilityMatch(access, order.facility_id);
    if (order.current_status !== 'received_at_facility') {
      throw new ConflictException(`Verification is not allowed while order is ${order.current_status}`);
    }
    const {data, error} = await this.db().rpc('record_facility_intake_verification_atomic', {
      p_order_id: orderId, p_performed_by: profileId, p_items: body.items, p_notes: body.notes?.trim() || null,
    });
    if (error || !data) this.throwProcessingRpcError(error, 'Unable to verify Facility intake');
    return {orderId, operationId: data.operationId, verified: true,
      orderStatus: data.orderStatus, discrepancyCount: data.discrepancyCount};
  }

  async resolveIntakeDiscrepancy(profileId: string, orderId: string, discrepancyId: string, notes: string) {
    const access = await this.requireFacilityEmployee(profileId);
    if (access.role !== 'manager') throw new ForbiddenException('Facility Manager resolution required');
    if (!notes?.trim()) throw new BadRequestException('Resolution notes are required');
    const order = await this.requireOrder(orderId);
    this.ensureFacilityMatch(access, order.facility_id);
    const {data, error} = await this.db().from('facility_intake_discrepancies')
      .update({status: 'resolved', resolved_by: profileId, resolved_at: new Date().toISOString(),
        resolution_notes: notes.trim()})
      .eq('id', discrepancyId).eq('order_id', orderId).eq('status', 'open')
      .select('id,status,resolved_at,resolution_notes').maybeSingle();
    if (error || !data) throw new ConflictException('Open Facility intake discrepancy not found');
    return data;
  }

  async processingHistory(profileId: string, orderId: string) {
    const access = await this.requireFacilityEmployee(profileId);
    const order = await this.requireOrder(orderId);
    this.ensureFacilityMatch(access, order.facility_id);
    const {data, error} = await this.db().from('facility_order_operations')
      .select('id,operation_type,current_status,started_at,completed_at,started_by,completed_by,performed_by,rewash_cycle')
      .eq('order_id', orderId).order('started_at', {ascending: true}).order('id', {ascending: true});
    if (error) throw new BadRequestException('Facility processing history unavailable');
    const stages = (data ?? []).filter(operation =>
      ['washing', 'drying', 'ironing', 'folding', 'packaging'].includes(operation.operation_type));
    const active = stages.find(operation => !operation.completed_at);
    const completed = stages.filter(operation => operation.completed_at);
    const next: Record<string, string> = {
      verification: 'washing', washing: 'drying', drying: 'ironing',
      ironing: 'folding', folding: 'packaging',
    };
    const latest = stages[stages.length - 1];
    const expectedStage = active ? null : ['verification', 'rework_required'].includes(order.current_status) ? 'washing' :
      order.current_status === 'processing' && latest?.completed_at ? next[latest.operation_type] ?? null : null;
    const {count: openCount, error: discrepancyError} = await this.db()
      .from('facility_intake_discrepancies').select('id', {count: 'exact', head: true})
      .eq('order_id', orderId).eq('status', 'open');
    if (discrepancyError) throw new BadRequestException('Facility discrepancy status unavailable');
    const {data: decisions, error: qcError} = await this.db().from('facility_qc_decisions')
      .select('id,operation_id,cycle_number,approved,rewash_required,defect_code,reason,affected_item_ids,decided_by,created_at')
      .eq('order_id', orderId).order('created_at', {ascending: true});
    if (qcError) throw new BadRequestException('Facility QC history unavailable');
    return {orderId, orderStatus: order.current_status, stages, qualityDecisions: decisions ?? [],
      role: access.role, rewashCycle: (decisions ?? []).filter(decision => !decision.approved).length,
      canQualityCheck: access.role === 'manager' && order.current_status === 'processing' &&
        latest?.operation_type === 'packaging' && !!latest.completed_at && !openCount,
      activeOperationId: active?.id ?? null, nextStage: openCount ? null : expectedStage,
      openDiscrepancies: openCount ?? 0, completedStageCount: completed.length};
  }

  async packingDetails(profileId: string, orderId: string) {
    const access = await this.requireFacilityEmployee(profileId);
    const order = await this.requireOrder(orderId);
    this.ensureFacilityMatch(access, order.facility_id);
    const latest = await this.operationForOrder(orderId);
    const {data: verification, error: verificationError} = await this.db()
      .from('facility_order_operations').select('id').eq('order_id', orderId)
      .eq('operation_type', 'verification').order('started_at', {ascending: false})
      .limit(1).maybeSingle();
    if (verificationError) throw new BadRequestException('Facility verification unavailable');
    const [items, inspections, packings, policy] = await Promise.all([
      this.db().from('order_items').select('id,item_name,quantity').eq('order_id', orderId).order('id'),
      this.db().from('garment_inspections').select('order_item_id,counted_quantity')
        .eq('operation_id', verification?.id ?? '00000000-0000-0000-0000-000000000000').not('order_item_id', 'is', null),
      this.db().from('facility_packings').select('id,parcel_id,cycle_number,packed_by,packed_at,notes')
        .eq('order_id', orderId).order('cycle_number', {ascending: true}),
      this.db().from('facility_packing_policy_orders').select('order_id')
        .eq('order_id', orderId).maybeSingle(),
    ]);
    if (items.error || inspections.error || packings.error || policy.error) {
      throw new BadRequestException('Facility packing unavailable');
    }
    const verified = new Map((inspections.data ?? []).map(row => [row.order_item_id, row.counted_quantity]));
    const packingIds = (packings.data ?? []).map(row => row.id);
    const packedRows = packingIds.length ? await this.db().from('facility_packing_items')
      .select('packing_id,order_item_id,verified_quantity,packed_quantity').in('packing_id', packingIds) :
      {data: [], error: null};
    if (packedRows.error) throw new BadRequestException('Facility packing items unavailable');
    const history = (packings.data ?? []).map(packing => ({...packing,
      items: (packedRows.data ?? []).filter(item => item.packing_id === packing.id)}));
    return {orderId, orderStatus: order.current_status, facility: access.facility.name,
      packingRequired: !!policy.data,
      cycleNumber: latest?.rewash_cycle ?? 0,
      canPack: order.current_status === 'processing' && latest?.operation_type === 'packaging' &&
        !!latest.completed_at && !!verification && (items.data ?? []).length > 0 &&
        (items.data ?? []).every(item => verified.has(item.id)) &&
        !history.some(packing => packing.cycle_number === latest.rewash_cycle),
      items: (items.data ?? []).map(item => ({...item, verifiedQuantity: verified.get(item.id) ?? null})),
      history};
  }

  async confirmPacking(profileId: string, orderId: string,
    body: {parcelId: string; items: Array<{orderItemId: string; packedQuantity: number}>; notes?: string}) {
    const access = await this.requireFacilityEmployee(profileId);
    const order = await this.requireOrder(orderId);
    this.ensureFacilityMatch(access, order.facility_id);
    if (order.current_status !== 'processing') {
      throw new ConflictException(`Packing is not allowed while order is ${order.current_status}`);
    }
    const {data, error} = await this.db().rpc('confirm_facility_packing_atomic', {
      p_order_id: orderId, p_performed_by: profileId, p_parcel_id: body.parcelId,
      p_items: body.items, p_notes: body.notes?.trim() || null,
    });
    if (error || !data) this.throwProcessingRpcError(error, 'Unable to confirm packing');
    return data;
  }

  async startProcessing(
    profileId: string,
    orderId: string,
    processType: string,
    machineId?: string,
  ) {
    const access = await this.requireFacilityEmployee(profileId);

    const order = await this.requireOrder(orderId);

    this.ensureFacilityMatch(access, order.facility_id);

    if (
      !["verification", "processing", "rework_required"].includes(
        order.current_status,
      )
    ) {
      throw new ConflictException(
        `Processing is not allowed while order is ${order.current_status}`,
      );
    }

    const operation = await this.operationForOrder(orderId);

    if (!operation) {
      throw new ConflictException("Facility operation not found");
    }

    const allowedProcesses = [
      "washing",
      "drying",
      "ironing",
      "folding",
      "packaging",
    ];

    if (!allowedProcesses.includes(processType)) {
      throw new BadRequestException(
        `Invalid process type. Allowed: ${allowedProcesses.join(", ")}`,
      );
    }

    if (
      allowedProcesses.includes(operation.current_status) &&
      !operation.completed_at
    ) {
      throw new ConflictException(
        `Facility stage ${operation.current_status} is still in progress`,
      );
    }

    const nextStage: Record<string, string> = {
      verification: "washing",
      washing: "drying",
      drying: "ironing",
      ironing: "folding",
      folding: "packaging",
      rework_required: "washing",
    };
    const expectedProcess = nextStage[operation.current_status];

    if (!expectedProcess) {
      throw new ConflictException(
        `Processing cannot start from facility status ${operation.current_status}`,
      );
    }

    if (processType !== expectedProcess) {
      throw new ConflictException(
        `Expected facility stage ${expectedProcess}, received ${processType}`,
      );
    }

    if (machineId) {
      const { data: machine, error: machineError } = await this.db()
        .from("facility_machines")
        .select("id,facility_id,status")
        .eq("id", machineId)
        .maybeSingle();

      if (machineError || !machine) {
        throw new NotFoundException("Machine not found");
      }

      if (machine.facility_id !== order.facility_id) {
        throw new ForbiddenException("Machine belongs to another facility");
      }

      if (!["active", "idle"].includes(machine.status)) {
        throw new ConflictException(
          `Machine is not available: ${machine.status}`,
        );
      }
    }

    const { data: created, error } = await this.db().rpc(
      "start_facility_processing_atomic",
      {
        p_order_id: orderId,
        p_performed_by: profileId,
        p_process_type: processType,
        p_machine_id: machineId ?? null,
      },
    );

    if (error || !created) {
      this.throwProcessingRpcError(
        error,
        "Unable to start processing",
      );
    }

    return {
      ...created,
      operationId: created.operationId ?? created.id,
      previousFacilityStatus:
        created.previousFacilityStatus ?? operation.current_status,
      facilityStatus: created.facilityStatus ?? processType,
      orderStatus: created.orderStatus ?? "processing",
    };
  }

  async completeProcessing(profileId: string, operationId: string) {
    const access = await this.requireFacilityEmployee(profileId);

    const { data: operation, error } = await this.db()
      .from("facility_order_operations")
      .select("*")
      .eq("id", operationId)
      .maybeSingle();

    if (error || !operation) {
      throw new NotFoundException("Operation not found");
    }

    const order = await this.requireOrder(operation.order_id);

    this.ensureFacilityMatch(access, order.facility_id);

    if (order.current_status !== "processing") {
      throw new ConflictException(
        `Processing completion is not allowed while order is ${order.current_status}`,
      );
    }

    if (
      !["washing", "drying", "ironing", "folding", "packaging"].includes(
        operation.current_status,
      )
    ) {
      throw new ConflictException(
        `Facility status ${operation.current_status} is not an active processing stage`,
      );
    }

    const { data: updated, error: updateError } = await this.db().rpc(
      "complete_facility_processing_atomic",
      {
        p_operation_id: operationId,
        p_performed_by: profileId,
      },
    );

    if (updateError || !updated) {
      this.throwProcessingRpcError(
        updateError,
        "Unable to complete processing operation",
      );
    }

    return {
      ...updated,
      processingCompleted: true,
    };
  }

  async qualityCheck(
    profileId: string,
    orderId: string,
    approved: boolean,
    notes?: string,
    defectCode?: string,
    affectedItemIds?: string[],
  ) {
    const access = await this.requireFacilityEmployee(profileId);

    if (access.role !== 'manager') {
      throw new ForbiddenException('Facility Manager QC approval required');
    }
    if (!approved && (!['stain', 'damage', 'finish', 'missing', 'other'].includes(defectCode ?? '') ||
      !notes?.trim() || notes.trim().length < 5)) {
      throw new BadRequestException('Failed QC requires defect category and reason');
    }

    const order = await this.requireOrder(orderId);

    this.ensureFacilityMatch(access, order.facility_id);

    if (order.current_status !== "processing") {
      throw new ConflictException(
        `Quality check is not allowed while order is ${order.current_status}`,
      );
    }

    const operation = await this.operationForOrder(orderId);

    if (!operation) {
      throw new ConflictException("Facility operation not found");
    }

    if (
      operation.current_status !== "packaging" ||
      operation.operation_type !== "packaging" ||
      !operation.completed_at
    ) {
      throw new ConflictException(
        "Washing, drying, ironing, folding, and packaging must complete in order before quality check",
      );
    }

    const { data: qualityOperation, error: qualityOperationError } =
      await this.db().rpc("record_facility_qc_decision_atomic", {
        p_order_id: orderId,
        p_performed_by: profileId,
        p_approved: approved,
        p_defect_code: defectCode ?? null,
        p_reason: notes?.trim() || null,
        p_affected_item_ids: affectedItemIds ?? [],
      });

    if (qualityOperationError || !qualityOperation) {
      this.throwProcessingRpcError(qualityOperationError, 'Unable to record quality check');
    }

    return {
      orderId,
      operationId: qualityOperation.operationId,
      approved,
      rewashRequired: qualityOperation.rewashRequired,
      cycleNumber: qualityOperation.cycleNumber,
      facilityStatus: qualityOperation.facilityStatus,
      orderStatus: qualityOperation.orderStatus,
    };
  }
}
