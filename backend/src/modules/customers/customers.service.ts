import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { SupabaseService } from "../supabase/supabase.service";
import { CreateAddressDto, UpdateCustomerDto } from "./dto/customer.dto";

@Injectable()
export class CustomersService {
  constructor(private readonly s: SupabaseService) {}

  async customer(userId: string) {
    const { data, error } = await this.s.admin
      .from("customers")
      .select("*,profiles(*)")
      .eq("profile_id", userId)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data) {
      throw new NotFoundException("Customer profile not found");
    }

    return data;
  }

  async me(userId: string) {
    return this.customer(userId);
  }

  async updateMe(userId: string, d: UpdateCustomerDto) {
    const { data, error } = await this.s.admin
      .from("profiles")
      .update({
        full_name: d.fullName,
        avatar_path: d.avatarPath,
      })
      .eq("id", userId)
      .select("*")
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data;
  }

  async addresses(userId: string) {
    const c = await this.customer(userId);

    const { data, error } = await this.s.admin
      .from("customer_addresses")
      .select("*")
      .eq("customer_id", c.id)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data || [];
  }

  async addAddress(userId: string, d: CreateAddressDto) {
    const c = await this.customer(userId);

    if (d.isDefault) {
      await this.s.admin
        .from("customer_addresses")
        .update({
          is_default: false,
        })
        .eq("customer_id", c.id);
    }

    const payload: any = {
      customer_id: c.id,
      label: d.label,
      address_line1: d.addressLine1,
      address_line2: d.addressLine2,
      city: d.city,
      state: d.state,
      postal_code: d.postalCode,
      latitude: d.latitude,
      longitude: d.longitude,
      is_default: d.isDefault || false,
    };

    if (d.latitude != null && d.longitude != null) {
      payload.location = `SRID=4326;POINT(${d.longitude} ${d.latitude})`;
    }

    const { data, error } = await this.s.admin
      .from("customer_addresses")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data;
  }

  async updateAddress(
    userId: string,
    id: string,
    d: Partial<CreateAddressDto>,
  ) {
    const c = await this.customer(userId);

    const own = await this.s.admin
      .from("customer_addresses")
      .select("id")
      .eq("id", id)
      .eq("customer_id", c.id)
      .maybeSingle();

    if (!own.data) {
      throw new ForbiddenException("Address not owned by customer");
    }

    const map: any = {
      label: d.label,
      address_line1: d.addressLine1,
      address_line2: d.addressLine2,
      city: d.city,
      state: d.state,
      postal_code: d.postalCode,
      latitude: d.latitude,
      longitude: d.longitude,
      is_default: d.isDefault,
    };

    if (d.latitude != null && d.longitude != null) {
      map.location = `SRID=4326;POINT(${d.longitude} ${d.latitude})`;
    }

    Object.keys(map).forEach((key) => {
      if (map[key] === undefined) {
        delete map[key];
      }
    });

    if (d.isDefault) {
      await this.s.admin
        .from("customer_addresses")
        .update({
          is_default: false,
        })
        .eq("customer_id", c.id);
    }

    const { data, error } = await this.s.admin
      .from("customer_addresses")
      .update(map)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data;
  }

  async removeAddress(userId: string, id: string) {
    const c = await this.customer(userId);

    const own = await this.s.admin
      .from("customer_addresses")
      .select("id")
      .eq("id", id)
      .eq("customer_id", c.id)
      .maybeSingle();

    if (!own.data) {
      throw new ForbiddenException("Address not owned by customer");
    }

    const { error } = await this.s.admin
      .from("customer_addresses")
      .delete()
      .eq("id", id)
      .eq("customer_id", c.id);

    if (error) {
      const message = String(error.message ?? "").toLowerCase();

      if (
        message.includes("foreign key constraint") ||
        message.includes("orders_delivery_address_id_fkey") ||
        message.includes("orders_pickup_address_id_fkey")
      ) {
        throw new ConflictException(
          "Address is used by an existing order and cannot be deleted.",
        );
      }

      throw new BadRequestException("Unable to delete address");
    }

    return {
      deleted: true,
    };
  }
}
