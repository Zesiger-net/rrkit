'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useStatus } from '@/lib/queries';
import { Button, Card, Field, Input } from '@/components/ui';
import { FullScreenLoader } from '@/components/loader';

export default function LoginPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: status } = useStatus();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!status) return;
    if (!status.setupComplete) router.replace('/setup');
    else if (status.authed) router.replace('/sessions');
  }, [status, router]);

  if (!status || !status.setupComplete || status.authed) return <FullScreenLoader />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/auth/login', { password });
      await qc.invalidateQueries({ queryKey: ['status'] });
      router.replace('/sessions');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-brand text-lg font-bold text-brand-fg">
            r
          </div>
          <h1 className="text-lg font-semibold">Welcome back</h1>
          <p className="mt-1 text-sm text-gray-500">Enter your admin password to continue.</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Admin password" error={error ?? undefined}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
            />
          </Field>
          <Button type="submit" className="w-full" loading={loading}>
            Log in
          </Button>
        </form>
      </Card>
    </div>
  );
}
