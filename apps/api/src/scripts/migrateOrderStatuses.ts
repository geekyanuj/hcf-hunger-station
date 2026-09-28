/**
 * One-off data migration to the canonical order lifecycle.
 *
 *   RECEIVED  → PENDING
 *   ASSIGNED  → READY            (+ deliveryStatus ASSIGNED)
 *   PICKED_UP → READY            (+ deliveryStatus PICKED_UP)
 *   DELIVERED → COMPLETED        (+ deliveryStatus DELIVERED)
 *
 * Status-history entries are rewritten the same way (`changedAt` → `timestamp`,
 * `changedByRole` added), ASSIGNED/PICKED_UP entries move to `deliveryHistory`,
 * Parcel orders get a `deliveryStatus`, Dine orders get a `tableNumber`
 * snapshot, and cancelled orders get `cancelledAt` / `previousOrderStatus`.
 *
 * Usage:
 *   npm run migrate:order-status --workspace=apps/api            # apply
 *   npm run migrate:order-status --workspace=apps/api -- --dry-run
 *
 * Safe to re-run: documents that are already canonical are skipped.
 */
import mongoose from 'mongoose';
import { env } from '../config/env';
import { logger } from '../config/logger';

type Dict = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const LEGACY_STATUSES = new Set(['RECEIVED', 'ASSIGNED', 'PICKED_UP', 'DELIVERED']);
const DELIVERY_ONLY = new Set(['ASSIGNED', 'PICKED_UP']);

export function mapOrderStatus(status: string): string {
  switch (status) {
    case 'RECEIVED':
      return 'PENDING';
    case 'ASSIGNED':
    case 'PICKED_UP':
      return 'READY';
    case 'DELIVERED':
      return 'COMPLETED';
    default:
      return status;
  }
}

/** Pure function: returns the `$set` update for one order document, or null when it is already canonical. */
export function buildOrderMigration(doc: Dict, tableNumber?: string): Dict | null {
  const history: Dict[] = Array.isArray(doc.statusHistory) ? doc.statusHistory : [];
  const needsHistory = history.some((h) => LEGACY_STATUSES.has(h.status) || h.timestamp === undefined || h.changedByRole === undefined);
  const needsStatus = LEGACY_STATUSES.has(doc.orderStatus);
  const isParcel = doc.orderType === 'DELIVERY';
  const needsDelivery = isParcel && doc.deliveryStatus === undefined;
  const needsTable = doc.orderType === 'DINE_IN' && doc.tableId && !doc.tableNumber && !!tableNumber;
  const needsCancelInfo = doc.orderStatus === 'CANCELLED' && !doc.cancelledAt;
  if (!needsHistory && !needsStatus && !needsDelivery && !needsTable && !needsCancelInfo) return null;

  const set: Dict = {};

  // --- status history -------------------------------------------------------
  const newHistory: Dict[] = [];
  const deliveryHistory: Dict[] = Array.isArray(doc.deliveryHistory) ? [...doc.deliveryHistory] : [];
  for (const entry of history) {
    const timestamp = entry.timestamp ?? entry.changedAt ?? doc.createdAt;
    const base = { timestamp, changedBy: entry.changedBy, changedByRole: entry.changedByRole ?? 'UNKNOWN', note: entry.note };
    if (DELIVERY_ONLY.has(entry.status)) {
      deliveryHistory.push({ ...base, status: entry.status });
      continue;
    }
    const status = mapOrderStatus(entry.status);
    const previous = newHistory[newHistory.length - 1];
    if (previous && previous.status === status) continue; // e.g. DELIVERED followed by COMPLETED collapses into one COMPLETED
    newHistory.push({ ...base, status });
  }
  if (newHistory.length === 0) newHistory.push({ status: mapOrderStatus(doc.orderStatus), timestamp: doc.createdAt, changedByRole: 'UNKNOWN' });
  set.statusHistory = newHistory;

  // --- order status ---------------------------------------------------------
  const status = mapOrderStatus(doc.orderStatus);
  if (status !== doc.orderStatus) set.orderStatus = status;

  // --- delivery lifecycle ---------------------------------------------------
  if (isParcel) {
    let deliveryStatus: string;
    if (doc.orderStatus === 'PICKED_UP') deliveryStatus = 'PICKED_UP';
    else if (doc.orderStatus === 'ASSIGNED') deliveryStatus = 'ASSIGNED';
    else if (status === 'OUT_FOR_DELIVERY') deliveryStatus = 'OUT_FOR_DELIVERY';
    else if (status === 'COMPLETED') deliveryStatus = 'DELIVERED';
    else if (status === 'CANCELLED') deliveryStatus = 'CANCELLED';
    else if (status === 'READY' && doc.deliveryStaffId) deliveryStatus = 'ASSIGNED';
    else deliveryStatus = 'PENDING';
    if (doc.deliveryStatus === undefined) set.deliveryStatus = deliveryStatus;
    if (deliveryHistory.length !== (doc.deliveryHistory?.length ?? 0)) set.deliveryHistory = deliveryHistory;
  }

  // --- dine table snapshot --------------------------------------------------
  if (needsTable) set.tableNumber = tableNumber;

  // --- cancellation info ----------------------------------------------------
  if (needsCancelInfo) {
    const cancelIdx = newHistory.map((h) => h.status).lastIndexOf('CANCELLED');
    set.cancelledAt = cancelIdx >= 0 ? newHistory[cancelIdx].timestamp : doc.updatedAt ?? doc.createdAt;
    if (cancelIdx > 0) set.previousOrderStatus = newHistory[cancelIdx - 1].status;
    set.cancellationReason = doc.cancellationReason ?? 'Cancelled (migrated legacy order)';
    set.paymentStatusAtCancellation = doc.paymentStatus;
  }

  return set;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  await mongoose.connect(env.mongoUri);
  const orders = mongoose.connection.collection('orders');
  const tables = mongoose.connection.collection('tables');

  let scanned = 0;
  let migrated = 0;
  const cursor = orders.find({});
  for await (const doc of cursor) {
    scanned += 1;
    let tableNumber: string | undefined;
    if (doc.orderType === 'DINE_IN' && doc.tableId && !doc.tableNumber) {
      tableNumber = (await tables.findOne({ _id: doc.tableId }))?.tableNumber;
    }
    const set = buildOrderMigration(doc, tableNumber);
    if (!set) continue;
    migrated += 1;
    if (!dryRun) {
      // The legacy `changedAt` key lives inside array elements we just replaced wholesale, so no $unset is needed.
      await orders.updateOne({ _id: doc._id }, { $set: set });
    }
  }
  logger.info(`Order status migration ${dryRun ? '(dry run) ' : ''}complete: scanned ${scanned}, ${dryRun ? 'would migrate' : 'migrated'} ${migrated}`);
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    logger.error(`Order status migration failed: ${(err as Error).message}`);
    process.exit(1);
  });
}
