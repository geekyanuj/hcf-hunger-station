import { Permission, RoleName } from '../config/permissions';

export interface StaffAccessTokenPayload {
  type: 'STAFF';
  sub: string; // userId
  role: RoleName;
  permissions: Permission[];
  outletIds: string[];
}

export interface CustomerAccessTokenPayload {
  type: 'CUSTOMER';
  sub: string; // customerId
  mobile: string;
}

export type AccessTokenPayload = StaffAccessTokenPayload | CustomerAccessTokenPayload;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AccessTokenPayload;
    }
  }
}
