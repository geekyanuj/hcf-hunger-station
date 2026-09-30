/**
 * Permission-based authorization.
 *
 * Roles are just named bundles of permissions. Middleware and services should
 * check `hasPermission(user, 'orders.create')` rather than `user.role === 'CASHIER'`.
 * This lets an OWNER later create custom roles / adjust a MANAGER's permission
 * set without touching route code.
 */

export const PERMISSIONS = [
  'orders.read',
  'orders.create',
  'orders.update',
  'orders.cancel',
  'orders.refund',
  'orders.discount',
  'kds.read',
  'kds.update',
  'inventory.read',
  'inventory.write',
  'inventory.purchase',
  'inventory.wastage',
  'inventory.override',
  'recipes.manage',
  'suppliers.manage',
  'purchases.manage',
  'wastage.manage',
  'audit.read',
  'reports.read',
  'analytics.read',
  'coupons.manage',
  'loyalty.manage',
  'party.manage',
  'delivery.assign',
  'exports.read',
  'notifications.manage',
  'users.manage',
  'menu.manage',
  'menu.read',
  'outlets.manage',
  'outlets.read',
  'tables.manage',
  'payments.read',
  'payments.process',
  'payments.refund',
  'delivery.read',
  'delivery.update',
  'customers.manage',
  /** Print order tokens on the thermal printer (OWNER, MANAGER, CASHIER). */
  'tokens.print',
  /** Reset the admin dashboard baseline (password re-entry required). OWNER only by default. */
  'dashboard.reset',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = ['OWNER', 'MANAGER', 'CASHIER', 'KITCHEN', 'INVENTORY', 'DELIVERY'] as const;
export type RoleName = (typeof ROLES)[number];

/**
 * Default permission sets per role. These are seeded into the Role collection
 * so that, in a later phase, an OWNER can edit them per-outlet without a
 * code deploy. Route/service code always checks the *stored* Role permissions,
 * this map only supplies sane defaults at seed time.
 *
 * Part 2 additions follow the spec's explicit restrictions:
 * - CASHIER can discount and process payments, but never `recipes.manage` or
 *   `suppliers.manage` (no supplier financial data, cannot touch recipes).
 * - KITCHEN only ever gets `kds.*` + read-only `orders.read`/`menu.read` —
 *   never inventory, reports, or user management.
 * - INVENTORY gets the full inventory/recipe/supplier/purchase/wastage stack
 *   but never `users.manage` or `orders.*`.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleName, Permission[]> = {
  OWNER: [...PERMISSIONS],
  MANAGER: [
    'orders.read', 'orders.create', 'orders.update', 'orders.cancel', 'orders.refund', 'orders.discount',
    'kds.read', 'kds.update',
    'inventory.read', 'inventory.write', 'inventory.purchase', 'inventory.wastage', 'inventory.override',
    'recipes.manage', 'suppliers.manage', 'purchases.manage', 'wastage.manage', 'audit.read',
    'reports.read', 'analytics.read', 'coupons.manage', 'loyalty.manage', 'party.manage',
    'delivery.assign', 'exports.read', 'notifications.manage',
    'menu.manage', 'menu.read',
    'outlets.read',
    'tables.manage',
    'payments.read', 'payments.process', 'payments.refund',
    'delivery.read', 'delivery.update',
    'customers.manage',
    'tokens.print',
  ],
  CASHIER: [
    'orders.read', 'orders.create', 'orders.update', 'orders.cancel', 'orders.discount',
    'menu.read', 'outlets.read',
    'inventory.read',
    'payments.read', 'payments.process',
    'customers.manage',
    'tokens.print',
  ],
  KITCHEN: ['kds.read', 'kds.update', 'orders.read', 'menu.read'],
  INVENTORY: [
    'inventory.read', 'inventory.write', 'inventory.purchase', 'inventory.wastage',
    'recipes.manage', 'suppliers.manage', 'purchases.manage', 'wastage.manage',
    'reports.read', 'exports.read',
  ],
  DELIVERY: ['delivery.read', 'delivery.update', 'orders.read'],
};
