export interface CreatePaymentInput {
  orderId: string;
  amount: number;
  method: 'CASH' | 'UPI' | 'CARD' | 'ONLINE';
  currency?: string;
}

export interface CreatePaymentResult {
  providerReferenceId: string;
  /** For ONLINE methods, a redirect/checkout URL the client should open. */
  redirectUrl?: string;
  status: 'INITIATED' | 'SUCCESS' | 'FAILED';
}

export interface VerifyPaymentResult {
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  providerReferenceId: string;
}

export interface RefundPaymentInput {
  providerReferenceId: string;
  amount: number;
}

export interface RefundPaymentResult {
  status: 'REFUNDED' | 'FAILED';
  refundReferenceId: string;
}

export interface WebhookResult {
  providerReferenceId: string;
  providerPaymentId?: string;
  status: 'SUCCESS' | 'FAILED';
}

/**
 * Payment abstraction. Every concrete gateway (Razorpay, PhonePe, Paytm, etc.)
 * implements this interface so order/payment services never depend on a
 * specific vendor's SDK. Swap `PAYMENT_PROVIDER` in env + the factory in
 * `payment.service.ts` to plug in a real Indian payment gateway later.
 */
export interface PaymentProvider {
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  verifyPayment(providerReferenceId: string): Promise<VerifyPaymentResult>;
  refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult>;
  /** Validates and parses an incoming webhook payload from the provider. */
  handleWebhook(rawBody: unknown, signature?: string, rawPayload?: Buffer): Promise<WebhookResult>;
}
