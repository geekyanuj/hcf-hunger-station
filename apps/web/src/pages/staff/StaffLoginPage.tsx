import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { StaffAuthApi } from '@/services/staffApi';
import { useSessionStore } from '@/stores/session.store';
import { Card, CardContent, Input } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { extractErrorMessage } from '@/services/apiClient';

export default function StaffLoginPage() {
  const navigate = useNavigate();
  const { push } = useToast();
  const setSession = useSessionStore((s) => s.setSession);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const login = useMutation({
    mutationFn: () => StaffAuthApi.login(email, password),
    onSuccess: (data) => {
      setSession(data.accessToken, data.refreshToken, 'STAFF', data.user.name);
      push(`Welcome back, ${data.user.name}`, 'success');
      navigate('/pos');
    },
    onError: (err) => push(extractErrorMessage(err), 'error'),
  });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-900 px-4">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-4">
          <div className="flex flex-col items-center gap-2 py-2">
            <img src="/hcf-logo.jpeg" alt="HCF Hunger Station" className="h-16 w-16 rounded-full object-cover shadow-card" />
            <h1 className="font-display text-lg font-bold text-ink-900">HCF Hunger Station</h1>
            <p className="text-xs text-neutral-400">Staff Login</p>
          </div>
          <Input type="email" placeholder="Work email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && login.mutate()}
          />
          <Button className="w-full" disabled={!email || !password || login.isPending} onClick={() => login.mutate()}>
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
          <p className="text-center text-xs text-neutral-400">Cashiers, kitchen, inventory, and managers sign in here.</p>
        </CardContent>
      </Card>
      <p className="mt-6 text-center text-[11px] text-neutral-500">
        © {new Date().getFullYear()} HCF Hunger Station. All rights reserved to Inertia Automation and Tech.
      </p>
    </div>
  );
}
