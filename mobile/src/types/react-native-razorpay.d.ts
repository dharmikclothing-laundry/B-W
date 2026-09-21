declare module 'react-native-razorpay' {
  type RazorpaySuccess = {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  };

  type RazorpayFailure = {
    code?: number | string;
    description?: string;
    error?: {
      code?: string;
      description?: string;
    };
  };

  const RazorpayCheckout: {
    open(options: Record<string, unknown>): Promise<RazorpaySuccess>;
  };

  export default RazorpayCheckout;
  export type {RazorpayFailure, RazorpaySuccess};
}
