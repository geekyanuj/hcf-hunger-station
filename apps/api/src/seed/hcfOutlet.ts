/* eslint-disable no-console */
import { Outlet, IOutlet } from '../models/Outlet';
import { User } from '../models/User';
import { Role } from '../models/Role';
import { DEFAULT_ROLE_PERMISSIONS, ROLES } from '../config/permissions';

/**
 * HCF now runs from ONE outlet. This module is the single place that defines
 * it and knows how to get any database (fresh OR already populated with the
 * old three-outlet setup) into the single-outlet state.
 *
 * Design rules:
 *  - Idempotent: safe to run any number of times.
 *  - Non-destructive: nothing that orders/payments/inventory point to is ever
 *    hard-deleted. Old outlets are soft-deleted + deactivated.
 *  - Data-preserving: if the old "Bank More" outlet exists it is converted IN
 *    PLACE into HCF Azadnagar, so its menu, tables, inventory, recipes,
 *    suppliers and order history carry over instead of starting empty.
 */

export const HCF_OUTLET = {
  name: 'HCF Azadnagar',
  code: 'HCF',
  address: 'Azadnagar, Dhanbad, Jharkhand',
  // Placeholders - update from Admin → Outlet Settings with the real contact details.
  phone: '+919000000001',
  email: 'azadnagar@hcf.example',
  openTime: '10:00', // 10:00 AM
  closeTime: '23:00', // 11:00 PM
} as const;

/** Outlet codes from the old three-outlet setup. */
const LEGACY_PRIMARY_CODE = 'BKM'; // Bank More -> becomes HCF Azadnagar
const LEGACY_RETIRED_CODES = ['SRD', 'HRP']; // Saraidhela, Hirapur -> retired

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

const DEFAULT_SETTINGS = {
  taxPercentage: 5,
  packagingCharge: 15,
  deliveryBaseCharge: 35,
  deliveryPerKmCharge: 8,
  kitchenCapacityPerSlot: 6,
  rushMultiplier: 1.4,
  tokenResetPolicy: 'DAILY' as const,
  currency: 'INR',
};

function identityFields() {
  return {
    name: HCF_OUTLET.name,
    code: HCF_OUTLET.code,
    address: HCF_OUTLET.address,
    phone: HCF_OUTLET.phone,
    email: HCF_OUTLET.email,
    isActive: true,
    isDeleted: false,
    openingHours: DAYS.map((day) => ({ day, openTime: HCF_OUTLET.openTime, closeTime: HCF_OUTLET.closeTime, isClosed: false })),
  };
}

/** Creates (or converts) the one HCF Azadnagar outlet and returns it. */
export async function ensureHcfOutlet(): Promise<IOutlet> {
  // 1. Already migrated / previously seeded.
  const existing = await Outlet.findOne({ code: HCF_OUTLET.code });
  if (existing) {
    // Only re-assert identity + hours; keep any settings the owner has tuned since.
    Object.assign(existing, identityFields());
    await existing.save();
    return existing;
  }

  // 2. Old Bank More outlet -> convert in place so its data is preserved.
  const legacy = await Outlet.findOne({ code: LEGACY_PRIMARY_CODE });
  if (legacy) {
    Object.assign(legacy, identityFields());
    await legacy.save();
    console.log(`Converted legacy outlet "${LEGACY_PRIMARY_CODE}" into "${HCF_OUTLET.name}" (menu, tables, inventory and orders preserved)`);
    return legacy;
  }

  // 3. Fresh database.
  return Outlet.create({ ...identityFields(), settings: DEFAULT_SETTINGS });
}

/** Soft-deletes the other two legacy outlets. Returns how many were retired. */
export async function retireLegacyOutlets(): Promise<number> {
  const result = await Outlet.updateMany(
    { code: { $in: LEGACY_RETIRED_CODES }, isDeleted: false },
    { $set: { isDeleted: true, isActive: false } }
  );
  return result.modifiedCount;
}

/**
 * Points every staff account at the single outlet and renames old
 * `@hfc.example` logins to `@hcf.example` (skipping any that would collide).
 */
export async function realignStaffToOutlet(
  outlet: IOutlet
): Promise<{ reassigned: number; renamed: number; fromClosedOutlets: string[] }> {
  // Accounts that only ever worked at a now-closed outlet: reported so the owner can review / deactivate them.
  const retired = await Outlet.find({ code: { $in: LEGACY_RETIRED_CODES } }).select('_id');
  const retiredIds = new Set(retired.map((o) => String(o._id)));
  const fromClosedOutlets: string[] = [];
  if (retiredIds.size > 0) {
    const candidates = await User.find({ isDeleted: false, outletIds: { $in: retired.map((o) => o._id) } });
    for (const u of candidates) if (u.outletIds.every((id) => retiredIds.has(String(id)))) fromClosedOutlets.push(u.email);
  }

  const reassign = await User.updateMany({ isDeleted: false }, { $set: { outletIds: [outlet._id] } });

  let renamed = 0;
  const legacyUsers = await User.find({ email: /@hfc\.example$/i });
  for (const user of legacyUsers) {
    const nextEmail = user.email.replace(/@hfc\.example$/i, '@hcf.example').replace(/bankmore|saraidhela|hirapur/i, 'azadnagar');
    if (await User.exists({ email: nextEmail })) continue; // already present - keep both rather than clash
    user.email = nextEmail;
    user.name = user.name.replace(/^(Bank More|Saraidhela|Hirapur)/, 'Azadnagar');
    await user.save();
    renamed += 1;
  }
  return { reassigned: reassign.modifiedCount, renamed, fromClosedOutlets };
}

/** One call that does everything; used by the seed and by `npm run migrate:single-outlet`. */
export async function applySingleOutletSetup() {
  const outlet = await ensureHcfOutlet();
  const retired = await retireLegacyOutlets();
  const staff = await realignStaffToOutlet(outlet);
  return { outlet, retired, ...staff };
}

/**
 * Permissions introduced with token printing / dashboard reset. Login tokens take their permissions from the stored
 * Role documents, so an existing database must receive them. `$addToSet` adds only what is missing and keeps any
 * permission changes the owner made to a role.
 */
export const NEW_PERMISSIONS = ['tokens.print', 'dashboard.reset'] as const;

export async function grantNewPermissions(): Promise<number> {
  let updated = 0;
  for (const name of ROLES) {
    const toGrant = NEW_PERMISSIONS.filter((p) => (DEFAULT_ROLE_PERMISSIONS[name] as readonly string[]).includes(p));
    if (toGrant.length === 0) continue;
    const res = await Role.updateOne({ name }, { $addToSet: { permissions: { $each: toGrant } } });
    updated += res.modifiedCount;
  }
  return updated;
}
