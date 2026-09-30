# User Roles and Permissions

HCF ROS uses permission-based authorization (see config/permissions.ts)
with six seeded roles. A role is just a named bundle of permissions stored
in the Role collection - route/service code checks the permission, never
the role name directly, so permissions can be edited per-deployment
without a code change (an editing UI for that is not built - see "Known
Limitations" in the README - but the data model supports it today via a
direct Role document update).

## OWNER

Every permission in the system. Only OWNER accounts can:
- View the ALL OUTLETS consolidated dashboard/analytics view.
- Manage outlets (create/deactivate outlets).

## MANAGER

Everything an outlet needs to run day-to-day except owning the business:
orders, kitchen, full inventory stack (items/recipes/suppliers/purchases/
wastage), menu management, tables, payments (including refunds), coupons,
loyalty configuration, party/catering requests, delivery assignment,
exports, notifications, and audit log read access. Restricted to their
assigned outlet(s) - a MANAGER's dashboard/analytics/search requests
silently scope to their own outlets even if they ask for ALL, and an
explicit request for an outlet they aren't assigned to is rejected (403).
Cannot manage other outlets' settings or see the ALL-outlets consolidated
view.

## CASHIER

POS-focused: create/read/update/cancel orders, apply discounts, process
payments, read-only menu/inventory/outlet access, manage customer records.
Cannot manage recipes, suppliers, purchases, wastage, coupons, loyalty
config, staff, or outlet settings - verified by
fullFlow.integration.test.ts's permission tests (a CASHIER token gets 403
on POST /recipes).

## KITCHEN

The narrowest role by design: kds.read, kds.update, orders.read, menu.read.
Cannot access supplier financial data, owner reports, staff management, or
anything outside the Kitchen Display System - a KITCHEN account is meant to
log into /kds and nothing else, and the frontend nav reflects that. Verified
by a 403 test against /suppliers.

## INVENTORY

The full inventory/recipe/supplier/purchase/wastage stack, plus
reports.read and exports.read for inventory-side reporting. Cannot manage
users, orders, or menu pricing. Verified by a 403 test against /users.

## DELIVERY

delivery.read, delivery.update, orders.read. A DELIVERY account's "my
orders" queue is filtered by a database query (deliveryStaffId: their own
id), not a frontend filter - it is structurally impossible for one rider's
token to retrieve another rider's assigned orders or any order that hasn't
been assigned to them, regardless of what the client requests.

## Customer accounts

Not a "role" in the RBAC sense - customers authenticate via mobile+OTP and
receive a token typed CUSTOMER rather than STAFF, a completely separate
code path in every middleware (requireStaff vs requireCustomer). A customer
can only ever see/modify their own profile, orders, addresses, and loyalty
balance - enforced by matching req.auth.sub against the resource's
customerId in every relevant service, not by role permission checks.

## Permission reference

See apps/api/src/config/permissions.ts for the canonical, exhaustive list
of permission strings and the default role-to-permission mapping seeded by
npm run seed.

## Staff login

All staff sign in at /staff/login (email + password). See the root
README's "Test credentials" section for the seeded demo accounts across
all six roles.
