import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@/utils/cn';

const TABS = [
  { to: '/inventory', label: 'Dashboard', end: true },
  { to: '/inventory/items', label: 'Items' },
  { to: '/inventory/transactions', label: 'Transactions' },
  { to: '/inventory/purchases', label: 'Purchases' },
  { to: '/inventory/suppliers', label: 'Suppliers' },
  { to: '/inventory/wastage', label: 'Wastage' },
  { to: '/inventory/recipes', label: 'Recipes' },
];

export default function InventoryLayout() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex gap-1 overflow-x-auto border-b border-neutral-200 bg-white px-4 pt-2">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                'shrink-0 rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium',
                isActive ? 'border-brand-500 text-brand-600' : 'border-transparent text-neutral-500 hover:text-ink-900'
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <Outlet />
      </div>
    </div>
  );
}
