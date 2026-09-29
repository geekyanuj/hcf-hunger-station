import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../config/env';
import { RazorpayPaymentProvider } from '../../services/payment/RazorpayPaymentProvider';

describe('RazorpayPaymentProvider', () => {
  const provider = new RazorpayPaymentProvider();

  beforeEach(() => {
    env.payment.razorpayKeyId = 'test_key';
    env.payment.razorpayKeySecret = 'test_secret';
    env.payment.razorpayWebhookSecret = 'webhook_secret';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a hosted payment link using the amount in paise', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'plink_test',
      short_url: 'https://rzp.io/test',
      status: 'created',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await provider.createPayment({ orderId: 'order-1', amount: 125.5, method: 'ONLINE' });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);

    expect(request.amount).toBe(12550);
    expect(result).toEqual({ providerReferenceId: 'plink_test', redirectUrl: 'https://rzp.io/test', status: 'INITIATED' });
  });

  it('validates Razorpay signatures against the original webhook bytes', async () => {
    const rawBody = Buffer.from(JSON.stringify({
      event: 'payment_link.paid',
      payload: {
        payment_link: { entity: { id: 'plink_test' } },
        payment: { entity: { id: 'pay_test' } },
      },
    }));
    const signature = crypto.createHmac('sha256', 'webhook_secret').update(rawBody).digest('hex');
    const result = await provider.handleWebhook(JSON.parse(rawBody.toString()), signature, rawBody);

    expect(result).toEqual({
      providerReferenceId: 'plink_test',
      providerPaymentId: 'pay_test',
      status: 'SUCCESS',
    });
    await expect(provider.handleWebhook(JSON.parse(rawBody.toString()), 'bad-signature', rawBody)).rejects.toThrow('Invalid Razorpay webhook signature');
  });
});