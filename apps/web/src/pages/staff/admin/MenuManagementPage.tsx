import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Leaf, Flame, ImagePlus, Percent, Ban, CheckCircle2 } from 'lucide-react';
import { MenuAdminApi } from '@/services/staffApi';
import { useStaffOutletStore } from '@/stores/staffOutlet.store';
import { Card, CardContent, Badge, Input, Skeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { extractErrorMessage, resolveImageUrl } from '@/services/apiClient';
import { formatCurrency, cn } from '@/utils/cn';
import { MenuCategory, MenuItem } from '@/types/domain';

interface ItemForm {
  name: string;
  description: string;
  categoryId: string;
  price: string;
  offerPercent: string;
  preparationTimeMinutes: string;
  isVeg: boolean;
  ingredientsText: string; // comma separated in the UI, split into an array on submit
}

const emptyForm: ItemForm = {
  name: '',
  description: '',
  categoryId: '',
  price: '',
  offerPercent: '',
  preparationTimeMinutes: '15',
  isVeg: true,
  ingredientsText: '',
};

type VegFilter = 'ALL' | 'VEG' | 'NONVEG';

export default function MenuManagementPage() {
  const outletId = useStaffOutletStore((s) => s.activeOutletId);
  const queryClient = useQueryClient();
  const { push } = useToast();

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [form, setForm] = useState<ItemForm>(emptyForm);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [vegFilter, setVegFilter] = useState<VegFilter>('ALL');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const { data: categories, isLoading: loadingCategories } = useQuery({
    queryKey: ['admin-menu-categories', outletId],
    queryFn: () => MenuAdminApi.listCategories(outletId as string),
    enabled: !!outletId,
  });

  const { data: items, isLoading: loadingItems } = useQuery({
    queryKey: ['admin-menu-items', outletId],
    queryFn: () => MenuAdminApi.listItems(outletId as string),
    enabled: !!outletId,
  });

  const createCategory = useMutation({
    mutationFn: () => MenuAdminApi.createCategory({ outletId, name: newCategoryName }),
    onSuccess: () => {
      push('Category created', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin-menu-categories', outletId] });
      setNewCategoryName('');
      setCategoryModalOpen(false);
    },
    onError: (err) => push(extractErrorMessage(err), 'error'),
  });

  const createItem = useMutation({
    mutationFn: async () => {
      let imageUrl: string | undefined;
      if (imageFile) {
        const uploaded = await MenuAdminApi.uploadImage(imageFile);
        imageUrl = uploaded.url;
      }
      return MenuAdminApi.createItem({
        outletId,
        categoryId: form.categoryId,
        name: form.name,
        description: form.description || undefined,
        price: Number(form.price),
        offerPercent: form.offerPercent ? Number(form.offerPercent) : 0,
        preparationTimeMinutes: Number(form.preparationTimeMinutes) || 15,
        isVeg: form.isVeg,
        images: imageUrl ? [imageUrl] : [],
        ingredients: form.ingredientsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
    },
    onSuccess: () => {
      push('Menu item added', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin-menu-items', outletId] });
      setForm(emptyForm);
      setImageFile(null);
      setImagePreview(null);
      setItemModalOpen(false);
    },
    onError: (err) => push(extractErrorMessage(err), 'error'),
  });

  const toggleAvailability = useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) => MenuAdminApi.setAvailability(id, isAvailable),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-menu-items', outletId] }),
    onError: (err) => push(extractErrorMessage(err), 'error'),
  });

  const categoryList: MenuCategory[] = categories ?? [];
  const itemList: MenuItem[] = items ?? [];

  const filteredItems = useMemo(() => {
    return itemList.filter((i) => {
      if (activeCategory && i.categoryId !== activeCategory) return false;
      if (vegFilter === 'VEG' && !i.isVeg) return false;
      if (vegFilter === 'NONVEG' && i.isVeg) return false;
      return true;
    });
  }, [itemList, activeCategory, vegFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const item of filteredItems) {
      const list = map.get(item.categoryId) ?? [];
      list.push(item);
      map.set(item.categoryId, list);
    }
    return categoryList
      .map((c) => ({ category: c, items: map.get(c._id) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [filteredItems, categoryList]);

  if (!outletId) {
    return <p className="text-neutral-500">Select an outlet first (top bar) to manage its menu.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900">Menu Management</h1>
          <p className="text-sm text-neutral-500">Add food items with an image, price, ingredients and an optional offer%.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCategoryModalOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Section
          </Button>
          <Button onClick={() => setItemModalOpen(true)} disabled={categoryList.length === 0}>
            <Plus className="mr-1.5 h-4 w-4" /> Add food item
          </Button>
        </div>
      </div>

      {categoryList.length === 0 && !loadingCategories && (
        <Card>
          <CardContent className="text-sm text-neutral-500">
            No sections yet — create one first (e.g. "Starter", "Main Course"), then add food items into it.
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {(['ALL', 'VEG', 'NONVEG'] as VegFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setVegFilter(f)}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium',
              vegFilter === f ? 'border-brand-500 bg-brand-500 text-white' : 'border-neutral-200 text-neutral-600'
            )}
          >
            {f === 'VEG' && <Leaf className="h-3.5 w-3.5" />}
            {f === 'NONVEG' && <Flame className="h-3.5 w-3.5" />}
            {f === 'ALL' ? 'All' : f === 'VEG' ? 'Veg' : 'Non-veg'}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-neutral-200" />
        <button
          onClick={() => setActiveCategory(null)}
          className={cn(
            'shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium',
            !activeCategory ? 'border-ink-900 bg-ink-900 text-white' : 'border-neutral-200 text-neutral-600'
          )}
        >
          All sections
        </button>
        {categoryList.map((c) => (
          <button
            key={c._id}
            onClick={() => setActiveCategory(c._id)}
            className={cn(
              'shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium',
              activeCategory === c._id ? 'border-ink-900 bg-ink-900 text-white' : 'border-neutral-200 text-neutral-600'
            )}
          >
            {c.name}
          </button>
        ))}
      </div>

      {loadingItems && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      )}

      {!loadingItems && grouped.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-neutral-500">No food items match this filter.</CardContent>
        </Card>
      )}

      {grouped.map(({ category, items: catItems }) => (
        <section key={category._id}>
          <h2 className="mb-3 font-display text-lg font-bold text-ink-900">{category.name}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {catItems.map((item) => {
              const finalPrice = item.offerPercent > 0 ? item.price * (1 - item.offerPercent / 100) : item.price;
              return (
                <Card key={item._id} className="flex flex-col overflow-hidden">
                  <div className="relative flex h-32 items-center justify-center overflow-hidden bg-gradient-to-br from-brand-50 to-neutral-100">
                    {item.images?.[0] ? (
                      <img src={resolveImageUrl(item.images[0])} alt={item.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-4xl">🍽️</span>
                    )}
                    {item.offerPercent > 0 && (
                      <Badge variant="warning" className="absolute left-2 top-2">
                        {item.offerPercent}% OFF
                      </Badge>
                    )}
                    <span className="absolute right-2 top-2 rounded-full bg-white/90 p-1">
                      {item.isVeg ? <Leaf className="h-4 w-4 text-emerald-600" /> : <Flame className="h-4 w-4 text-red-500" />}
                    </span>
                  </div>
                  <CardContent className="flex flex-1 flex-col gap-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-ink-900">{item.name}</h3>
                      <Badge variant={item.isAvailable ? 'success' : 'outline'}>{item.isAvailable ? 'Live' : 'Hidden'}</Badge>
                    </div>
                    {item.ingredients?.length > 0 && (
                      <p className="line-clamp-2 text-xs text-neutral-500">Ingredients: {item.ingredients.join(', ')}</p>
                    )}
                    <div className="mt-auto flex items-center justify-between pt-2">
                      <div>
                        {item.offerPercent > 0 && (
                          <span className="mr-1.5 text-xs text-neutral-400 line-through">{formatCurrency(item.price)}</span>
                        )}
                        <span className="font-display font-bold text-ink-900">{formatCurrency(finalPrice)}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleAvailability.mutate({ id: item._id, isAvailable: !item.isAvailable })}
                      >
                        {item.isAvailable ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ))}

      {/* New section (category) modal */}
      <Modal open={categoryModalOpen} onClose={() => setCategoryModalOpen(false)} title="New menu section">
        <div className="space-y-3">
          <Input
            placeholder='e.g. "Starter", "Main Course", "Beverages"'
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
          />
          <Button className="w-full" disabled={!newCategoryName.trim() || createCategory.isPending} onClick={() => createCategory.mutate()}>
            {createCategory.isPending ? 'Creating…' : 'Create section'}
          </Button>
        </div>
      </Modal>

      {/* Add food item modal */}
      <Modal open={itemModalOpen} onClose={() => setItemModalOpen(false)} title="Add food item">
        <div className="space-y-3">
          <label className="flex h-32 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-neutral-300 bg-neutral-50">
            {imagePreview ? (
              <img src={imagePreview} alt="preview" className="h-full w-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-1 text-neutral-400">
                <ImagePlus className="h-6 w-6" />
                <span className="text-xs">Upload food image</span>
              </span>
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setImageFile(file);
                setImagePreview(file ? URL.createObjectURL(file) : null);
              }}
            />
          </label>

          <Input placeholder="Food name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input
            placeholder="Short description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <Input
            placeholder="Major ingredients, comma separated (e.g. Paneer, Capsicum, Onion)"
            value={form.ingredientsText}
            onChange={(e) => setForm({ ...form, ingredientsText: e.target.value })}
          />

          <select
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            className="h-11 w-full rounded-xl border border-neutral-300 px-3 text-sm"
          >
            <option value="">Select section…</option>
            {categoryList.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-3">
            <Input
              type="number"
              placeholder="Price (₹)"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
            <div className="relative">
              <Input
                type="number"
                placeholder="Offer %"
                min={0}
                max={100}
                value={form.offerPercent}
                onChange={(e) => setForm({ ...form, offerPercent: e.target.value })}
                className="pr-8"
              />
              <Percent className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-xl border border-neutral-200 px-3 py-2.5">
            <span className="text-sm text-neutral-500">Type:</span>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="radio" name="veg" checked={form.isVeg} onChange={() => setForm({ ...form, isVeg: true })} />
              <Leaf className="h-4 w-4 text-emerald-600" /> Veg
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="radio" name="veg" checked={!form.isVeg} onChange={() => setForm({ ...form, isVeg: false })} />
              <Flame className="h-4 w-4 text-red-500" /> Non-veg
            </label>
          </div>

          <Button
            className="w-full"
            disabled={!form.name || !form.categoryId || !form.price || createItem.isPending}
            onClick={() => createItem.mutate()}
          >
            {createItem.isPending ? 'Adding…' : 'Add to menu'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
