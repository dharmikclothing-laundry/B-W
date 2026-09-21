import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { OrdersService } from "./orders.service";
import { validate } from "class-validator";
import { CreateOrderDto } from "./dto/create-order.dto";

it("requires an idempotency key at the customer order API boundary", async () => {
  const dto = new CreateOrderDto();
  const errors = await validate(dto);
  expect(errors.some((error) => error.property === "idempotencyKey")).toBe(
    true,
  );
});

describe("OrdersService checkout rewards", () => {
  function fixture(minimumOrderAmount = 0, servicePrice = 200) {
    const from = jest.fn((table: string) => {
      const results: Record<string, any> = {
        customers: { data: { id: "customer-1" }, error: null },
        customer_addresses: { data: { id: "address-1" }, error: null },
        facilities: { data: { id: "facility-1" }, error: null },
        services: { data: { id: "service-1", is_active: true }, error: null },
        service_prices: { data: [{ price: servicePrice }], error: null },
        checkout_pricing_policies: {
          data: {
            pickup_delivery_fee: 50,
            free_delivery_threshold: 500,
            gst_rate_percent: 5,
            minimum_order_amount: minimumOrderAmount,
          },
          error: null,
        },
        admin_growth_settings: {
          data: {
            loyalty_points_per_rupee: 10,
            loyalty_minimum_redemption_rupees: 100,
          },
          error: null,
        },
      };
      const value = results[table];
      const chain: any = {};
      for (const method of [
        "select",
        "eq",
        "lte",
        "or",
        "order",
        "limit",
        "is",
        "not",
      ])
        chain[method] = jest.fn(() => chain);
      chain.maybeSingle = jest.fn().mockResolvedValue(value);
      chain.single = jest.fn().mockResolvedValue(value);
      chain.then = (resolve: any) => Promise.resolve(value).then(resolve);
      return chain;
    });
    const rpc = jest.fn().mockResolvedValue({ data: "order-1", error: null });
    const service = new OrdersService(
      { admin: { from, rpc } } as any,
      {
        applyCoupon: jest
          .fn()
          .mockResolvedValue({ offerId: "offer-1", discount: 10 }),
      } as any,
    );
    jest.spyOn(service, "getById").mockResolvedValue({ id: "order-1" } as any);
    const dto: any = {
      pickupAddressId: "address-1",
      deliveryAddressId: "address-1",
      pickupScheduledAt: new Date(Date.now() + 86400000).toISOString(),
      pickupSlotLabel: "Morning",
      paymentMethod: "cash_on_delivery",
      termsAccepted: true,
      items: [{ serviceId: "service-1", itemName: "Shirt", quantity: 1 }],
      couponCode: "SAVE10",
      loyaltyPointsToRedeem: 1000,
    };
    return { service, from, rpc, dto };
  }
  it("uses one atomic local procedure for checkout points and the priced order", async () => {
    const f = fixture();
    await expect(f.service.create("profile-1", f.dto)).resolves.toMatchObject({
      id: "order-1",
    });
    expect(f.rpc).toHaveBeenCalledWith(
      "create_customer_order_with_rewards_atomic",
      expect.objectContaining({
        p_customer_id: "customer-1",
        p_points: 1000,
        p_order: expect.objectContaining({
          facility_id: "facility-1",
          discount_amount: 110,
          loyalty_discount_amount: 100,
          total_amount: 147,
        }),
      }),
    );
    expect(f.from).not.toHaveBeenCalledWith("orders");
  });
  it("rejects points that exceed the remaining service price", async () => {
    const f = fixture();
    f.dto.loyaltyPointsToRedeem = 9001;
    await expect(f.service.create("profile-1", f.dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("converts 2,000 points to ₹200 on the server", async () => {
    const f = fixture(0, 300);
    f.dto.loyaltyPointsToRedeem = 2000;
    await expect(f.service.create("profile-1", f.dto)).resolves.toMatchObject({
      id: "order-1",
    });
    expect(f.rpc).toHaveBeenCalledWith(
      "create_customer_order_with_rewards_atomic",
      expect.objectContaining({
        p_points: 2000,
        p_order: expect.objectContaining({ loyalty_discount_amount: 200 }),
      }),
    );
  });
  it("rejects redemptions below the 1,000 point minimum", async () => {
    const f = fixture();
    f.dto.loyaltyPointsToRedeem = 950;
    await expect(f.service.create("profile-1", f.dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("creates ordinary orders through the same atomic procedure", async () => {
    const f = fixture();
    delete f.dto.loyaltyPointsToRedeem;
    await expect(f.service.create("profile-1", f.dto)).resolves.toMatchObject({
      id: "order-1",
    });
    expect(f.rpc).toHaveBeenCalledWith(
      "create_customer_order_with_rewards_atomic",
      expect.objectContaining({ p_points: 0 }),
    );
    expect(f.from).not.toHaveBeenCalledWith("orders");
  });
  it("blocks order creation below the server minimum order amount", async () => {
    const f = fixture(250);
    await expect(f.service.create("profile-1", f.dto)).rejects.toThrow(
      "minimum order",
    );
    expect(f.rpc).not.toHaveBeenCalled();
  });
});

describe("OrdersService order retry", () => {
  const dto: any = { idempotencyKey: "65dcbe0e-352c-496b-bf19-647aee9d7c2f" };
  function fixture(hash: string) {
    const customer = { data: { id: "customer-1" }, error: null };
    const prior = {
      data: { id: "order-1", idempotency_request_hash: hash },
      error: null,
    };
    const from = jest.fn((table: string) => {
      const result = table === "customers" ? customer : prior;
      const query: any = {};
      for (const method of ["select", "eq"])
        query[method] = jest.fn(() => query);
      query.maybeSingle = jest.fn().mockResolvedValue(result);
      return query;
    });
    const service = new OrdersService({ admin: { from } } as any);
    jest.spyOn(service, "getById").mockResolvedValue({ id: "order-1" } as any);
    return { service, from };
  }

  it("returns the original customer order for an identical retry", async () => {
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256")
      .update(JSON.stringify({ ...dto, idempotencyKey: undefined }))
      .digest("hex");
    const { service, from } = fixture(hash);
    await expect(service.create("profile-1", dto)).resolves.toEqual({
      id: "order-1",
    });
    expect(from).not.toHaveBeenCalledWith("order_items");
  });

  it("rejects reuse of a key for a different checkout", async () => {
    const { service } = fixture("different-hash");
    await expect(service.create("profile-1", dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe("OrdersService claim period", () => {
  function fixture(
    result: {
      data: unknown;
      error: null | {
        code: string;
        message: string;
      };
    } = {
      data: {
        orderId: "order-1",
        orderStatus: "completed",
      },
      error: null,
    },
  ) {
    const rpc = jest.fn().mockResolvedValue(result);
    return {
      service: new OrdersService({
        admin: {
          rpc,
        },
      } as any),
      rpc,
    };
  }

  it("completes an expired claim period through the C2 RPC", async () => {
    const f = fixture();

    await expect(f.service.completeClaimPeriod("order-1")).resolves.toEqual({
      orderId: "order-1",
      orderStatus: "completed",
    });
    expect(f.rpc).toHaveBeenCalledWith("complete_expired_claim_period", {
      p_order_id: "order-1",
    });
  });

  it("returns a bad request when the database rejects completion", async () => {
    const f = fixture({
      data: null,
      error: {
        code: "23514",
        message: "The delivery claim period is still active",
      },
    });

    await expect(
      f.service.completeClaimPeriod("order-1"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("returns not found when the database cannot find the order", async () => {
    const f = fixture({
      data: null,
      error: {
        code: "P0002",
        message: "Order order-1 not found",
      },
    });

    await expect(
      f.service.completeClaimPeriod("order-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("OrdersService driver order access", () => {
  function fluentResult(data: any, error: any = null) {
    const result = { data, error };
    const query: any = {};
    for (const method of ["select", "eq", "limit"]) {
      query[method] = jest.fn(() => query);
    }
    query.maybeSingle = jest.fn().mockResolvedValue(result);
    query.then = (
      resolve: (value: typeof result) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject);
    return query;
  }

  function fixture(assignment: { id: string } | null) {
    const order = {
      id: "order-1",
      customers: { profile_id: "customer-profile-1" },
    };
    const tables: Record<string, any> = {
      orders: fluentResult(order),
      profile_roles: fluentResult([{ roles: { code: "driver" } }]),
      drivers: fluentResult({ id: "driver-1", is_active: true }),
      driver_assignments: fluentResult(assignment),
    };
    return {
      service: new OrdersService({
        admin: {
          from: jest.fn((table: string) => tables[table]),
        },
      } as any),
      order,
    };
  }

  it("allows a driver assigned to the requested order", async () => {
    const f = fixture({ id: "assignment-1" });

    await expect(
      f.service.getById("driver-profile-1", "order-1"),
    ).resolves.toEqual(f.order);
  });

  it("does not let an unrelated driver view the order", async () => {
    const f = fixture(null);

    await expect(
      f.service.getById("driver-profile-1", "order-1"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("OrdersService customer cancellation", () => {
  function fixture(result: {
    data: unknown;
    error: null | {
      code: string;
      message: string;
    };
  }) {
    const rpc = jest.fn().mockResolvedValue(result);
    return {
      service: new OrdersService({ admin: { rpc } } as any),
      rpc,
    };
  }

  it("delegates cancellation to the atomic C2 database workflow", async () => {
    const result = {
      orderId: "order-1",
      orderStatus: "cancelled",
      duplicate: false,
      refundRequestId: "refund-1",
      refundCreated: true,
    };
    const f = fixture({ data: result, error: null });

    await expect(
      f.service.cancel("profile-1", "order-1", "Pickup is no longer needed"),
    ).resolves.toEqual(result);
    expect(f.rpc).toHaveBeenCalledWith("cancel_customer_order_atomic", {
      p_order_id: "order-1",
      p_profile_id: "profile-1",
      p_reason: "Pickup is no longer needed",
    });
  });

  it.each([
    ["P0002", NotFoundException],
    ["42501", ForbiddenException],
    ["23514", ConflictException],
  ])("maps database error %s without bypassing the RPC", async (code, type) => {
    const f = fixture({
      data: null,
      error: {
        code,
        message: "Cancellation rejected",
      },
    });

    await expect(
      f.service.cancel("profile-1", "order-1", "Pickup is no longer needed"),
    ).rejects.toBeInstanceOf(type);
  });
});
