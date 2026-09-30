/* eslint-disable no-console */
import { Outlet, IOutlet } from '../models/Outlet';
import { User } from '../models/User';
import { Role } from '../models/Role';
import {
  DEFAULT_ROLE_PERMISSIONS,
  ROLES,
} from '../config/permissions';

/**
 * ============================================================
 * HCF OUTLETS
 * ============================================================
 *
 * Add/remove outlets here as required.
 *
 * Example:
 *
 * {
 *   name: 'HCF Bank More',
 *   code: 'BKM',
 *   address: 'Bank More, Dhanbad, Jharkhand',
 *   phone: '+919876543211',
 *   email: 'bankmore@hcfhungerstation.space',
 *   openTime: '11:00',
 *   closeTime: '23:30',
 * },
 *
 * After adding an outlet, run:
 *
 * npm run seed --workspace=apps/api
 *
 * Existing outlets are NOT modified.
 */

export const HCF_OUTLETS = [
  {
    name: 'HCF Azadnagar',
    code: 'AZN',
    address: 'Azadnagar, Dhanbad, Jharkhand',
    phone: '+919876543210',
    email: 'azadnagar@hcfhungerstation.space',
    openTime: '11:00',
    closeTime: '23:30',
  },

  // Add future outlets here.
] as const;

const DAYS = [
  'MON',
  'TUE',
  'WED',
  'THU',
  'FRI',
  'SAT',
  'SUN',
] as const;

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

function getOutletData(
  outlet: (typeof HCF_OUTLETS)[number]
) {
  return {
    name: outlet.name,
    code: outlet.code,
    address: outlet.address,
    phone: outlet.phone,
    email: outlet.email,

    isActive: true,
    isDeleted: false,

    openingHours: DAYS.map((day) => ({
      day,
      openTime: outlet.openTime,
      closeTime: outlet.closeTime,
      isClosed: false,
    })),
  };
}

/**
 * Create all configured outlets.
 *
 * Idempotent:
 * - Existing outlet with same code = untouched.
 * - Missing outlet = created.
 */
export async function ensureHcfOutlets(): Promise<IOutlet[]> {
  const outlets: IOutlet[] = [];

  for (const config of HCF_OUTLETS) {
    let outlet = await Outlet.findOne({
      code: config.code,
    });

    if (!outlet) {
      outlet = await Outlet.create({
        ...getOutletData(config),
        settings: DEFAULT_SETTINGS,
      });

      console.log(`Created outlet: ${config.name}`);
    } else {
      console.log(`Outlet already exists: ${config.name}`);
    }

    outlets.push(outlet);
  }

  return outlets;
}

/**
 * Assign users to an outlet.
 *
 * This should only be used when you explicitly want
 * to assign users to a particular outlet.
 */
export async function assignUsersToOutlet(
  outletId: IOutlet['_id'],
  userIds: User['_id'][]
): Promise<number> {
  const result = await User.updateMany(
    {
      _id: { $in: userIds },
      isDeleted: false,
    },
    {
      $set: {
        outletIds: [outletId],
      },
    }
  );

  return result.modifiedCount;
}

/**
 * New permissions that need to be added to existing roles.
 */
export const NEW_PERMISSIONS = [
  'tokens.print',
  'dashboard.reset',
] as const;

/**
 * Add new permissions without removing existing permissions.
 */
export async function grantNewPermissions(): Promise<number> {
  let updated = 0;

  for (const roleName of ROLES) {
    const permissions = NEW_PERMISSIONS.filter((permission) =>
      (
        DEFAULT_ROLE_PERMISSIONS[roleName] as readonly string[]
      ).includes(permission)
    );

    if (permissions.length === 0) continue;

    const result = await Role.updateOne(
      { name: roleName },
      {
        $addToSet: {
          permissions: {
            $each: permissions,
          },
        },
      }
    );

    updated += result.modifiedCount;
  }

  return updated;
}

/**
 * Complete outlet setup.
 *
 * Does NOT:
 * - delete outlets
 * - modify existing outlet data
 * - automatically move staff
 *
 * It only creates missing configured outlets.
 */
export async function applyOutletSetup() {
  const outlets = await ensureHcfOutlets();

  const permissionsUpdated = await grantNewPermissions();

  return {
    outlets,
    permissionsUpdated,
  };
}
