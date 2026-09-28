import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Calculator } from 'lucide-react';
import { useStaffOutletStore } from '@/stores/staffOutlet.store';
import { RecipeApi, InventoryApi, MenuAdminApi } from '@/services/staffApi';
import { Card, CardContent, Input } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { extractErrorMessage } from '@/services/apiClient';
import { formatCurrency } from '@/utils/cn';

const UNITS = ['kg', 'g', 'litre', 'ml', 'piece', 'packet', 'box'];

interface IngredientLine {
  inventoryItemId: string;
  name: string;
  quantity: number;
  unit: string;
}

export default function RecipesPage() {
  const { activeOutletId } = useStaffOutletStore();
  const [editingMenuItemId, setEditingMenuItemId] = useState<string | null>(null);
  const [costMenuItemId, setCostMenuItemId] = useState<string | null>(null);

  const { data: recipes } = useQuery({
    queryKey: ['recipes', activeOutletId],
    queryFn: () => RecipeApi.list(activeOutletId as string),
    enabled: !!activeOutletId,
  });
  const { data: menuItems } = useQuery({
    queryKey: ['menu-items-admin', activeOutletId],
    queryFn: () => MenuAdminApi.listItems(activeOutletId as string),
    enabled: !!activeOutletId,
  });

  const recipeByMenuItem = new Map((recipes ?? []).map((r: { menuItemId: { _id: string } }) => [r.menuItemId._id, r]));

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-100 text-left text-xs uppercase text-neutral-400">
              <tr>
                <th className="p-3">Menu item</th>
                <th className="p-3">Price</th>
                <th className="p-3">Recipe</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {menuItems?.map((item: { _id: string; name: string; price: number; discountPrice?: number }) => {
                const recipe = recipeByMenuItem.get(item._id) as { ingredients: unknown[] } | undefined;
                return (
                  <tr key={item._id} className="border-b border-neutral-50">
                    <td className="p-3 font-medium text-ink-900">{item.name}</td>
                    <td className="p-3">{formatCurrency(item.discountPrice ?? item.price)}</td>
                    <td className="p-3 text-neutral-500">{recipe ? `${recipe.ingredients.length} ingredients` : 'No recipe yet'}</td>
                    <td className="p-3 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditingMenuItemId(item._id)}>
                        {recipe ? 'Edit recipe' : 'Add recipe'}
                      </Button>
                      {recipe && (
                        <Button size="sm" variant="ghost" onClick={() => setCostMenuItemId(item._id)}>
                          <Calculator className="mr-1 h-3.5 w-3.5" /> Cost
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {editingMenuItemId && (
        <RecipeEditorModal
          menuItemId={editingMenuItemId}
          outletId={activeOutletId as string}
          existing={recipeByMenuItem.get(editingMenuItemId) as { ingredients: { inventoryItemId: { _id: string; name: string; unit: string }; quantity: number; unit: string }[]; yieldServings: number } | undefined}
          onClose={() => setEditingMenuItemId(null)}
        />
      )}
      {costMenuItemId && <CostModal menuItemId={costMenuItemId} outletId={activeOutletId as string} onClose={() => setCostMenuItemId(null)} />}
    </div>
  );
}

function RecipeEditorModal({
  menuItemId,
  outletId,
  existing,
  onClose,
}: {
  menuItemId: string;
  outletId: string;
  existing?: { ingredients: { inventoryItemId: { _id: string; name: string; unit: string }; quantity: number; unit: string }[]; yieldServings: number };
  onClose: () => void;
}) {
  const { push } = useToast();
  const queryClient = useQueryClient();
  const [ingredients, setIngredients] = useState<IngredientLine[]>(
    existing?.ingredients.map((i) => ({ inventoryItemId: i.inventoryItemId._id, name: i.inventoryItemId.name, quantity: i.quantity, unit: i.unit })) ?? []
  );
  const [selectedItemId, setSelectedItemId] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [unit, setUnit] = useState('piece');
  const [yieldServings, setYieldServings] = useState(existing?.yieldServings ?? 1);

  const { data: itemsResp } = useQuery({ queryKey: ['inventory-items-all', outletId], queryFn: () => InventoryApi.list(outletId, { limit: 200 }) });
  const items = itemsResp?.data ?? [];

  const save = useMutation({
    mutationFn: () =>
      RecipeApi.upsert({
        outletId,
        menuItemId,
        yieldServings,
        ingredients: ingredients.map((i) => ({ inventoryItemId: i.inventoryItemId, quantity: i.quantity, unit: i.unit })),
      }),
    onSuccess: () => {
      push('Recipe saved', 'success');
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      onClose();
    },
    onError: (err) => push(extractErrorMessage(err), 'error'),
  });

  function addIngredient() {
    const item = items.find((i: { _id: string; name: string }) => i._id === selectedItemId);
    if (!item || quantity <= 0) return;
    setIngredients((prev) => [...prev, { inventoryItemId: item._id, name: item.name, quantity, unit }]);
    setSelectedItemId('');
    setQuantity(0);
  }

  return (
    <Modal open onClose={onClose} title="Recipe (BOM)">
      <div className="space-y-3">
        <Input type="number" placeholder="Yield (servings)" value={yieldServings} onChange={(e) => setYieldServings(Number(e.target.value) || 1)} />

        <div className="flex items-end gap-2">
          <select value={selectedItemId} onChange={(e) => setSelectedItemId(e.target.value)} className="h-11 flex-1 rounded-xl border border-neutral-300 px-3 text-sm">
            <option value="">Ingredient</option>
            {items.map((i: { _id: string; name: string }) => <option key={i._id} value={i._id}>{i.name}</option>)}
          </select>
          <Input type="number" placeholder="Qty" className="w-20" value={quantity || ''} onChange={(e) => setQuantity(Number(e.target.value))} />
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className="h-11 w-24 rounded-xl border border-neutral-300 px-2 text-sm">
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <Button variant="outline" onClick={addIngredient}>Add</Button>
        </div>

        <div className="space-y-1">
          {ingredients.map((ing, idx) => (
            <div key={idx} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-1.5 text-sm">
              <span>{ing.name} — {ing.quantity} {ing.unit}</span>
              <button onClick={() => setIngredients((prev) => prev.filter((_, i) => i !== idx))}>
                <X className="h-3.5 w-3.5 text-neutral-400" />
              </button>
            </div>
          ))}
          {ingredients.length === 0 && <p className="text-sm text-neutral-400">No ingredients added yet.</p>}
        </div>

        <Button className="w-full" disabled={ingredients.length === 0 || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : 'Save recipe'}
        </Button>
      </div>
    </Modal>
  );
}

function CostModal({ menuItemId, outletId, onClose }: { menuItemId: string; outletId: string; onClose: () => void }) {
  const { data } = useQuery({ queryKey: ['recipe-cost', outletId, menuItemId], queryFn: () => RecipeApi.cost(outletId, menuItemId) });

  return (
    <Modal open onClose={onClose} title="Cost & Margin">
      {!data && <p className="text-sm text-neutral-500">Calculating…</p>}
      {data && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl bg-neutral-50 p-3">
              <p className="text-xs text-neutral-500">Ingredient cost</p>
              <p className="font-display text-lg font-bold text-ink-900">{formatCurrency(data.ingredientCost)}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3">
              <p className="text-xs text-emerald-600">Gross margin</p>
              <p className="font-display text-lg font-bold text-emerald-700">{data.grossMarginPercent}%</p>
            </div>
          </div>
          <div className="space-y-1 text-sm">
            {data.ingredients.map((ing: { name: string; quantity: number; unit: string; cost: number }, i: number) => (
              <div key={i} className="flex justify-between text-neutral-600">
                <span>{ing.name} ({ing.quantity}{ing.unit})</span>
                <span>{formatCurrency(ing.cost)}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-neutral-400">Selling price {formatCurrency(data.sellingPrice)} − ingredient cost = {formatCurrency(data.grossMarginAmount)} margin.</p>
        </div>
      )}
    </Modal>
  );
}
