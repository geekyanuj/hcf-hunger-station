import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/primitives';
import { MenuItem } from '@/types/domain';
import { formatCurrency } from '@/utils/cn';
import { useCartStore } from '@/stores/cart.store';
import { useToast } from '@/components/ui/Toast';
import { Minus, Plus } from 'lucide-react';

export function AddToCartModal({ item, onClose }: { item: MenuItem | null; onClose: () => void }) {
  const addLine = useCartStore((s) => s.addLine);
  const { push } = useToast();
  const [quantity, setQuantity] = useState(1);
  const [selected, setSelected] = useState<Record<string, string[]>>({}); // modifierId -> optionIds
  const [notes, setNotes] = useState('');

  const modifiers = item?.modifierIds ?? [];

  const unitPrice = useMemo(() => {
    if (!item) return 0;
    const base = item.discountPrice ?? item.price;
    const modifierTotal = modifiers.reduce((sum, mod) => {
      const chosen = selected[mod._id] ?? [];
      return sum + mod.options.filter((o) => chosen.includes(o._id)).reduce((s, o) => s + o.priceDelta, 0);
    }, 0);
    return base + modifierTotal;
  }, [item, modifiers, selected]);

  function toggleOption(modifierId: string, optionId: string, selectionType: 'SINGLE' | 'MULTIPLE') {
    setSelected((prev) => {
      const current = prev[modifierId] ?? [];
      if (selectionType === 'SINGLE') return { ...prev, [modifierId]: [optionId] };
      const next = current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId];
      return { ...prev, [modifierId]: next };
    });
  }

  function reset() {
    setQuantity(1);
    setSelected({});
    setNotes('');
  }

  function handleAdd() {
    if (!item) return;
    for (const mod of modifiers) {
      if (mod.isRequired && (selected[mod._id] ?? []).length === 0) {
        push(`Please select an option for "${mod.name}"`, 'error');
        return;
      }
    }
    const selectedOptionIds = Object.values(selected).flat();
    const labels = modifiers
      .flatMap((mod) => mod.options.filter((o) => (selected[mod._id] ?? []).includes(o._id)).map((o) => o.name))
      .join(', ');

    addLine({
      menuItemId: item._id,
      name: item.name,
      unitPrice,
      quantity,
      selectedOptionIds,
      selectedOptionLabels: labels ? [labels] : [],
      notes: notes || undefined,
    });
    push(`${item.name} added to cart`, 'success');
    reset();
    onClose();
  }

  return (
    <Modal open={!!item} onClose={() => { reset(); onClose(); }} title={item?.name}>
      {item && (
        <div className="space-y-5">
          <p className="text-sm text-neutral-500">{item.description}</p>

          {modifiers.map((mod) => (
            <div key={mod._id}>
              <div className="mb-2 flex items-center gap-2">
                <h4 className="text-sm font-semibold text-ink-900">{mod.name}</h4>
                {mod.isRequired && <Badge variant="warning">Required</Badge>}
              </div>
              <div className="space-y-2">
                {mod.options.map((option) => {
                  const checked = (selected[mod._id] ?? []).includes(option._id);
                  return (
                    <label
                      key={option._id}
                      className="flex cursor-pointer items-center justify-between rounded-xl border border-neutral-200 px-3 py-2.5 text-sm hover:border-brand-300"
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type={mod.selectionType === 'SINGLE' ? 'radio' : 'checkbox'}
                          name={mod._id}
                          checked={checked}
                          onChange={() => toggleOption(mod._id, option._id, mod.selectionType)}
                          className="accent-brand-500"
                        />
                        {option.name}
                      </span>
                      {option.priceDelta > 0 && <span className="text-neutral-500">+{formatCurrency(option.priceDelta)}</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}

          <div>
            <h4 className="mb-2 text-sm font-semibold text-ink-900">Special instructions</h4>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. no onions"
              maxLength={300}
              className="h-20 w-full resize-none rounded-xl border border-neutral-300 p-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div className="flex items-center justify-between border-t border-neutral-100 pt-4">
            <div className="flex items-center gap-3 rounded-full border border-neutral-200 px-2 py-1">
              <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="rounded-full p-1.5 hover:bg-neutral-100">
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-5 text-center text-sm font-semibold">{quantity}</span>
              <button onClick={() => setQuantity((q) => q + 1)} className="rounded-full p-1.5 hover:bg-neutral-100">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <Button onClick={handleAdd}>Add {formatCurrency(unitPrice * quantity)}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
