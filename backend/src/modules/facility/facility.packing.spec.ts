import { ConflictException, ForbiddenException } from "@nestjs/common";
import { FacilityService } from "./facility.service";

function fixture(facilityId = "facility-1") {
  const from = jest.fn((table: string) => {
    const query: any = {};
    query.select = jest.fn(() => query);
    query.eq = jest.fn(() => query);
    query.maybeSingle = jest.fn(async () => ({
      data:
        table === "facility_employees"
          ? { facility_id: facilityId, employee_role: "facility_employee" }
          : table === "facilities"
            ? { id: facilityId, name: "Local Facility", is_active: true }
            : {
                id: "order-1",
                facility_id: "facility-1",
                current_status: "processing",
              },
      error: null,
    }));
    return query;
  });
  const rpc = jest.fn(async () => ({
    data: { packingId: "pack-1", parcelId: "BW-PARCEL-1" },
    error: null,
  }));
  return { service: new FacilityService({ admin: { from, rpc } } as any), rpc };
}

test("confirms packing through the assigned Facility atomic RPC", async () => {
  const f = fixture();
  const body = {
    items: [{ orderItemId: "item-1", packedQuantity: 2 }],
    notes: "Checked",
  };
  await expect(
    f.service.confirmPacking("staff-1", "order-1", body),
  ).resolves.toMatchObject({ packingId: "pack-1" });
  expect(f.rpc).toHaveBeenCalledWith("confirm_facility_packing_atomic", {
    p_order_id: "order-1",
    p_performed_by: "staff-1",
    p_parcel_id: expect.stringMatching(/^BW-ORDER-1-\d+$/),
    p_items: body.items,
    p_notes: body.notes,
  });
});
test("blocks cross-Facility packing before RPC and maps duplicate packing to conflict", async () => {
  const wrong = fixture("facility-2");
  await expect(
    wrong.service.confirmPacking("staff-1", "order-1", { items: [] }),
  ).rejects.toBeInstanceOf(ForbiddenException);
  expect(wrong.rpc).not.toHaveBeenCalled();
  const own = fixture();
  own.rpc.mockResolvedValueOnce({
    data: null,
    error: { code: "23505", message: "Already packed" },
  } as any);
  await expect(
    own.service.confirmPacking("staff-1", "order-1", { items: [] }),
  ).rejects.toBeInstanceOf(ConflictException);
});
