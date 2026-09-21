import { NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ServicesService } from "./services.service";

describe("ServicesService", () => {
  const item = {
    id: "service-1",
    category_id: "category-1",
    name: "Wash",
    description: null,
    pricing_unit: "item",
  };

  const category = {
    id: "category-1",
    name: "Wash & Iron",
  };

  const defaultPrices = [
    {
      service_id: "service-1",
      price: "25.50",
      effective_from: "2026-09-10T00:00:00.000Z",
    },
  ];

  function fixture(prices: any[] = defaultPrices) {
    const results: Record<string, any> = {
      facilities: {
        data: { id: "facility-1" },
        error: null,
      },

      services: {
        data: [item],
        error: null,
      },

      service_categories: {
        data: [category],
        error: null,
      },

      service_prices: {
        data: prices,
        error: null,
      },
    };

    const queries: Record<string, any> = {};

    const from = jest.fn((table: string) => {
      const q: any = {};

      for (const method of [
        "select",
        "eq",
        "is",
        "in",
        "lte",
        "or",
        "order",
        "limit",
      ]) {
        q[method] = jest.fn(() => q);
      }

      q.maybeSingle = jest.fn(async () => results[table]);

      q.then = (resolve: any, reject?: any) =>
        Promise.resolve(results[table]).then(resolve, reject);

      queries[table] = q;

      return q;
    });

    return {
      service: new ServicesService({
        admin: { from },
      } as any),

      results,
      queries,
      from,
    };
  }

  it("returns active services with category metadata and numeric global prices", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-11T00:00:00Z"));

    try {
      const f = fixture();

      await expect(f.service.list()).resolves.toEqual([
        {
          id: "service-1",
          categoryId: "category-1",
          categoryName: "Wash & Iron",
          name: "Wash",
          description: null,
          pricingUnit: "item",
          price: 25.5,
          facilityId: null,
        },
      ]);

      expect(f.queries.services.eq).toHaveBeenCalledWith("is_active", true);

      expect(f.queries.service_categories.in).toHaveBeenCalledWith("id", [
        "category-1",
      ]);

      expect(f.queries.service_categories.eq).toHaveBeenCalledWith(
        "is_active",
        true,
      );

      expect(f.queries.service_prices.in).toHaveBeenCalledWith("service_id", [
        "service-1",
      ]);

      expect(f.queries.service_prices.is).toHaveBeenCalledWith(
        "facility_id",
        null,
      );

      expect(f.queries.service_prices.lte).toHaveBeenCalledWith(
        "effective_from",
        "2026-09-11T00:00:00.000Z",
      );

      expect(f.queries.service_prices.or).toHaveBeenCalledWith(
        "effective_to.is.null,effective_to.gt.2026-09-11T00:00:00.000Z",
      );

      expect(f.queries.service_prices.order).toHaveBeenCalledWith(
        "effective_from",
        {
          ascending: false,
        },
      );

      expect(f.from).not.toHaveBeenCalledWith("facilities");
    } finally {
      jest.useRealTimers();
    }
  });

  it("validates an active facility and does not fall back to global pricing", async () => {
    const f = fixture([]);

    const result = await f.service.list("facility-1");

    expect(result[0]).toMatchObject({
      categoryId: "category-1",
      categoryName: "Wash & Iron",
      price: null,
      facilityId: "facility-1",
    });

    expect(f.queries.facilities.eq).toHaveBeenCalledWith("id", "facility-1");

    expect(f.queries.facilities.eq).toHaveBeenCalledWith("is_active", true);

    expect(f.queries.service_prices.eq).toHaveBeenCalledWith(
      "facility_id",
      "facility-1",
    );

    expect(f.queries.service_prices.is).not.toHaveBeenCalled();
  });

  it("preserves a zero price", async () => {
    const f = fixture([
      {
        service_id: "service-1",
        price: "0.00",
        effective_from: "2026-09-10T00:00:00.000Z",
      },
    ]);

    const result = await f.service.list();

    expect(result[0].price).toBe(0);
  });

  it("returns null when there is no current global price", async () => {
    const f = fixture([]);

    const result = await f.service.list();

    expect(result[0].price).toBeNull();
  });

  it("uses the newest effective price returned for each service", async () => {
    const f = fixture([
      {
        service_id: "service-1",
        price: "30.00",
        effective_from: "2026-09-10T00:00:00.000Z",
      },
      {
        service_id: "service-1",
        price: "25.00",
        effective_from: "2026-08-01T00:00:00.000Z",
      },
    ]);

    const result = await f.service.list();

    expect(result[0].price).toBe(30);
  });

  it("batches prices for multiple services", async () => {
    const secondItem = {
      id: "service-2",
      category_id: "category-1",
      name: "Iron",
      description: null,
      pricing_unit: "piece",
    };

    const f = fixture([
      {
        service_id: "service-1",
        price: "25.50",
        effective_from: "2026-09-10T00:00:00.000Z",
      },
      {
        service_id: "service-2",
        price: "15.00",
        effective_from: "2026-09-10T00:00:00.000Z",
      },
    ]);

    f.results.services.data = [item, secondItem];

    const result = await f.service.list();

    expect(result).toHaveLength(2);

    expect(result[0]).toMatchObject({
      id: "service-1",
      price: 25.5,
    });

    expect(result[1]).toMatchObject({
      id: "service-2",
      price: 15,
    });

    expect(f.queries.service_prices.in).toHaveBeenCalledWith("service_id", [
      "service-1",
      "service-2",
    ]);
  });

  it("returns null category metadata for an uncategorized service", async () => {
    const uncategorizedItem = {
      ...item,
      category_id: null,
    };

    const f = fixture([
      {
        service_id: "service-1",
        price: "25.50",
        effective_from: "2026-09-10T00:00:00.000Z",
      },
    ]);

    f.results.services.data = [uncategorizedItem];

    const result = await f.service.list();

    expect(result[0]).toMatchObject({
      categoryId: null,
      categoryName: null,
    });

    expect(f.from).not.toHaveBeenCalledWith("service_categories");
  });

  it("hides services in inactive or unavailable categories", async () => {
    const f = fixture();

    f.results.service_categories.data = [];

    const result = await f.service.list();

    expect(result).toEqual([]);
  });

  it("returns an empty catalogue without category or price queries", async () => {
    const f = fixture();

    f.results.services.data = [];

    await expect(f.service.list()).resolves.toEqual([]);

    expect(f.from).not.toHaveBeenCalledWith("service_categories");

    expect(f.from).not.toHaveBeenCalledWith("service_prices");
  });

  it("rejects missing or inactive facilities", async () => {
    const f = fixture();

    f.results.facilities.data = null;

    await expect(f.service.list("facility-1")).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(f.from).not.toHaveBeenCalledWith("services");
  });

  it.each([
    ["facilities", "Unable to load facility"],
    ["services", "Unable to load services"],
    ["service_categories", "Unable to load service categories"],
    ["service_prices", "Unable to load service prices"],
  ])("fails closed on %s lookup errors", async (table, expectedMessage) => {
    const f = fixture();

    f.results[table] = {
      data: null,
      error: {
        message: "private database detail",
      },
    };

    await expect(f.service.list("facility-1")).rejects.toMatchObject({
      message: expectedMessage,
    });

    await expect(f.service.list("facility-1")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
