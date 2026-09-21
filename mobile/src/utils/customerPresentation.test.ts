import {customerStatus, customerTimelineReason, formatPaymentMethod} from './customerPresentation';
test.each([null, undefined, ''])('missing historical payment %s has a safe label', value => {
  expect(formatPaymentMethod(value)).toBe('Not recorded');
});
test('payment and refund status use readable customer labels', () => {
  expect(formatPaymentMethod('razorpay')).toBe('Online Payment');
  expect(formatPaymentMethod('cash_on_delivery')).toBe('Cash on Delivery');
  expect(customerStatus('partially_refunded')).toBe('Partially refunded');
});
test('system payment identifiers are removed without rewriting customer notes', () => {
  expect(customerTimelineReason('Provider payment captured (mock_payment_private)')).toBe('Payment received');
  expect(customerTimelineReason('Please return my blue shirt')).toBe('Please return my blue shirt');
});
