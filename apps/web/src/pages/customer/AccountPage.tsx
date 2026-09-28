import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AuthApi } from '@/services/domainApi';
import { useSessionStore } from '@/stores/session.store';
import { Card, CardContent, Input } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { extractErrorMessage } from '@/services/apiClient';
import { LogOut } from 'lucide-react';
interface LoginForm {
  name: string;
  mobile: string;
  email: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
}

const emptyForm: LoginForm = { name: '', mobile: '', email: '', line1: '', city: '', state: '', pincode: '' };

export default function AccountPage() {
  const { push } = useToast();
  const { accessToken, displayName, principalType, clearSession, setSession } = useSessionStore();
  const [form, setForm] = useState<LoginForm>(emptyForm);

  const login = useMutation({
    mutationFn: () =>
      AuthApi.customerLogin({
        name: form.name,
        mobile: form.mobile,
        email: form.email || undefined,
        address: form.line1 ? { line1: form.line1, city: form.city, state: form.state, pincode: form.pincode } : undefined,
      }),
    onSuccess: (data) => {
      setSession(data.accessToken, data.refreshToken, 'CUSTOMER', data.customer.name);
      push('Logged in successfully', 'success');
    },
    onError: (err) => push(extractErrorMessage(err), 'error'),
  });

  if (accessToken && principalType === 'CUSTOMER') {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-neutral-500">Signed in as</p>
              <p className="font-display text-lg font-bold text-ink-900">{displayName}</p>
            </div>
            <Button variant="outline" size="sm" onClick={clearSession}>
              <LogOut className="mr-1.5 h-4 w-4" /> Logout
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canSubmit = form.name.trim().length >= 2 && form.mobile.length === 10;

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardContent className="space-y-3">
          <div className="flex flex-col items-center gap-2 py-1 text-center">
            <img src="/hcf-logo.jpeg" alt="HCF Hunger Station" className="h-16 w-16 rounded-full object-cover shadow-card" />
            <h1 className="font-display text-lg font-bold text-ink-900">HCF Hunger Station</h1>
            <p className="text-xs italic text-neutral-400">Good Food, Happier People</p>
          </div>
          <p className="text-xs text-neutral-500">
            Just enter your details below — no OTP needed. If this is your first time, an account is created for you
            automatically.
          </p>

          <Input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input
            placeholder="10-digit mobile number"
            value={form.mobile}
            maxLength={10}
            onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, '') })}
          />
          <Input
            placeholder="Email (optional)"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />

          <div className="pt-1">
            <p className="mb-1.5 text-xs font-semibold text-neutral-500">Delivery address (optional)</p>
            <div className="space-y-2">
              <Input
                placeholder="House / street address"
                value={form.line1}
                onChange={(e) => setForm({ ...form, line1: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                <Input placeholder="State" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
              </div>
              <Input placeholder="Pincode" value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} />
            </div>
          </div>

          <Button className="w-full" disabled={!canSubmit || login.isPending} onClick={() => login.mutate()}>
            {login.isPending ? 'Logging in…' : 'Continue'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
