/* eslint-disable no-console */
import { Outlet, IOutlet } from '../models/Outlet';
import { User } from '../models/User';
import { Role } from '../models/Role';
import { DEFAULT_ROLE_PERMISSIONS, ROLES } from '../config/permissions';

/**
 * HCF OUTLETS
 *
 * Keep only the currently active outlet uncommented.
 *
 * To add another outlet in the future:
 * 1. Uncomment/add the outlet object.
 * 2. Run the seed.
 *
 * The seed will create the outlet if it does not already exist.
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

  /*
  // FUTURE OUTLET EXAMPLE
  {
    name: 'HCF Bank More',
    code: 'BKM',
    address: 'Bank More, Dhanbad, Jharkhand',
    phone: '+919876543211',
    email: 'bankmore@hcfhungerstation.space',
    openTime: '11:00',
    closeTime: '23:30',
  },
  */

  /*
  // FUTURE OUTLET EXAMPLE
  {
    name: 'HCF Saraidhela',
    code: 'SRD',
    address: 'Saraidhela, Dhanbad, Jharkhand',
    phone: '+919876543212',
    email: 'saraidhela@hcfhungerstation.space',
    openTime: '11:00',
    closeTime: '23:30',
  },
  */
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

/**
 * Creates the common outlet fields.
 */
function getOutletData(outlet: (typeof HCF_OUTLETS)[number]) {
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
 * Creates all configured outlets.
 *
 * Idempotent:
 * - Existing outlets are left alone.
 * - Missing outlets are created.
 *
 * This means you can add a future outlet to HCF_OUTLETS
 * and simply run the seed again.
 */
export async function ensureHcfOutlets(): Promise<IOutlet[]> {
  const outlets: IOutlet[] = [];

  for (const outletConfig of HCF_OUTLETS) {
    let outlet = await Outlet.findOne({
      code: outletConfig.code,
    });

    if (!outlet) {
      outlet = await Outlet.create({
        ...getOutletData(outletConfig),
        settings: DEFAULT_SETTINGS,
      });

      console.log(`Created outlet: ${outletConfig.name}`);
    }

    outlets.push(outlet);
  }

  return outlets;
}

/**
 * Assigns users to the configured outlet(s).
 *
 * Currently there is only one outlet, so all users are assigned
 * to HCF Azadnagar.
 *
 * When you add more outlets in the future, you should decide
 * which users belong to which outlet instead of assigning
 * everyone automatically.
 */
export async function realignStaffToOutlet(
  outlet: IOutlet
): Promise<number> {
  const result = await User.updateMany(
    { isDeleted: false },
    {
      $set: {
        outletIds: [outlet._id],
      },
    }
  );

  return result.modifiedCount;
}

/**
 * New permissions.
 */
export const NEW_PERMISSIONS = [
  'tokens.print',
  'dashboard.reset',
] as const;

/**
 * Adds new permissions to existing roles.
 */
export async function grantNewPermissions(): Promise<number> {
  let updated = 0;

  for (const name of ROLES) {
    const permissions = NEW_PERMISSIONS.filter((permission) =>
      (DEFAULT_ROLE_PERMISSIONS[name] as readonly string[]).includes(
        permission
      )
    );

    if (permissions.length === 0) continue;

    const result = await Role.updateOne(
      { name },
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
 * Runs the complete outlet setup.
 */
export async function applySingleOutletSetup() {
  const outlets = await ensureHcfOutlets();

  // Currently only one outlet exists.
  const staffUpdated = await realignStaffToOutlet(outlets[0]);

  const permissionsUpdated = await grantNewPermissions();

  return {
    outlets,
    staffUpdated,
    permissionsUpdated,
  };
}
