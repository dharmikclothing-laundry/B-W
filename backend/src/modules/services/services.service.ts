import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { SupabaseService } from "../supabase/supabase.service";
import { ServicePriceDto } from "./services.dto";

type ServiceRow = {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  pricing_unit: string;
};

type CategoryRow = {
  id: string;
  name: string;
};

type PriceRow = {
  service_id: string;
  price: string | number;
  effective_from: string;
};

@Injectable()
export class ServicesService {
  constructor(private readonly supabase: SupabaseService) {}

  async list(facilityId?: string): Promise<ServicePriceDto[]> {
    const db = this.supabase.admin;

    /*
     * If facility-specific pricing is requested,
     * first verify that the facility exists and is active.
     */
    if (facilityId) {
      const { data, error } = await db
        .from("facilities")
        .select("id")
        .eq("id", facilityId)
        .eq("is_active", true)
        .maybeSingle();

      if (error) {
        throw new ServiceUnavailableException("Unable to load facility");
      }

      if (!data) {
        throw new NotFoundException("Active facility not found");
      }
    }

    /*
     * Load all active customer services.
     */
    const { data: services, error: servicesError } = await db
      .from("services")
      .select("id,category_id,name,description,pricing_unit")
      .eq("is_active", true)
      .order("name")
      .order("id");

    if (servicesError) {
      throw new ServiceUnavailableException("Unable to load services");
    }

    const serviceRows = (services ?? []) as ServiceRow[];

    if (serviceRows.length === 0) {
      return [];
    }

    /*
     * Load service-category information.
     *
     * The API remains compatible with the existing response,
     * but now also exposes categoryId and categoryName.
     */
    const categoryIds = [
      ...new Set(
        serviceRows
          .map((service) => service.category_id)
          .filter((categoryId): categoryId is string => Boolean(categoryId)),
      ),
    ];

    const categoryNameById = new Map<string, string>();

    if (categoryIds.length > 0) {
      const { data: categories, error: categoriesError } = await db
        .from("service_categories")
        .select("id,name")
        .in("id", categoryIds)
        .eq("is_active", true);

      if (categoriesError) {
        throw new ServiceUnavailableException(
          "Unable to load service categories",
        );
      }

      for (const category of (categories ?? []) as CategoryRow[]) {
        categoryNameById.set(category.id, category.name);
      }
    }

    /*
     * Load all current prices in one query.
     *
     * This follows the same effective-date rules used by
     * OrdersService:
     *
     * effective_from <= now
     *
     * and
     *
     * effective_to IS NULL
     * OR effective_to > now
     *
     * Facility pricing uses the exact requested facility.
     * Global pricing uses facility_id IS NULL.
     *
     * There is intentionally no facility -> global fallback.
     */
    const now = new Date().toISOString();

    const serviceIds = serviceRows.map((service) => service.id);

    let priceQuery = db
      .from("service_prices")
      .select("service_id,price,effective_from")
      .in("service_id", serviceIds)
      .lte("effective_from", now)
      .or(`effective_to.is.null,effective_to.gt.${now}`)
      .order("effective_from", {
        ascending: false,
      });

    priceQuery = facilityId
      ? priceQuery.eq("facility_id", facilityId)
      : priceQuery.is("facility_id", null);

    const { data: prices, error: pricesError } = await priceQuery;

    if (pricesError) {
      throw new ServiceUnavailableException("Unable to load service prices");
    }

    /*
     * Prices are already ordered newest effective_from first.
     * The first price found for each service is therefore
     * the current effective price.
     */
    const priceByServiceId = new Map<string, number>();

    for (const priceRow of (prices ?? []) as PriceRow[]) {
      if (!priceByServiceId.has(priceRow.service_id)) {
        priceByServiceId.set(priceRow.service_id, Number(priceRow.price));
      }
    }

    /*
     * Build the customer-facing catalogue response.
     */
    return serviceRows.filter(service => !service.category_id || categoryNameById.has(service.category_id)).map((service) => {
      const categoryId = service.category_id ?? null;

      return {
        id: service.id,

        categoryId,

        categoryName: categoryId
          ? (categoryNameById.get(categoryId) ?? null)
          : null,

        name: service.name,

        description: service.description ?? null,

        pricingUnit: service.pricing_unit,

        price: priceByServiceId.get(service.id) ?? null,

        facilityId: facilityId ?? null,
      };
    });
  }

  async pricingPolicy() {
    const {data, error} = await this.supabase.admin.from('checkout_pricing_policies')
      .select('pickup_delivery_fee,free_delivery_threshold,gst_rate_percent,minimum_order_amount,effective_from')
      .lte('effective_from', new Date().toISOString()).order('effective_from', {ascending: false}).limit(1).maybeSingle();
    if (error || !data) throw new ServiceUnavailableException('Checkout pricing configuration unavailable');
    return {pickupDeliveryFee: Number(data.pickup_delivery_fee),
      freeDeliveryThreshold: Number(data.free_delivery_threshold), gstRatePercent: Number(data.gst_rate_percent),
      minimumOrderAmount: Number(data.minimum_order_amount),
      effectiveFrom: data.effective_from};
  }
}
