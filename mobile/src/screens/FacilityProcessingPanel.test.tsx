import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import FacilityProcessingPanel from './FacilityProcessingPanel';
import {getFacilityProcessing, startFacilityStage, completeFacilityStage, recordFacilityQualityDecision} from '../services/facilityProcessingApi';
jest.mock('../services/facilityProcessingApi', () => ({getFacilityProcessing: jest.fn(), startFacilityStage: jest.fn(),
  completeFacilityStage: jest.fn(), recordFacilityQualityDecision: jest.fn()}));
const get = getFacilityProcessing as jest.Mock;
const start = startFacilityStage as jest.Mock;
const complete = completeFacilityStage as jest.Mock;
const decide = recordFacilityQualityDecision as jest.Mock;
const empty = {orderId: 'order-1', orderStatus: 'verification', stages: [], activeOperationId: null,
  nextStage: 'washing', openDiscrepancies: 0, completedStageCount: 0};
beforeEach(() => jest.resetAllMocks());
test('starts only the allowed stage and shows completion control after refresh', async () => {
  get.mockResolvedValueOnce(empty).mockResolvedValueOnce({...empty, orderStatus: 'processing', nextStage: null,
    activeOperationId: 'operation-1', stages: [{id: 'operation-1', operation_type: 'washing', started_at: 'today', completed_at: null}]});
  start.mockResolvedValue({operationId: 'operation-1'});
  const changed = jest.fn();
  const view = await render(<FacilityProcessingPanel accessToken="token" orderId="order-1" onChanged={changed} />);
  await waitFor(() => expect(view.getByText('Start Wash')).toBeTruthy());
  expect(view.queryByText('Start Dry')).toBeNull();
  fireEvent.press(view.getByText('Start Wash'));
  await waitFor(() => expect(view.getByText('Complete Wash')).toBeTruthy());
  expect(start).toHaveBeenCalledWith('token', 'order-1', 'washing');
  expect(changed).toHaveBeenCalled();
});
test('blocks controls for open discrepancies and completes current operation once', async () => {
  get.mockResolvedValueOnce({...empty, nextStage: null, openDiscrepancies: 1});
  const blocked = await render(<FacilityProcessingPanel accessToken="token" orderId="order-1" onChanged={jest.fn()} />);
  await waitFor(() => expect(blocked.getByText('Resolve all intake discrepancies before processing.')).toBeTruthy());
  expect(blocked.queryByText('Start Wash')).toBeNull();
  await blocked.unmount();
  get.mockResolvedValueOnce({...empty, orderStatus: 'processing', nextStage: null, activeOperationId: 'operation-1',
    stages: [{id: 'operation-1', operation_type: 'washing', started_at: 'today', completed_at: null}]})
    .mockResolvedValueOnce({...empty, orderStatus: 'processing', nextStage: 'drying', activeOperationId: null,
      completedStageCount: 1, stages: [{id: 'operation-1', operation_type: 'washing', started_at: 'today', completed_at: 'later'}]});
  complete.mockResolvedValue({processingCompleted: true});
  const view = await render(<FacilityProcessingPanel accessToken="token" orderId="order-1" onChanged={jest.fn()} />);
  await waitFor(() => expect(view.getByText('Complete Wash')).toBeTruthy());
  fireEvent.press(view.getByText('Complete Wash'));
  await waitFor(() => expect(view.getByText('Start Dry')).toBeTruthy());
  expect(complete).toHaveBeenCalledWith('token', 'operation-1');
});
test('shows an API error and retry', async () => {
  get.mockRejectedValue(new Error('Network unavailable'));
  const view = await render(<FacilityProcessingPanel accessToken="token" orderId="order-1" onChanged={jest.fn()} />);
  await waitFor(() => expect(view.getByText('Network unavailable')).toBeTruthy());
  expect(view.getByText('Retry processing')).toBeTruthy();
});
test('Manager sees QC controls, must explain failure, and history survives rewash', async () => {
  const ready = {...empty, orderStatus: 'processing', nextStage: null, role: 'manager', canQualityCheck: true,
    stages: [{id: 'pack-1', operation_type: 'packaging', started_at: 'earlier', completed_at: 'now', rewash_cycle: 0}]};
  get.mockResolvedValueOnce(ready).mockResolvedValueOnce({...ready, orderStatus: 'rework_required', canQualityCheck: false,
    nextStage: 'washing', rewashCycle: 1, qualityDecisions: [{id: 'qc-1', cycle_number: 0, approved: false,
      rewash_required: true, defect_code: 'stain', reason: 'Stain remains', affected_item_ids: ['item-1'], created_at: 'now'}]});
  decide.mockResolvedValue({rewashRequired: true});
  const view = await render(<FacilityProcessingPanel accessToken="token" orderId="order-1" onChanged={jest.fn()}
    items={[{id: 'item-1', item_name: 'Shirt'}]} />);
  await waitFor(() => expect(view.getByText('Pass QC')).toBeTruthy());
  await fireEvent.press(view.getByText('Fail QC — require rewash'));
  await waitFor(() => expect(view.getByText('Choose a defect and enter a reason of at least 5 characters.')).toBeTruthy());
  expect(decide).not.toHaveBeenCalled();
  await fireEvent.press(view.getByText('○ stain'));
  await fireEvent.changeText(view.getByLabelText('QC reason'), 'Stain remains');
  await fireEvent.press(view.getByText('☐ Shirt'));
  await fireEvent.press(view.getByText('Fail QC — require rewash'));
  await waitFor(() => expect(view.getByText('Cycle 0 · Failed — rewash required')).toBeTruthy());
  expect(decide).toHaveBeenCalledWith('token', 'order-1', {approved: false, notes: 'Stain remains',
    defectCode: 'stain', affectedItemIds: ['item-1']});
  expect(view.getByText('Start Wash')).toBeTruthy();
});
test('Staff cannot approve QC and Manager sees rewash cap', async () => {
  const ready = {...empty, orderStatus: 'processing', nextStage: null, role: 'facility_employee',
    stages: [{id: 'pack-1', operation_type: 'packaging', started_at: 'earlier', completed_at: 'now'}]};
  get.mockResolvedValueOnce(ready);
  const staff = await render(<FacilityProcessingPanel accessToken="token" orderId="order-1" onChanged={jest.fn()} />);
  await waitFor(() => expect(staff.getByText(/A Facility Manager must perform QC/)).toBeTruthy());
  expect(staff.queryByText('Pass QC')).toBeNull();
  await staff.unmount();
  get.mockResolvedValueOnce({...ready, role: 'manager', canQualityCheck: true, rewashCycle: 2});
  const manager = await render(<FacilityProcessingPanel accessToken="token" orderId="order-1" onChanged={jest.fn()} />);
  await waitFor(() => expect(manager.getByText('Rewash limit reached. Manager reconciliation notes are required for final approval.')).toBeTruthy());
  await fireEvent.press(manager.getByText('Pass QC'));
  expect(manager.getByText('Manager reconciliation notes are required after two rewash cycles.')).toBeTruthy();
  expect(decide).not.toHaveBeenCalled();
  expect(manager.getByText('Fail QC — require rewash').props).toBeTruthy();
});
