import { v4 as uuid } from 'uuid';
import {
  PaymentProvider,
  CreatePaymentInput,
  CreatePaymentResult,
  VerifyPaymentResult,
  RefundPaymentInput,
  RefundPaymentResult,
} from './PaymentProvider';

/**
 * Deterministic, dependency-free provider used for local development and
 * automated tests. CASH always "succeeds" immediately (money changes hands
 * physically). UPI/CARD/ONLINE simulate an async gateway: they come back
 * INITIATED and are confirmed via the /payments/webhook endpoint, mirroring
 * how a real gateway (e.g. Razorpay) would behave.
 */
export class MockPaymentProvider implements PaymentProvider {
  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const providerReferenceId = `mock_${uuid()}`;
    if (input.method === 'CASH') {
      return { providerReferenceId, status: 'SUCCESS' };
    }
    return {
      providerReferenceId,
      status: 'INITIATED',
      redirectUrl: `https://mock-payments.local/checkout/${providerReferenceId}`,
    };
  }

  async verifyPayment(providerReferenceId: string): Promise<VerifyPaymentResult> {
    // In Part 1 there is no real gateway to poll; callers should rely on the
    // webhook to move status to SUCCESS/FAILED. This always reports PENDING
    // for non-cash references that have not yet received a webhook call.
    return { status: 'PENDING', providerReferenceId };
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult> {
    return { status: 'REFUNDED', refundReferenceId: `mock_refund_${uuid()}`, };
  }

  async handleWebhook(rawBody: unknown): Promise<{ providerReferenceId: string; status: 'SUCCESS' | 'FAILED' }> {
    const body = rawBody as { providerReferenceId?: string; status?: string };
    if (!body.providerReferenceId) throw new Error('Missing providerReferenceId in webhook payload');
    const status = body.status === 'FAILED' ? 'FAILED' : 'SUCCESS';
    return { providerReferenceId: body.providerReferenceId, status };
  }
}
