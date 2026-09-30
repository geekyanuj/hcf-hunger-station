import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, MapPin, Trash2 } from 'lucide-react';
import { CustomerApi } from '@/services/domainApi';
import { extractErrorMessage } from '@/services/apiClient';
import { useSessionStore } from '@/stores/session.store';
import { Input } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { Address, CustomerProfile } from '@/types/domain';
import { CUSTOMER_PROFILE_KEY } from '@/hooks/useDeliveryReadiness';

interface FormState {
  name: string;
  email: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
}

const DEFAULT_CITY = 'Dhanbad';
const DEFAULT_STATE = 'Jharkhand';

function fromProfile(profile: CustomerProfile, address?: Address): FormState {
  return {
    name: profile.name ?? '',
    email: profile.email ?? '',
    line1: address?.line1 ?? '',
    line2: address?.line2 ?? '',
    city: address?.city ?? DEFAULT_CITY,
    state: address?.state ?? DEFAULT_STATE,
    pincode: address?.pincode ?? '',
  };
}

function validate(f: FormState): Partial<Record<keyof FormState, string>> {
  const e: Partial<Record<keyof FormState, string>> = {};
  if (f.name.trim().length < 2) e.name = 'Enter your full name';
  if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = 'Enter a valid email or leave it blank';
  if (f.line1.trim().length < 3) e.line1 = 'Enter your house / street address';
  if (f.city.trim().length < 2) e.city = 'Enter your city';
  if (f.state.trim().length < 2) e.state = 'Enter your state';
  if (!/^\d{6}$/.test(f.pincode.trim())) e.pincode = 'Enter a valid 6-digit pincode';
  return e;
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-neutral-600">{label}</span>
      {children}
      {error && <span className="block text-xs text-red-600">{error}</span>}
    </label>
  );
}

/**
 * Name + delivery address form, shared by the delivery gate (/delivery-details) and the account page.
 * Lists saved addresses so one can be picked/edited/removed, or a new one added.
 */
export function DeliveryDetailsForm({
  profile,
  submitLabel = 'Save & continue',
  onSaved,
}: {
  profile: CustomerProfile;
  submitLabel?: string;
  onSaved?: (profile: CustomerProfile) => void;
}) {
  const { push } = useToast();
  const queryClient = useQueryClient();
  const setSession = useSessionStore((s) => s.setSession);

  const defaultAddress = profile.addresses.find((a) => a.isDefault) ?? profile.addresses[0];
  // `null` = "add a new address"; otherwise the id of the saved address being edited.
  const [editingId, setEditingId] = useState<string | null>(defaultAddress?._id ?? null);
  const [form, setForm] = useState<FormState>(() => fromProfile(profile, defaultAddress));
  const [touched, setTouched] = useState(false);

  // Keep the form in sync if the profile is refreshed underneath us (e.g. after a delete).
  useEffect(() => {
    const current = profile.addresses.find((a) => a._id === editingId);
    if (editingId && !current) {
      const next = profile.addresses.find((a) => a.isDefault) ?? profile.addresses[0];
      setEditingId(next?._id ?? null);
      setForm(fromProfile(profile, next));
    }
  }, [profile, editingId]);

  const errors = validate(form);
  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: key === 'pincode' ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value }));

  function refreshSession(updated: CustomerProfile) {
    const { accessToken, refreshToken } = useSessionStore.getState();
    if (accessToken && refreshToken) setSession(accessToken, refreshToken, 'CUSTOMER', updated.name);
  }

  const save = useMutation({
    mutationFn: () =>
      CustomerApi.saveDeliveryDetails({
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        addressId: editingId ?? undefined,
        address: { line1: form.line1.trim(), line2: form.line2.trim() || undefined, city: form.city.trim(), state: form.state.trim(), pincode: form.pincode.trim() },
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(CUSTOMER_PROFILE_KEY, updated);
      refreshSession(updated);
      push('Details saved', 'success');
      onSaved?.(updated);
    },
    onError: (err) => push(extractErrorMessage(err), 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => CustomerApi.removeAddress(id),
    onSuccess: (updated) => {
      queryClient.setQueryData(CUSTOMER_PROFILE_KEY, updated);
      push('Address removed', 'success');
    },
    onError: (err) => push(extractErrorMessage(err), 'error'),
  });

  function pick(address?: Address) {
    setEditingId(address?._id ?? null);
    setForm((f) => ({ ...fromProfile(profile, address), name: f.name, email: f.email }));
    setTouched(false);
  }

  function submit() {
    setTouched(true);
    if (Object.keys(errors).length > 0) return;
    save.mutate();
  }

  const show = (k: keyof FormState) => (touched ? errors[k] : undefined);

  return (
    <div className="space-y-4">
      {profile.addresses.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Saved addresses</p>
          {profile.addresses.map((a) => (
            <div
              key={a._id}
              className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${editingId === a._id ? 'border-brand-500 bg-brand-50' : 'border-neutral-200'}`}
            >
              <button type="button" onClick={() => pick(a)} className="flex flex-1 items-start gap-2 text-left">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                <span>
                  <span className="block font-semibold text-ink-900">
                    {a.label} {a.isDefault && <span className="ml-1 text-xs font-medium text-emerald-600">Default</span>}
                  </span>
                  <span className="block text-neutral-600">
                    {[a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', ')}
                  </span>
                </span>
              </button>
              {profile.addresses.length > 1 && (
                <button
                  type="button"
                  onClick={() => a._id && remove.mutate(a._id)}
                  className="text-neutral-400 hover:text-red-500"
                  aria-label="Remove address"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => pick(undefined)} disabled={editingId === null}>
            + Add a new address
          </Button>
        </div>
      )}

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {editingId === null && profile.addresses.length > 0 ? 'New address' : 'Your details'}
        </p>
        <Field label="Full name" error={show('name')}>
          <Input value={form.name} onChange={set('name')} placeholder="Full name" autoComplete="name" />
        </Field>
        <Field label="Mobile number">
          <Input value={profile.mobile} disabled readOnly />
        </Field>
        <Field label="Email (optional)" error={show('email')}>
          <Input value={form.email} onChange={set('email')} placeholder="you@example.com" type="email" autoComplete="email" />
        </Field>
        <Field label="House / street address" error={show('line1')}>
          <Input value={form.line1} onChange={set('line1')} placeholder="House no., street, landmark" autoComplete="address-line1" />
        </Field>
        <Field label="Area / locality (optional)">
          <Input value={form.line2} onChange={set('line2')} placeholder="e.g. Azadnagar" autoComplete="address-line2" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="City" error={show('city')}>
            <Input value={form.city} onChange={set('city')} autoComplete="address-level2" />
          </Field>
          <Field label="State" error={show('state')}>
            <Input value={form.state} onChange={set('state')} autoComplete="address-level1" />
          </Field>
        </div>
        <Field label="Pincode" error={show('pincode')}>
          <Input value={form.pincode} onChange={set('pincode')} inputMode="numeric" placeholder="6-digit pincode" autoComplete="postal-code" />
        </Field>
      </div>

      <Button className="w-full" onClick={submit} disabled={save.isPending}>
        {save.isPending ? 'Saving…' : (<><CheckCircle2 className="h-4 w-4" /> {submitLabel}</>)}
      </Button>
    </div>
  );
}
