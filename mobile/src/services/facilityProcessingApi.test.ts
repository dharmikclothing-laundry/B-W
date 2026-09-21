import {completeFacilityStage, getFacilityProcessing, recordFacilityQualityDecision, startFacilityStage} from './facilityProcessingApi';
import {apiRequest} from './api';
jest.mock('./api', () => ({apiRequest: jest.fn()}));
test('uses scoped Facility stage and history contracts', async () => {
  await getFacilityProcessing('token', 'order-1');
  await startFacilityStage('token', 'order-1', 'washing');
  await completeFacilityStage('token', 'operation-1');
  await recordFacilityQualityDecision('token', 'order-1', {approved: false, notes: 'Stain remains', defectCode: 'stain'});
  expect(apiRequest).toHaveBeenNthCalledWith(1, '/facility/orders/order-1/processing', {accessToken: 'token'});
  expect(apiRequest).toHaveBeenNthCalledWith(2, '/facility/orders/order-1/processing',
    {accessToken: 'token', method: 'POST', body: {processType: 'washing'}});
  expect(apiRequest).toHaveBeenNthCalledWith(3, '/facility/operations/operation-1/complete',
    {accessToken: 'token', method: 'POST'});
  expect(apiRequest).toHaveBeenNthCalledWith(4, '/facility/orders/order-1/quality-check',
    {accessToken: 'token', method: 'POST', body: {approved: false, notes: 'Stain remains', defectCode: 'stain'}});
});
