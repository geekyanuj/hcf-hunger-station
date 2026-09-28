import { Link, useNavigate } from 'react-router-dom';
import { ShoppingBag, User } from 'lucide-react';
import { useCartStore } from '@/stores/cart.store';

export function Header() {
  const navigate = useNavigate();
  const itemCount = useCartStore((s) => s.itemCount());

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <img src="/hcf-logo.jpeg" alt="HCF Hunger Station" className="h-10 w-10 rounded-full object-cover" />
          <span className="flex flex-col leading-tight">
            <span className="font-display text-lg font-extrabold tracking-tight text-brand-600">HCF</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Hunger Station</span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/account')}
            className="hidden h-10 w-10 items-center justify-center rounded-full border border-neutral-200 hover:bg-neutral-50 sm:flex"
            aria-label="Account"
          >
            <User className="h-5 w-5 text-ink-900" />
          </button>
          <button
            onClick={() => navigate('/cart')}
            className="relative flex h-10 items-center gap-2 rounded-full bg-ink-900 px-4 text-sm font-semibold text-white hover:bg-ink-800"
          >
            <ShoppingBag className="h-4 w-4" />
            <span className="hidden sm:inline">Cart</span>
            {itemCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-[11px] font-bold text-white">
                {itemCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
