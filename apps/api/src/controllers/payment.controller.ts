import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { sendSuccess } from "../utils/apiResponse";
import { ApiError } from "../utils/ApiError";
import { PaymentService } from "../services/payment.service";
import { signWebhookPayload } from "../utils/webhookSignature";
import { env } from "../config/env";
import { actorFromAuth } from "../services/orderStateMachine";

export const PaymentController = {
  initiate: asyncHandler(async (req: Request, res: Response) => {
    const { orderId, method, amount } = req.body;
    const result = await PaymentService.initiate(
      orderId,
      method,
      amount,
      actorFromAuth(req.auth),
    );
    return sendSuccess(res, result, "Payment initiated", 201);
  }),

  /** Provider-specific verification runs before a webhook can update a payment. */
  webhook: asyncHandler(async (req: Request, res: Response) => {
    const signature = (
      req.headers["x-razorpay-signature"] ??
      req.headers["x-juspay-signature"] ??
      req.headers["x-webhook-signature"]
    ) as string | undefined;

    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    const providerName = typeof req.params.provider === 'string'
      ? req.params.provider.toUpperCase()
      : undefined;
    const payment = await PaymentService.handleWebhook(req.body, signature, rawBody, providerName);

    return sendSuccess(res, payment, "Webhook processed");
  }),

  juspayReturn: asyncHandler(async (req: Request, res: Response) => {
    const orderId = req.query.order_id;
    if (typeof orderId === 'string') {
      await PaymentService.handleWebhook({ order_id: orderId }, undefined, undefined, 'JUSPAY');
    }
    return res.redirect(303, env.corsOrigin);
  }),

  /**
   * Dev/demo-only: the mock provider has no real gateway to call our webhook
   * back, so there's no other way to exercise the UPI/CARD/ONLINE async
   * confirmation path end-to-end locally. This route self-signs a webhook
   * payload exactly like the real gateway would and feeds it through the
   * same PaymentService.handleWebhook code path — it does NOT bypass
   * signature verification, it generates a valid one. Gated to staff auth
   * and to PAYMENT_PROVIDER=MOCK; returns 403 for any real provider.
   */
  devSimulateWebhook: asyncHandler(async (req: Request, res: Response) => {
    if (env.payment.provider !== "MOCK") {
      throw ApiError.forbidden(
        "Webhook simulation is only available when PAYMENT_PROVIDER=MOCK",
      );
    }
    const { providerReferenceId, status } = req.body;
    const body = { providerReferenceId, status: status ?? "SUCCESS" };
    const signature = signWebhookPayload(body);
    const payment = await PaymentService.handleWebhook(body, signature);
    return sendSuccess(res, payment, "Webhook simulated (dev/mock only)");
  }),

  refund: asyncHandler(async (req: Request, res: Response) => {
    const { orderId, amount } = req.body;
    const userId = req.auth?.type === "STAFF" ? req.auth.sub : undefined;
    const payment = await PaymentService.refund(orderId, amount, {
      userId,
      ipAddress: req.ip,
    });
    return sendSuccess(res, payment, "Refund processed");
  }),

  listForOrder: asyncHandler(async (req: Request, res: Response) => {
    const payments = await PaymentService.listForOrder(req.params.orderId);
    return sendSuccess(res, payments);
  }),
};
