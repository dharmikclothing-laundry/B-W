import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import AdminCatalogueScreen from './AdminCatalogueScreen';
import {getAdminCatalogue, setAdminServicePrice, updateAdminService} from '../services/adminCatalogueApi';
import {listAdminFacilities} from '../services/adminStaffApi';
jest.mock('../services/adminCatalogueApi', () => ({getAdminCatalogue: jest.fn(), createAdminCategory: jest.fn(), updateAdminCategory: jest.fn(), createAdminService: jest.fn(), updateAdminService: jest.fn(), setAdminServicePrice: jest.fn(), setAdminPricingPolicy: jest.fn()}));
jest.mock('../services/adminStaffApi', () => ({listAdminFacilities: jest.fn()}));
const load = getAdminCatalogue as jest.Mock;
const price = setAdminServicePrice as jest.Mock;
const update = updateAdminService as jest.Mock;
const sample = {categories: [{id: 'category', name: 'Wash', description: null, is_active: true}],
  services: [{id: 'service', category_id: 'category', name: 'Shirt', description: null, pricing_unit: 'item', is_active: true}],
  prices: [{id: 'price', service_id: 'service', facility_id: null, price: 50, effective_from: '2026-01-01', effective_to: null}],
  policy: {pickupDeliveryFee: 50, freeDeliveryThreshold: 500, gstRatePercent: 5, minimumOrderAmount: 0, effectiveFrom: '2026-01-01'}, packageEligibility: [], packages: [], audit: []};
beforeEach(() => {jest.clearAllMocks(); load.mockResolvedValue(sample); (listAdminFacilities as jest.Mock).mockResolvedValue([]); price.mockResolvedValue({}); update.mockResolvedValue({});});
test('shows prices, policy and availability; saves a future price and refreshes', async () => {
  const view = await render(<AdminCatalogueScreen accessToken="token" onBack={jest.fn()} />);
  await waitFor(() => expect(view.getByText('Shirt · Active')).toBeTruthy());
  expect(view.getByText(/Global price ₹50.00/)).toBeTruthy();
  await fireEvent.press(view.getByText('Shirt · Active'));
  await fireEvent.changeText(view.getByLabelText('Service price'), '75');
  await fireEvent.press(view.getByText('Save new price'));
  await waitFor(() => expect(price).toHaveBeenCalledWith('token', 'service', 75, undefined));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  await fireEvent.press(view.getByText('Deactivate service'));
  await waitFor(() => expect(update).toHaveBeenCalledWith('token', 'service', {isActive: false}));
});
test('shows loading failure and retry', async () => {
  load.mockRejectedValueOnce(new Error('Network unavailable'));
  const view = await render(<AdminCatalogueScreen accessToken="token" onBack={jest.fn()} />);
  await waitFor(() => expect(view.getByText('Network unavailable')).toBeTruthy());
  await fireEvent.press(view.getByText('Retry catalogue'));
  await waitFor(() => expect(view.getByText('Shirt · Active')).toBeTruthy());
});
