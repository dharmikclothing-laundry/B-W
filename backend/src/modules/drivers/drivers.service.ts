import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { SupabaseService } from "../supabase/supabase.service";

const ACTIVE_ASSIGNMENT_STATUSES = [
  "assigned",
  "accepted",
  "en_route",
  "arrived",
];
const RELEVANT_ORDER_STATUSES: Record<"pickup" | "delivery", string[]> = {
  pickup: [
    "pickup_assigned",
    "pickup_accepted",
    "en_route_pickup",
    "pickup_otp_pending",
    "picked_up",
    "in_transit_to_facility",
  ],
  delivery: [
    "delivery_assigned",
    "delivery_accepted",
    "en_route_delivery",
    "delivery_otp_pending",
  ],
};
const QR_PAYLOAD =
  /^BW1:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const ORDER_NUMBER = /^BW-[A-Z0-9-]{6,40}$/i;

function operationallyRelevant(
  type: "pickup" | "delivery",
  assignmentStatus: string,
  orderStatus: string,
) {
  return (
    ACTIVE_ASSIGNMENT_STATUSES.includes(assignmentStatus) &&
    RELEVANT_ORDER_STATUSES[type].includes(orderStatus)
  );
}

function todayWindow() {
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const start = new Date(`${today}T00:00:00+05:30`);
  return {
    today,
    start: start.toISOString(),
    end: new Date(start.getTime() + 86_400_000).toISOString(),
  };
}

type Assignment = {
  id: string;
  order_id: string;
  driver_id: string;
  assignment_type: "pickup" | "delivery";
  status: string;
  assigned_at: string;
  accepted_at: string | null;
  completed_at: string | null;
};

@Injectable()
export class DriversService {
  constructor(private readonly supabase: SupabaseService) {}

  private async requireActiveDriver(profileId: string) {
    const { data, error } = await this.supabase.admin
      .from("drivers")
      .select("id,is_active")
      .eq("profile_id", profileId)
      .maybeSingle();
    if (error || !data?.is_active)
      throw new NotFoundException("Active driver profile not found");
    return data.id as string;
  }

