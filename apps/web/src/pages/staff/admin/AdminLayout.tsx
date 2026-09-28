import { NavLink, Outlet } from 'react-router-dom';
import { useSessionStore } from '@/stores/session.store';
import { cn } from '@/utils/cn';

const TABS = [
  { to: '/admin', label: 'Dashboard', end: true, permission: 'analytics.read' },
  { to: '/admin/menu', label: 'Menu', permission: 'menu.manage' },
  { to: '/admin/analytics', label: 'Analytics', permission: 'analytics.read' },
  { to: '/admin/coupons', label: 'Coupons', permission: 'coupons.manage' },
  { to: '/admin/loyalty', label: 'Loyalty', permission: 'loyalty.manage' },
  { to: '/admin/party-orders', label: 'Party Orders', permission: 'party.manage' },
  { to: '/admin/staff', label: 'Staff', permission: 'users.manage' },
  { to: '/admin/outlet-settings', label: 'Outlet Settings', permission: 'outlets.manage' },
  { to: '/admin/tables', label: 'Tables', permission: 'tables.manage' },
];

export default function AdminLayout() {
  const hasPermission = useSessionStore((s) => s.hasPermission);
  const visibleTabs = TABS.filter((t) => hasPermission(t.permission));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex gap-1 overflow-x-auto border-b border-neutral-200 bg-white px-4 pt-2">
        {visibleTabs.map((tab) => (
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
