import React from 'react';
import {render, waitFor} from '@testing-library/react-native';
import PackageDetailScreen from './PackageDetailScreen';
import {getPackage} from '../services/packagesApi';
jest.mock('../services/packagesApi', () => ({getPackage: jest.fn(), purchasePackage: jest.fn()}));
test('package details use catalogue names and server validity instead of internal UUIDs', async () => {
  (getPackage as jest.Mock).mockResolvedValue({id: 'package', name: 'Laundry Plan', monthly_price: 199, validity_days: 45, package_services: [{service_id: 'private-service-id', usage_limit: 3}]});
  const services = [{id: 'private-service-id', name: 'Wash & Fold', categoryName: 'Laundry', categoryId: 'category', description: null, price: 89, pricingUnit: 'kg', facilityId: null}];
  const view = await render(<PackageDetailScreen services={services} accessToken="token" packageId="package" onBack={jest.fn()} />);
  await waitFor(() => expect(view.getByText('3 uses · Wash & Fold')).toBeTruthy());
  expect(view.getByText('₹199.00 · 45 days')).toBeTruthy();
  expect(view.getByText(/Valid for 45 days/)).toBeTruthy();
  expect(view.queryByText(/private-service-id/)).toBeNull();
});
