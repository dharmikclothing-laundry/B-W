import type {
  AddressFormState,
  AddressItem,
} from '../types/address';

import {apiRequest} from './api';

type AddressPayload = {
  label?: string;
  addressLine1: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  isDefault: boolean;
};

function buildAddressPayload(
  form: AddressFormState,
): AddressPayload {
  const payload: AddressPayload = {
    addressLine1:
      form.addressLine1.trim(),

    isDefault:
      form.isDefault,
  };

  if (form.label.trim()) {
    payload.label =
      form.label.trim();
  }

  if (
    form.addressLine2.trim()
  ) {
    payload.addressLine2 =
      form.addressLine2.trim();
  }

  if (form.city.trim()) {
    payload.city =
      form.city.trim();
  }

  if (form.state.trim()) {
    payload.state =
      form.state.trim();
  }

  if (
    form.postalCode.trim()
  ) {
    payload.postalCode =
      form.postalCode.trim();
  }

  if (
    form.latitude !== null &&
    form.longitude !== null
  ) {
    payload.latitude =
      form.latitude;
    payload.longitude =
      form.longitude;
  }

  return payload;
}

export async function getMyAddresses(
  accessToken: string,
): Promise<AddressItem[]> {
  const addresses =
    await apiRequest<AddressItem[]>(
      '/customers/me/addresses',
      {
        accessToken,
      },
    );

  if (!Array.isArray(addresses)) {
    throw new Error(
      'Invalid address response',
    );
  }

  return addresses;
}

export async function createAddress(
  accessToken: string,
  form: AddressFormState,
): Promise<AddressItem> {
  return apiRequest<AddressItem>(
    '/customers/me/addresses',
    {
      method: 'POST',
      accessToken,
      body:
        buildAddressPayload(
          form,
        ),
    },
  );
}

export async function updateAddress(
  accessToken: string,
  addressId: string,
  form: AddressFormState,
): Promise<AddressItem> {
  return apiRequest<AddressItem>(
    `/customers/me/addresses/${addressId}`,
    {
      method: 'PATCH',
      accessToken,
      body:
        buildAddressPayload(
          form,
        ),
    },
  );
}

export async function setAddressDefault(
  accessToken: string,
  addressId: string,
): Promise<AddressItem> {
  return apiRequest<AddressItem>(
    `/customers/me/addresses/${addressId}`,
    {
      method: 'PATCH',
      accessToken,
      body: {
        isDefault: true,
      },
    },
  );
}

export async function removeAddress(
  accessToken: string,
  addressId: string,
): Promise<unknown> {
  return apiRequest<unknown>(
    `/customers/me/addresses/${addressId}`,
    {
      method: 'DELETE',
      accessToken,
    },
  );
}
