import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { LayoutGrid, ChefHat, Boxes, LogOut, LayoutDashboard, Bike, ClipboardList } from 'lucide-react';
import { useSessionStore } from '@/stores/session.store';
import { useStaffOutletStore } from '@/stores/staffOutlet.store';
import { OutletApi } from '@/services/domainApi';
import { cn } from '@/utils/cn';
import { GlobalSearch } from '@/components/staff/GlobalSearch';
import { NotificationBell } from '@/components/staff/NotificationBell';

const NAV_ITEMS = [
  { to: '/pos', label: 'POS', icon: LayoutGrid, permission: 'orders.create' },
  { to: '/orders-live', label: 'Current Orders', icon: ClipboardList, permission: 'orders.read' },
  { to: '/kds', label: 'Kitchen Display', icon: ChefHat, permission: 'kds.read' },
  { to: '/inventory', label: 'Inventory', icon: Boxes, permission: 'inventory.read' },
  { to: '/delivery', label: 'Delivery', icon: Bike, permission: 'delivery.read' },
  { to: '/admin', label: 'Admin', icon: LayoutDashboard, permission: 'analytics.read' },
];

export function StaffLayout() {
  const navigate = useNavigate();
  const { accessToken, principalType, displayName, role, outletIds, clearSession, hasPermission } = useSessionStore();
  const { activeOutletId, setActiveOutlet } = useStaffOutletStore();

  const { data: outlets } = useQuery({ queryKey: ['outlets'], queryFn: OutletApi.list, enabled: !!accessToken });
  const myOutlets = outlets?.filter((o) => outletIds.length === 0 || outletIds.includes(o._id)) ?? [];

  useEffect(() => {
    if (!activeOutletId && myOutlets.length > 0) setActiveOutlet(myOutlets[0]._id);
  }, [activeOutletId, myOutlets, setActiveOutlet]);

  useEffect(() => {
    if (!accessToken || principalType !== 'STAFF') navigate('/staff/login', { replace: true });
  }, [accessToken, principalType, navigate]);

  if (!accessToken || principalType !== 'STAFF') return null;

  return (
    <div className="flex h-screen flex-col bg-neutral-100">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-neutral-200 bg-ink-900 px-4 text-white">
        <div className="flex items-center gap-6">
          <span className="font-display text-lg font-bold">HFC Staff</span>
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.filter((item) => hasPermission(item.permission)).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium',
                    isActive ? 'bg-brand-500 text-white' : 'text-neutral-300 hover:bg-white/10'
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="hidden lg:block">
          <GlobalSearch />
        </div>

        <div className="flex items-center gap-3">
          {myOutlets.length > 1 && (
            <select
              value={activeOutletId ?? ''}
              onChange={(e) => setActiveOutlet(e.target.value)}
              className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-sm text-white"
            >
              {myOutlets.map((o) => (
                <option key={o._id} value={o._id} className="text-ink-900">
                  {o.name}
                </option>
              ))}
            </select>
          )}
          <NotificationBell />
          <span className="hidden text-sm text-neutral-300 sm:inline">
            {displayName} · <span className="text-brand-300">{role}</span>
          </span>
          <button
            onClick={() => {
              clearSession();
              navigate('/staff/login');
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10"
            aria-label="Logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <Outlet context={{ activeOutletId }} />
      </main>
    </div>
  );
}
