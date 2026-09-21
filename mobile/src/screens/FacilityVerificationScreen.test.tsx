import React from 'react';
import {cleanup, fireEvent, render, waitFor} from '@testing-library/react-native';
import FacilityVerificationScreen from './FacilityVerificationScreen';
import {getFacilityIntake, resolveFacilityDiscrepancy, verifyFacilityIntake} from '../services/facilityVerificationApi';
jest.mock('../services/facilityVerificationApi', () => ({getFacilityIntake: jest.fn(), verifyFacilityIntake: jest.fn(), resolveFacilityDiscrepancy: jest.fn()}));
jest.mock('./FacilityPackingPanel', () => () => null);
jest.mock('./FacilityProcessingPanel', () => () => null);
const get = getFacilityIntake as jest.Mock;
const verify = verifyFacilityIntake as jest.Mock;
const resolve = resolveFacilityDiscrepancy as jest.Mock;
const base = {orderId: 'order-1', orderNumber: 'BW-1', orderStatus: 'received_at_facility',
  facility: {id: 'facility-1', name: 'Local Facility'}, role: 'facility_employee',
  items: [{id: 'item-1', item_name: 'Shirt', quantity: 2, weight_kg: 1.5}], inspections: [], discrepancies: []};
const issue = {id: 'disc-1', order_item_id: 'item-1', kind: 'missing', status: 'open',
  expected_quantity: 2, counted_quantity: 1, notes: 'One missing', resolution_notes: null};
beforeEach(() => {jest.clearAllMocks();});
afterEach(() => {cleanup();});

test('shows customer values, requires discrepancy notes, and submits measured data separately', async () => {
  get.mockResolvedValueOnce(base).mockResolvedValueOnce({...base, orderStatus: 'verification', discrepancies: [issue]});
  verify.mockResolvedValue({verified: true, discrepancyCount: 1});
  const onChanged = jest.fn();
  const view = await render(<FacilityVerificationScreen accessToken="token" orderId="order-1" onBack={jest.fn()} onChanged={onChanged} />);
  await waitFor(() => expect(view.getByText('Expected: 2 items · 1.5 kg')).toBeTruthy());
  await fireEvent.changeText(view.getByLabelText('Measured count for Shirt'), '1');
  await fireEvent.press(view.getByText('Save garment verification'));
  await waitFor(() => expect(view.getByText('Add discrepancy notes for Shirt.')).toBeTruthy());
  expect(verify).not.toHaveBeenCalled();
  await fireEvent.changeText(view.getByLabelText('Discrepancy notes for Shirt'), 'One missing');
  await fireEvent.press(view.getByText('Save garment verification'));
  await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  expect(verify).toHaveBeenCalledWith('token', 'order-1', [{orderItemId: 'item-1', countedQuantity: 1,
    weightKg: 1.5, damaged: false, notes: 'One missing'}], '');
  await waitFor(() => expect(view.getByText('Processing is blocked until every intake discrepancy is resolved.')).toBeTruthy());
  expect(view.queryByText('Resolve discrepancy')).toBeNull();
});

test('Manager sees required-note resolution and retained history', async () => {
  get.mockResolvedValueOnce({...base, orderStatus: 'verification', role: 'manager', discrepancies: [issue]})
    .mockResolvedValueOnce({...base, orderStatus: 'verification', role: 'manager',
      discrepancies: [{...issue, status: 'resolved', resolution_notes: 'Reconciled', resolved_at: '2026-09-20'}]});
  resolve.mockResolvedValue({id: 'disc-1', status: 'resolved'});
  const view = await render(<FacilityVerificationScreen accessToken="token" orderId="order-1" onBack={jest.fn()} onChanged={jest.fn()} />);
  await waitFor(() => expect(view.getByText('Resolve discrepancy')).toBeTruthy());
  await fireEvent.press(view.getByText('Resolve discrepancy'));
  await waitFor(() => expect(view.getByText('Resolution notes are required.')).toBeTruthy());
  await fireEvent.changeText(view.getByLabelText('Resolution notes for missing'), 'Reconciled');
  await fireEvent.press(view.getByText('Resolve discrepancy'));
  await waitFor(() => expect(view.getByText('Resolution: Reconciled')).toBeTruthy());
  expect(resolve).toHaveBeenCalledWith('token', 'order-1', 'disc-1', 'Reconciled');
});

test('shows retry after an intake API failure', async () => {
  get.mockRejectedValue(new Error('Network unavailable'));
  const view = await render(<FacilityVerificationScreen accessToken="token" orderId="order-1" onBack={jest.fn()} onChanged={jest.fn()} />);
  await waitFor(() => expect(view.getByText('Network unavailable')).toBeTruthy());
  expect(view.getByText('Retry verification')).toBeTruthy();
});
