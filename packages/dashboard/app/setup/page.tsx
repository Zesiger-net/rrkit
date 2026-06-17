'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Check, Database, KeyRound, Tags } from 'lucide-react';
import type { MetadataFieldInput, SetupStatusResponse } from '@rrkit/shared';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Button, Card, Field, Input } from '@/components/ui';
import { FullScreenLoader } from '@/components/loader';
import { StorageFields, emptyStorage, type StorageValue } from '@/components/storage-fields';
import { MetadataEditor } from '@/components/metadata-editor';
import { Logo } from '@/components/logo';

type Step = 'password' | 'storage' | 'metadata';
const STEPS: { key: Step; label: string; icon: typeof KeyRound }[] = [
  { key: 'password', label: 'Admin password', icon: KeyRound },
  { key: 'storage', label: 'S3 storage', icon: Database },
  { key: 'metadata', label: 'Session metadata', icon: Tags },
];

export default function SetupPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: setup } = useQuery({
    queryKey: ['setup-status'],
    queryFn: () => api.get<SetupStatusResponse>('/setup/status'),
  });

  const [step, setStep] = useState<Step>('password');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [storage, setStorage] = useState<StorageValue>(emptyStorage);
  const [fields, setFields] = useState<MetadataFieldInput[]>([
    { key: 'user_id', label: 'User ID', type: 'string', filterable: true },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resumed, setResumed] = useState(false);

  useEffect(() => {
    if (!setup || resumed) return;
    if (setup.complete) {
      router.replace('/login');
      return;
    }
    if (!setup.passwordSet) setStep('password');
    else if (!setup.s3Verified) setStep('storage');
    else setStep('metadata');
    setResumed(true);
  }, [setup, resumed, router]);

  if (!setup) return <FullScreenLoader />;

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setLoading(true);
    try {
      await api.post('/setup/password', { password });
      setStep('storage');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to set password');
    } finally {
      setLoading(false);
    }
  };

  const submitStorage = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/setup/s3', storage);
      setStep('metadata');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not connect to S3');
    } finally {
      setLoading(false);
    }
  };

  const finish = async () => {
    setError(null);
    const keys = fields.map((f) => f.key.trim());
    if (keys.some((k) => !k)) return setError('Every field needs a key.');
    if (new Set(keys).size !== keys.length) return setError('Field keys must be unique.');
    setLoading(true);
    try {
      await api.post('/setup/metadata', { fields });
      await api.post('/setup/complete');
      // Auto log in with the password we just set, then go to the dashboard.
      if (password) {
        await api.post('/auth/login', { password }).catch(() => {});
      }
      await qc.invalidateQueries({ queryKey: ['status'] });
      router.replace(password ? '/sessions' : '/login');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not finish setup');
      setLoading(false);
    }
  };

  const activeIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <Logo className="mb-8 text-4xl" />
      <div className="grid w-full max-w-3xl gap-6 md:grid-cols-[200px_1fr]">
        {/* progress rail */}
        <div className="hidden md:block">
          <ol className="space-y-1">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done = i < activeIndex;
              const current = i === activeIndex;
              return (
                <li
                  key={s.key}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
                    current ? 'bg-brand-muted font-medium text-brand' : 'text-gray-500',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full text-xs',
                      done ? 'bg-green-500 text-white' : current ? 'bg-brand text-white' : 'bg-gray-200',
                    )}
                  >
                    {done ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  {s.label}
                </li>
              );
            })}
          </ol>
        </div>

        {/* step card */}
        <Card className="p-8">
          {step === 'password' && (
            <form onSubmit={submitPassword} className="space-y-5">
              <Header
                title="Create your admin password"
                description="rrkit has a single admin account that protects this dashboard. You can change it later in Settings."
              />
              <Field label="Password">
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
              </Field>
              <Field label="Confirm password" error={error ?? undefined}>
                <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </Field>
              <Button type="submit" loading={loading}>
                Continue
              </Button>
            </form>
          )}

          {step === 'storage' && (
            <form onSubmit={submitStorage} className="space-y-5">
              <Header
                title="Connect your S3 bucket"
                description="Session recordings are stored as objects in your own S3 bucket. Credentials are saved on the server and never sent to the browser. We'll verify them before continuing."
              />
              <StorageFields value={storage} onChange={setStorage} />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" loading={loading}>
                Test connection & continue
              </Button>
            </form>
          )}

          {step === 'metadata' && (
            <div className="space-y-5">
              <Header
                title="Define session metadata"
                description="Choose the fields your app will attach to sessions via the SDK (rrkit.identify / rrkit.setMetadata). Filterable fields can be used to search sessions. You can change these anytime."
              />
              <MetadataEditor value={fields} onChange={setFields} />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button onClick={finish} loading={loading}>
                Finish setup
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Header({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-1 text-sm leading-relaxed text-gray-500">{description}</p>
    </div>
  );
}
