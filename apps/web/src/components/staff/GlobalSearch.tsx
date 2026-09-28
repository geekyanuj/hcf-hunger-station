import { useState } from 'react';
import { DASHBOARD_STATUS_LABEL } from '@/utils/orderStatus';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { SearchApi } from '@/services/staffApi';
import { useStaffOutletStore } from '@/stores/staffOutlet.store';

export function GlobalSearch() {
  const { activeOutletId } = useStaffOutletStore();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ['global-search', query, activeOutletId],
    queryFn: () => SearchApi.search(query, activeOutletId ?? undefined),
    enabled: query.trim().length >= 2,
  });

  const sections = data ? Object.entries(data).filter(([, items]) => Array.isArray(items) && items.length > 0) : [];

  return (
    <div className="relative w-64">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search orders, customers, inventory…"
        className="h-9 w-full rounded-lg border border-white/20 bg-white/10 pl-9 pr-8 text-sm text-white placeholder:text-neutral-400"
      />
      {query && (
        <button onClick={() => { setQuery(''); setOpen(false); }} className="absolute right-2 top-1/2 -translate-y-1/2">
          <X className="h-4 w-4 text-neutral-400" />
        </button>
      )}

      {open && query.trim().length >= 2 && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-11 z-50 max-h-96 w-96 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-2 text-ink-900 shadow-floating">
            {sections.length === 0 && <p className="p-3 text-sm text-neutral-400">No results found.</p>}
            {sections.map(([section, items]) => (
              <div key={section} className="mb-2">
                <p className="px-2 py-1 text-xs font-semibold uppercase text-neutral-400">{section}</p>
                {(items as Record<string, unknown>[]).map((item, i) => (
                  <div key={i} className="rounded-lg px-2 py-1.5 text-sm hover:bg-neutral-50">
                    {JSON.stringify(item).slice(0, 0)}
                    {renderResult(section, item)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function renderResult(section: string, item: Record<string, unknown>): string {
  switch (section) {
    case 'orders':
      return `${item.orderNumber} · ${item.tokenNumber} · ${DASHBOARD_STATUS_LABEL[item.orderStatus as keyof typeof DASHBOARD_STATUS_LABEL] ?? item.orderStatus}`;
    case 'customers':
      return `${item.name} · ${item.mobile}`;
    case 'menuItems':
      return `${item.name}`;
    case 'inventoryItems':
      return `${item.name} (${item.currentStock} ${item.unit})`;
    case 'suppliers':
      return `${item.name} · ${item.phone}`;
    case 'staff':
      return `${item.name} · ${item.role}`;
    case 'partyOrders':
      return `${item.contactName} · ${item.eventType}`;
    default:
      return String(item.name ?? '');
  }
}
