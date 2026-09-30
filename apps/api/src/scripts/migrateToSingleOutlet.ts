/* eslint-disable no-console */
/**
 * One-off migration for an EXISTING database that still has the old three
 * outlets (HFC Bank More / Saraidhela / Hirapur).
 *
 *   - Bank More is converted in place into "HCF Azadnagar" (menu, tables,
 *     inventory, recipes and order history are kept).
 *   - Saraidhela and Hirapur are soft-deleted (never hard-deleted, orders
 *     still reference them).
 *   - Every staff account is pointed at the single outlet and old
 *     `@hfc.example` logins are renamed to `@hcf.example`.
 *   - Roles receive the new `tokens.print` (Owner, Manager, Cashier) and
 *     `dashboard.reset` (Owner) permissions without touching other role edits.
 *
 * Usage:
 *   npm run migrate:single-outlet --workspace=apps/api
 *
 * Safe to re-run. A fresh database does not need this - `npm run seed` does the same thing.
 */
import mongoose from 'mongoose';
import { env } from '../config/env';
import { applySingleOutletSetup, grantNewPermissions } from '../seed/hcfOutlet';

async function run() {
  await mongoose.connect(env.mongoUri);
  const { outlet, retired, reassigned, renamed, fromClosedOutlets } = await applySingleOutletSetup();
  console.log(`Outlet ready: ${outlet.name} (${outlet.address}) id=${outlet.id}`);
  console.log(`Legacy outlets retired: ${retired}`);
  console.log(`Staff accounts re-pointed: ${reassigned}, logins renamed to @hcf.example: ${renamed}`);
  if (fromClosedOutlets.length > 0) {
    console.log('\nThese staff accounts only worked at outlets that are now closed. They were moved to HCF Azadnagar and are still ACTIVE;');
    console.log('review them in Admin -> Staff and deactivate any that are no longer needed:');
    for (const email of fromClosedOutlets) console.log(`  - ${email}`);
    console.log('');
  }
  console.log(`Roles updated with new permissions: ${await grantNewPermissions()}`);
  console.log('Everyone must sign in again once so their login picks up the new permissions.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
