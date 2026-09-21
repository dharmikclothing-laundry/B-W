export function customerStatus(value?: string | null) {
  if (!value?.trim()) return 'Not available';
  const text = value.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatPaymentMethod(value?: string | null) {
  if (value === 'cash_on_delivery') return 'Cash on Delivery';
  if (value === 'razorpay') return 'Online Payment';
  return value ? customerStatus(value) : 'Not recorded';
}

export function customerTimelineReason(value?: string | null) {
  // Only replace known system-generated provider messages. Customer-entered
  // cancellation explanations and staff service notes remain unchanged.
  if (value?.startsWith('Provider payment captured (')) return 'Payment received';
  return value;
}