  async dashboard(profileId: string) {
    const driverId = await this.requireActiveDriver(profileId);
    const { today, start, end } = todayWindow();
    const fields =
      "id,order_id,driver_id,assignment_type,status,assigned_at,accepted_at,completed_at";
    const [activeResult, todayResult, completedResult] = await Promise.all([
      this.supabase.admin
        .from("driver_assignments")
        .select(fields)
        .eq("driver_id", driverId)
        .in("status", ACTIVE_ASSIGNMENT_STATUSES)
        .order("assigned_at", { ascending: false })
        .limit(100),
      this.supabase.admin
        .from("driver_assignments")
        .select(fields)
        .eq("driver_id", driverId)
        .gte("assigned_at", start)
        .lt("assigned_at", end)
        .order("assigned_at", { ascending: false })
        .limit(100),
      this.supabase.admin
        .from("driver_assignments")
        .select(fields)
        .eq("driver_id", driverId)
        .eq("status", "completed")
        .gte("completed_at", start)
        .lt("completed_at", end)
        .order("completed_at", { ascending: false })
        .limit(100),
    ]);
    if (activeResult.error || todayResult.error || completedResult.error)
      throw new BadRequestException("Unable to load assignments");
    const unique = new Map<string, Assignment>();
    for (const assignment of [
      ...(activeResult.data ?? []),
      ...(todayResult.data ?? []),
      ...(completedResult.data ?? []),
    ] as Assignment[]) {
      if (assignment.driver_id !== driverId) continue;
      unique.set(assignment.id, assignment);
    }
    const assignments = [...unique.values()].filter(
      (item) =>
        ACTIVE_ASSIGNMENT_STATUSES.includes(item.status) ||
        item.status === "completed",
    );
    const orderIds = [...new Set(assignments.map((item) => item.order_id))];
    if (!orderIds.length) {
      return {
        date: today,
        summary: {
          pickups: 0,
          deliveries: 0,
          pending: 0,
          inProgress: 0,
          completed: 0,
        },
        pickups: [],
        deliveries: [],
      };
    }
    const { data: orders, error: ordersError } = await this.supabase.admin
      .from("orders")
      .select(
        "id,order_number,current_status,pickup_scheduled_at,pickup_slot_label,pickup_address_id,delivery_address_id,facility_id",
      )
      .in("id", orderIds);
    if (ordersError)
      throw new BadRequestException("Unable to load assigned orders");
    const orderMap = new Map((orders ?? []).map((order) => [order.id, order]));
    const addressIds = [
      ...new Set(
        (orders ?? []).flatMap((order) =>
          [order.pickup_address_id, order.delivery_address_id].filter(Boolean),
        ),
      ),
    ];
    const facilityIds = [
      ...new Set(
        (orders ?? []).map((order) => order.facility_id).filter(Boolean),
      ),
    ];
    const [addressResult, facilityResult] = await Promise.all([
      addressIds.length
        ? this.supabase.admin
            .from("customer_addresses")
            .select(
              "id,label,address_line1,address_line2,city,state,postal_code,latitude,longitude",
            )
            .in("id", addressIds)
        : Promise.resolve({ data: [], error: null }),
      facilityIds.length
        ? this.supabase.admin
            .from("facilities")
            .select("id,name,address,latitude,longitude")
            .in("id", facilityIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (addressResult.error || facilityResult.error)
      throw new BadRequestException("Unable to load job destinations");
    const addresses = new Map(
      (addressResult.data ?? []).map((row) => [row.id, row]),
    );
    const facilities = new Map(
      (facilityResult.data ?? []).map((row) => [row.id, row]),
    );
    const jobs = assignments
      .map((assignment) => {
        const order = orderMap.get(assignment.order_id);
        if (!order) return null;
        if (
          ACTIVE_ASSIGNMENT_STATUSES.includes(assignment.status) &&
          !operationallyRelevant(
            assignment.assignment_type,
            assignment.status,
            order.current_status,
          )
        )
          return null;
        const addressId =
          assignment.assignment_type === "pickup"
            ? order.pickup_address_id
            : order.delivery_address_id;
        return {
          id: assignment.id,
          orderId: order.id,
          orderNumber: order.order_number,
          type: assignment.assignment_type,
          assignmentStatus: assignment.status,
          orderStatus: order.current_status,
          assignedAt: assignment.assigned_at,
          acceptedAt: assignment.accepted_at,
          completedAt: assignment.completed_at,
          pickupScheduledAt: order.pickup_scheduled_at,
          pickupSlotLabel: order.pickup_slot_label,
          address: addressId ? (addresses.get(addressId) ?? null) : null,
          facility: order.facility_id
            ? (facilities.get(order.facility_id) ?? null)
            : null,
        };
      })
      .filter((job): job is NonNullable<typeof job> => job !== null)
      .sort((a, b) => a.assignedAt.localeCompare(b.assignedAt) * -1);
    const activeJobs = jobs.filter(
      (job) => job.assignmentStatus !== "completed",
    );
    return {
      date: today,
      summary: {
        pickups: activeJobs.filter((job) => job.type === "pickup").length,
        deliveries: activeJobs.filter((job) => job.type === "delivery").length,
        pending: jobs.filter((job) => job.assignmentStatus === "assigned")
          .length,
        inProgress: jobs.filter((job) =>
          ["accepted", "en_route", "arrived"].includes(job.assignmentStatus),
        ).length,
        completed: jobs.filter((job) => job.assignmentStatus === "completed")
          .length,
      },
      pickups: activeJobs.filter((job) => job.type === "pickup"),
      deliveries: activeJobs.filter((job) => job.type === "delivery"),
    };
  }

  async lookupOrder(profileId: string, rawCode: string) {
    const driverId = await this.requireActiveDriver(profileId);
    const code = rawCode.trim();
    let order: {
      id: string;
      order_number: string;
      current_status: string;
    } | null = null;
    const qrMatch = code.match(QR_PAYLOAD);
    if (qrMatch) {
      const { data: qr, error: qrError } = await this.supabase.admin
        .from("order_qr_codes")
        .select("order_id,is_active")
        .eq("secure_token", qrMatch[1])
        .eq("is_active", true)
        .maybeSingle();
      if (qrError || !qr?.is_active)
        throw new NotFoundException("Assigned order not found");
      const { data, error } = await this.supabase.admin
        .from("orders")
        .select("id,order_number,current_status")
        .eq("id", qr.order_id)
        .maybeSingle();
      if (error)
        throw new BadRequestException("Unable to look up assigned order");
      order = data;
    } else if (ORDER_NUMBER.test(code)) {
      const { data, error } = await this.supabase.admin
        .from("orders")
        .select("id,order_number,current_status")
        .eq("order_number", code.toUpperCase())
        .maybeSingle();
      if (error)
        throw new BadRequestException("Unable to look up assigned order");
      order = data;
    } else {
      throw new BadRequestException(
        "Enter a valid B&W order number or scan an order QR",
      );
    }
    if (!order) throw new NotFoundException("Assigned order not found");
    const { data: assignment, error: assignmentError } =
      await this.supabase.admin
        .from("driver_assignments")
        .select("id,order_id,driver_id,assignment_type,status,assigned_at")
        .eq("order_id", order.id)
        .eq("driver_id", driverId)
        .order("assigned_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (assignmentError)
      throw new BadRequestException("Unable to look up assigned order");
    if (
      !assignment ||
      !["assigned", "accepted", "en_route", "arrived", "completed"].includes(
        assignment.status,
      )
    ) {
      throw new NotFoundException("Assigned order not found");
    }
    if (
      assignment.status !== "completed" &&
      !operationallyRelevant(
        assignment.assignment_type,
        assignment.status,
        order.current_status,
      )
    ) {
      throw new ConflictException(
        "This assignment is not active for the order lifecycle",
      );
    }
    return {
      assignmentId: assignment.id,
      orderId: order.id,
      orderNumber: order.order_number,
      assignmentType: assignment.assignment_type,
      assignmentStatus: assignment.status,
      orderStatus: order.current_status,
    };
  }

  async assignment(profileId: string, assignmentId: string) {
    const driverId = await this.requireActiveDriver(profileId);
    const { data: assignment, error } = await this.supabase.admin
      .from("driver_assignments")
      .select(
        "id,order_id,driver_id,assignment_type,status,assigned_at,accepted_at,completed_at",
      )
      .eq("id", assignmentId)
      .eq("driver_id", driverId)
      .maybeSingle();
    if (error || !assignment || assignment.driver_id !== driverId)
      throw new NotFoundException("Assignment not found");
    if (
      ["rejected", "reassignment_required", "cancelled", "expired"].includes(
        assignment.status,
      )
    ) {
      throw new NotFoundException("Assignment not found");
    }
    const { data: order, error: orderError } = await this.supabase.admin
      .from("orders")
      .select(
        "id,order_number,customer_id,facility_id,current_status,pickup_scheduled_at,pickup_slot_label,pickup_address_id,delivery_address_id",
      )
      .eq("id", assignment.order_id)
      .maybeSingle();
    if (orderError || !order)
      throw new NotFoundException("Assigned order not found");
    const addressId =
      assignment.assignment_type === "pickup"
        ? order.pickup_address_id
        : order.delivery_address_id;
    const [addressResult, facilityResult, itemsResult] = await Promise.all([
      addressId
        ? this.supabase.admin
            .from("customer_addresses")
            .select(
              "id,label,address_line1,address_line2,city,state,postal_code,latitude,longitude",
            )
            .eq("id", addressId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      order.facility_id
        ? this.supabase.admin
            .from("facilities")
            .select("id,name,address,latitude,longitude")
            .eq("id", order.facility_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      assignment.assignment_type === "pickup"
        ? this.supabase.admin
            .from("order_items")
            .select("id,item_name,quantity,weight_kg,customer_notes")
            .eq("order_id", order.id)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (addressResult.error || facilityResult.error || itemsResult.error)
      throw new BadRequestException("Unable to load job details");
    let customer: { name: string | null; phone: string | null } | null = null;
    if (
      operationallyRelevant(
        assignment.assignment_type,
        assignment.status,
        order.current_status,
      ) &&
      order.current_status !== "picked_up"
    ) {
      const { data: owner, error: ownerError } = await this.supabase.admin
        .from("customers")
        .select("profile_id")
        .eq("id", order.customer_id)
        .maybeSingle();
      if (ownerError || !owner)
        throw new BadRequestException("Unable to load job contact");
      const { data: profile, error: profileError } = await this.supabase.admin
        .from("profiles")
        .select("full_name,phone")
        .eq("id", owner.profile_id)
        .maybeSingle();
      if (profileError || !profile)
        throw new BadRequestException("Unable to load job contact");
      customer = { name: profile.full_name, phone: profile.phone };
    }
    return {
      id: assignment.id,
      orderId: order.id,
      orderNumber: order.order_number,
      type: assignment.assignment_type,
      assignmentStatus: assignment.status,
      orderStatus: order.current_status,
      assignedAt: assignment.assigned_at,
      acceptedAt: assignment.accepted_at,
      completedAt: assignment.completed_at,
      pickupScheduledAt: order.pickup_scheduled_at,
      pickupSlotLabel: order.pickup_slot_label,
      address: addressResult.data,
      facility: facilityResult.data,
      customer,
      items: itemsResult.data ?? [],
    };
  }

  async handoffQr(profileId: string, assignmentId: string) {
    const driverId = await this.requireActiveDriver(profileId);
    const { data: assignment, error } = await this.supabase.admin
      .from("driver_assignments")
      .select("id,order_id,assignment_type,status")
      .eq("id", assignmentId)
      .eq("driver_id", driverId)
      .maybeSingle();
    if (error || !assignment)
      throw new NotFoundException("Assignment not found");
    if (
      assignment.assignment_type !== "pickup" ||
      assignment.status !== "arrived"
    )
      throw new ConflictException("Pickup handoff is not available");
    const { data: order, error: orderError } = await this.supabase.admin
      .from("orders")
      .select("id,current_status,facility_id")
      .eq("id", assignment.order_id)
      .maybeSingle();
    if (
      orderError ||
      !order ||
      !order.facility_id ||
      !["picked_up", "in_transit_to_facility"].includes(order.current_status)
    )
      throw new ConflictException("Order is not ready for facility handoff");
    const { data: qr, error: qrError } = await this.supabase.admin
      .from("order_qr_codes")
      .select("secure_token,is_active")
      .eq("order_id", order.id)
      .maybeSingle();
    if (qrError || !qr?.is_active)
      throw new NotFoundException("Active order QR not found");
    return { orderId: order.id, payload: `BW1:${qr.secure_token}` };
  }

  async location(
    profileId: string,
    assignmentId: string,
    latitude: number,
    longitude: number,
    accuracyM?: number,
  ) {
    const { data: driver, error: driverError } = await this.supabase.admin
      .from("drivers")
      .select("id,is_active")
      .eq("profile_id", profileId)
      .maybeSingle();

    if (driverError || !driver?.is_active || !assignmentId) {
      throw new NotFoundException("Driver profile not found");
    }

    const { data, error } = await this.supabase.admin.rpc(
      "publish_driver_trip_location_atomic",
      {
        p_assignment_id: assignmentId,
        p_driver_id: driver.id,
        p_latitude: latitude,
        p_longitude: longitude,
        p_accuracy_m: accuracyM ?? null,
      },
    );

    if (error?.code === "P0002")
      throw new NotFoundException("Assignment not found");
    if (error) throw new ConflictException(error.message);

    return {
      published: data?.published === true,
      assignmentId,
      driverId: driver.id,
    };
  }
}
