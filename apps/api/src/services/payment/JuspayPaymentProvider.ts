import { APIError } from 'expresscheckout-nodejs';
import { randomBytes } from 'crypto';

import { juspay, juspayConfig } from '../../config/juspay';

import type {
  PaymentProvider,
  CreatePaymentInput,
  CreatePaymentResult,
  VerifyPaymentResult,
  RefundPaymentInput,
  RefundPaymentResult,
  WebhookResult,
} from './PaymentProvider';

export class JuspayPaymentProvider implements PaymentProvider {
  async createPayment(
    input: CreatePaymentInput,
  ): Promise<CreatePaymentResult> {
    try {
      const returnUrl =
        `${process.env.PUBLIC_API_URL}/api/v1/payments/juspay/return`;
      const juspayOrderId = randomBytes(10).toString('hex');

      const response = await juspay.orderSession.create({
        order_id: juspayOrderId,
        amount: input.amount,
        payment_page_client_id:
          juspayConfig.paymentPageClientId,
        customer_id: input.orderId,
        action: 'paymentPage',
        return_url: returnUrl,
        currency: input.currency ?? 'INR',
      });

      return {
        providerReferenceId: juspayOrderId,
        redirectUrl: response.payment_links?.web,
        status: 'INITIATED',
      };
    } catch (error) {
      if (error instanceof APIError) {
        throw new Error(`Juspay error: ${error.message}`);
      }

      throw error;
    }
  }

  async verifyPayment(
    providerReferenceId: string,
  ): Promise<VerifyPaymentResult> {
    try {
      const response =
        await juspay.order.status(providerReferenceId);

      switch (response.status) {
        case 'CHARGED':
          return {
            status: 'SUCCESS',
            providerReferenceId,
          };

        case 'PENDING':
        case 'PENDING_VBV':
          return {
            status: 'PENDING',
            providerReferenceId,
          };

        default:
          return {
            status: 'PENDING',
            providerReferenceId,
          };
      }
    } catch (error) {
      if (error instanceof APIError) {
        throw new Error(`Juspay error: ${error.message}`);
      }

      throw error;
    }
  }

  async refundPayment(
    input: RefundPaymentInput,
  ): Promise<RefundPaymentResult> {
    // Implement against the refund API after confirming
    // the exact refund API/version enabled for your merchant.
    throw new Error('Juspay refund not implemented');
  }

  async handleWebhook(
    rawBody: unknown,
    signature?: string,
  ): Promise<WebhookResult> {
    const body = rawBody as { order_id?: string; orderId?: string };
    const providerReferenceId = body.order_id ?? body.orderId;
    if (!providerReferenceId) throw new Error('Missing Juspay order_id in callback');

    const result = await this.verifyPayment(providerReferenceId);
    if (result.status === 'PENDING') throw new Error('Juspay payment is not in a terminal state');
    return {
      providerReferenceId,
      status: result.status,
    };
  }
}
