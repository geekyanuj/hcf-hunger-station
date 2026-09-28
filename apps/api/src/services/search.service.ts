import { Order } from '../models/Order';
import { Customer } from '../models/Customer';
import { MenuItem } from '../models/MenuItem';
import { InventoryItem } from '../models/InventoryItem';
import { Supplier } from '../models/Supplier';
import { User } from '../models/User';
import { PartyOrder } from '../models/PartyOrder';
import { Permission } from '../config/permissions';

const RESULT_LIMIT = 8;

export interface SearchScope {
  outletIds: string[] | 'ALL';
  permissions: Permission[];
}

function outletFilter(outletIds: string[] | 'ALL') {
  return outletIds === 'ALL' ? {} : { outletId: { $in: outletIds } };
}

/**
 * Fans a query out across every searchable collection in parallel, but only
 * includes a section if the requesting staff member actually holds the
 * matching permission — a CASHIER's search results never include supplier or
 * staff records, for example, even though the query itself would match them.
 */
export const SearchService = {
  async search(query: string, scope: SearchScope) {
    const regex = { $regex: query, $options: 'i' };
    const tasks: Record<string, Promise<unknown[]>> = {};

    if (scope.permissions.includes('orders.read')) {
      tasks.orders = Order.find({
        ...outletFilter(scope.outletIds),
        isDeleted: false,
        $or: [{ orderNumber: regex }, { tokenNumber: regex }],
      })
        .select('orderNumber tokenNumber orderType orderStatus total createdAt')
        .limit(RESULT_LIMIT);
    }

    if (scope.permissions.includes('customers.manage')) {
      tasks.customers = Customer.find({ isDeleted: false, $or: [{ name: regex }, { mobile: regex }] })
        .select('name mobile email')
        .limit(RESULT_LIMIT);
    }

    if (scope.permissions.includes('menu.read')) {
      tasks.menuItems = MenuItem.find({ ...outletFilter(scope.outletIds), isDeleted: false, name: regex })
        .select('name price categoryId outletId')
        .limit(RESULT_LIMIT);
    }

    if (scope.permissions.includes('inventory.read')) {
      tasks.inventoryItems = InventoryItem.find({
        ...outletFilter(scope.outletIds),
        isDeleted: false,
        $or: [{ name: regex }, { sku: regex }],
      })
        .select('name sku currentStock unit outletId')
        .limit(RESULT_LIMIT);
    }

    if (scope.permissions.includes('suppliers.manage')) {
      tasks.suppliers = Supplier.find({ ...outletFilter(scope.outletIds), isDeleted: false, name: regex })
        .select('name phone email')
        .limit(RESULT_LIMIT);
    }

    if (scope.permissions.includes('users.manage')) {
      tasks.staff = User.find({ isDeleted: false, $or: [{ name: regex }, { email: regex }] })
        .select('name email role')
        .limit(RESULT_LIMIT);
    }

    if (scope.permissions.includes('orders.read')) {
      tasks.partyOrders = PartyOrder.find({
        ...outletFilter(scope.outletIds),
        $or: [{ contactName: regex }, { contactPhone: regex }, { eventType: regex }],
      })
        .select('contactName contactPhone eventType eventDate status')
        .limit(RESULT_LIMIT);
    }

    const keys = Object.keys(tasks);
    const results = await Promise.all(Object.values(tasks));
    return Object.fromEntries(keys.map((key, i) => [key, results[i]]));
  },
};
