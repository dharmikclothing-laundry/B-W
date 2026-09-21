export type ServiceItem = {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  name: string;
  description: string | null;
  pricingUnit: string;
  price: number | null;
  facilityId: string | null;
};

export type ServiceCategory = {
  id: string | null;
  name: string;
  count: number;
};

export type CartState = Record<string, number>;

export type CartItem = ServiceItem & {
  quantity: number;
};