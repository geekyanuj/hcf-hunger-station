import crypto from 'crypto';
import { randomUUID } from 'crypto';
import { env } from '../../config/env';
import type {
  PaymentProvider,
  CreatePaymentInput,
  CreatePaymentResult,
  VerifyPaymentResult,
  RefundPaymentInput,
  RefundPaymentResult,
  WebhookResult,
} from './PaymentProvider';

interface RazorpayPaymentLink {
  id: string;
  short_url: string;
  status: string;
}

interface RazorpayApiError {
  error?: { description?: string; reason?: string };
}

interface RazorpayWebhook {
  event?: string;
  payload?: {
    payment_link?: { entity?: { id?: string } };
    payment?: { entity?: { id?: string; status?: string } };
  };
}

export class RazorpayPaymentProvider implements PaymentProvider {
  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (input.method === 'CASH') {
      return { providerReferenceId: `cash_${input.orderId}`, status: 'SUCCESS' };
    }

    const link = await this.request<RazorpayPaymentLink>('/payment_links', {
      method: 'POST',
      body: JSON.stringify({
        amount: Math.round(input.amount * 100),
        currency: input.currency ?? 'INR',
        accept_partial: false,
        reference_id: randomUUID(),
        description: `HFC order ${input.orderId}`,
        notes: { orderId: input.orderId },
        notify: { sms: false, email: false },
        reminder_enable: false,
      }),
    });

    return {
      providerReferenceId: link.id,
      redirectUrl: link.short_url,
      status: 'INITIATED',
    };
  }

  async verifyPayment(providerReferenceId: string): Promise<VerifyPaymentResult> {
    const link = await this.request<RazorpayPaymentLink>(`/payment_links/${encodeURIComponent(providerReferenceId)}`);
    return {
      providerReferenceId,
      status: link.status === 'paid' ? 'SUCCESS' : link.status === 'cancelled' || link.status === 'expired' ? 'FAILED' : 'PENDING',
    };
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult> {
    if (input.providerReferenceId.startsWith('cash_')) {
      return { status: 'REFUNDED', refundReferenceId: `cash_refund_${input.providerReferenceId}` };
    }
    const refund = await this.request<{ id: string }>(
      `/payments/${encodeURIComponent(input.providerReferenceId)}/refund`,
      { method: 'POST', body: JSON.stringify({ amount: Math.round(input.amount * 100) }) },
    );
    return { status: 'REFUNDED', refundReferenceId: refund.id };
  }

  async handleWebhook(rawBody: unknown, signature?: string, rawPayload?: Buffer): Promise<WebhookResult> {
    const webhookSecret = env.payment.razorpayWebhookSecret;
    if (!webhookSecret) throw new Error('RAZORPAY_WEBHOOK_SECRET is not configured');
    if (!signature || !rawPayload || !this.isValidSignature(rawPayload, signature, webhookSecret)) {
      throw new Error('Invalid Razorpay webhook signature');
    }

    const payload = rawBody as RazorpayWebhook;
    const event = payload.event;
    const providerReferenceId = payload.payload?.payment_link?.entity?.id;
    if (!providerReferenceId) throw new Error('Razorpay webhook is missing the payment link reference');

    if (event !== 'payment_link.paid' && event !== 'payment_link.cancelled' && event !== 'payment_link.expired') {
      throw new Error(`Unsupported Razorpay webhook event: ${event ?? 'unknown'}`);
    }

    return {
      providerReferenceId,
      providerPaymentId: payload.payload?.payment?.entity?.id,
      status: event === 'payment_link.paid' ? 'SUCCESS' : 'FAILED',
    };
  }

  private isValidSignature(rawPayload: Buffer, signature: string, secret: string): boolean {
    const expected = crypto.createHmac('sha256', secret).update(rawPayload).digest();
    const provided = Buffer.from(signature, 'hex');
    return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const keyId = env.payment.razorpayKeyId;
    const keySecret = env.payment.razorpayKeySecret;
    if (!keyId || !keySecret) throw new Error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be configured');

    const response = await fetch(`https://api.razorpay.com/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
    if (!response.ok) {
      const details = await response.json().catch(() => ({})) as RazorpayApiError;
      throw new Error(`Razorpay API error: ${details.error?.description ?? details.error?.reason ?? response.statusText}`);
    }
    return response.json() as Promise<T>;
  }
}