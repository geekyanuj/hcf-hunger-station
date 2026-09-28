import fs from 'node:fs';
import { Juspay } from 'expresscheckout-nodejs';

const SANDBOX_BASE_URL = 'https://smartgateway.hdfcuat.bank.in';
const PRODUCTION_BASE_URL = 'https://smartgateway.hdfc.bank.in';

const environment = process.env.JUSPAY_ENV ?? 'sandbox';

const publicKeyPath = process.env.JUSPAY_PUBLIC_KEY_PATH;
const privateKeyPath = process.env.JUSPAY_PRIVATE_KEY_PATH;

if (!publicKeyPath) {
  throw new Error('JUSPAY_PUBLIC_KEY_PATH is not configured');
}

if (!privateKeyPath) {
  throw new Error('JUSPAY_PRIVATE_KEY_PATH is not configured');
}

const publicKey = fs.readFileSync(publicKeyPath);
const privateKey = fs.readFileSync(privateKeyPath);

export const juspay = new Juspay({
  merchantId: process.env.JUSPAY_MERCHANT_ID!,
  baseUrl:
    environment === 'production'
      ? PRODUCTION_BASE_URL
      : SANDBOX_BASE_URL,
  jweAuth: {
    keyId: process.env.JUSPAY_KEY_UUID!,
    publicKey,
    privateKey,
  },
});

export const juspayConfig = {
  paymentPageClientId:
    process.env.JUSPAY_PAYMENT_PAGE_CLIENT_ID!,
  environment,
};
