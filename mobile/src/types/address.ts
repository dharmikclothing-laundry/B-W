export type AddressItem = {
  id: string;
  customer_id?: string;
  label: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
};

export type AddressFormState = {
  label: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
  isDefault: boolean;
};

export const EMPTY_ADDRESS_FORM: AddressFormState = {
  label: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  latitude: null,
  longitude: null,
  isDefault: false,
};
