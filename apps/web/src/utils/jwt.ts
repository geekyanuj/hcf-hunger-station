export interface DecodedStaffToken {
  type: 'STAFF';
  sub: string;
  role: string;
  permissions: string[];
  outletIds: string[];
}

export interface DecodedCustomerToken {
  type: 'CUSTOMER';
  sub: string;
  mobile: string;
}

/**
 * Decodes a JWT's payload without verifying its signature. This is only ever
 * used to drive which buttons/nav items the UI shows (e.g. hiding "Suppliers"
 * from a KITCHEN account) — every actual permission check happens again,
 * authoritatively, on the server via the `authorize()` middleware. Never use
 * this output to make a security decision client-side.
 */
export function decodeJwtPayload<T = DecodedStaffToken | DecodedCustomerToken>(token: string): T | null {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
