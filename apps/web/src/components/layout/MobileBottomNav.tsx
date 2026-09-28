import { NavLink } from 'react-router-dom';
import { Home, ShoppingBag, ClipboardList, User } from 'lucide-react';
import { cn } from '@/utils/cn';

const items = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/cart', label: 'Cart', icon: ShoppingBag },
  { to: '/orders', label: 'Orders', icon: ClipboardList },
  { to: '/account', label: 'Account', icon: User },
];

export function MobileBottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 backdrop-blur sm:hidden">
      <div className="flex h-16 items-center justify-around">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn('flex flex-col items-center gap-1 text-xs font-medium', isActive ? 'text-brand-600' : 'text-neutral-400')
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
