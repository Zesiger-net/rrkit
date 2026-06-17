'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { Features, Privacy, Retention, MetadataFieldInput } from '@rrkit/shared';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useIntegration, useMetadataFields } from '@/lib/queries';
import {
  Button,
  Card,
  CodeBlock,
  Field,
  Input,
  PageHeader,
  Spinner,
  Switch,
} from '@/components/ui';
import { useToast } from '@/components/toast';
import { StorageFields, emptyStorage, type StorageValue } from '@/components/storage-fields';
import { MetadataEditor } from '@/components/metadata-editor';

type Tab = 'general' | 'storage' | 'capture' | 'metadata' | 'integration';
const TABS: { key: Tab; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'storage', label: 'Storage' },
  { key: 'capture', label: 'Capture' },
  { key: 'metadata', label: 'Metadata' },
  { key: 'integration', label: 'Integration' },
];

export default function SettingsView() {
  const [tab, setTab] = useState<Tab>('general');
  return (
    <div>
      <PageHeader title="Settings" description="Configure rrkit. Changes apply immediately." />
      <div className="grid gap-6 md:grid-cols-[180px_1fr]">
        <nav className="flex gap-1 overflow-x-auto md:flex-col">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'rounded-lg px-3 py-2 text-left text-sm font-medium transition',
                tab === t.key ? 'bg-brand-muted text-brand' : 'text-gray-600 hover:bg-gray-100',
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div>
          {tab === 'general' && <GeneralPanel />}
          {tab === 'storage' && <StoragePanel />}
          {tab === 'capture' && <CapturePanel />}
          {tab === 'metadata' && <MetadataPanel />}
          {tab === 'integration' && <IntegrationPanel />}
        </div>
      </div>
    </div>
  );
}

function PanelCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      <div className="mt-5">{children}</div>
    </Card>
  );
}

/* ---- General: change password ---- */
function GeneralPanel() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < 8) return setError('New password must be at least 8 characters.');
    if (next !== confirm) return setError('Passwords do not match.');
    setLoading(true);
    try {
      await api.post('/auth/change-password', { currentPassword: current, newPassword: next });
      toast('success', 'Password updated');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PanelCard title="Admin password" description="Change the password used to access this dashboard.">
      <form onSubmit={save} className="max-w-sm space-y-4">
        <Field label="Current password">
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password">
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Confirm new password" error={error ?? undefined}>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Button type="submit" loading={loading}>
          Update password
        </Button>
      </form>
    </PanelCard>
  );
}

/* ---- Storage ---- */
interface StorageGet extends Omit<StorageValue, 'secretAccessKey'> {
  secretSet: boolean;
}

function StoragePanel() {
  const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ['settings-storage'],
    queryFn: () => api.get<StorageGet>('/settings/storage'),
  });
  const [value, setValue] = useState<StorageValue>(emptyStorage);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (data) setValue({ ...data, secretAccessKey: '' });
  }, [data]);

  if (isLoading) return <Spinner />;

  const test = async () => {
    setTesting(true);
    setMsg(null);
    try {
      const res = await api.post<{ ok: boolean; detail: string }>('/settings/storage/test', value);
      setMsg({ ok: res.ok, text: res.detail });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : 'Connection failed' });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await api.put<{ ok: boolean; detail: string }>('/settings/storage', value);
      setMsg({ ok: res.ok, text: 'Saved and verified.' });
      toast('success', 'Storage updated');
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : 'Could not save' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PanelCard title="S3 storage" description="Where session recordings are stored.">
      <StorageFields
        value={value}
        onChange={setValue}
        secretPlaceholder={data?.secretSet ? '•••••••• (saved)' : undefined}
      />
      {msg && <p className={cn('mt-4 text-sm', msg.ok ? 'text-green-600' : 'text-red-600')}>{msg.text}</p>}
      <div className="mt-5 flex gap-3">
        <Button variant="secondary" onClick={test} loading={testing}>
          Test connection
        </Button>
        <Button onClick={save} loading={saving}>
          Save changes
        </Button>
      </div>
    </PanelCard>
  );
}

/* ---- Capture ---- */
interface CaptureGet {
  features: Features;
  privacy: Privacy;
  retention: Retention;
}

function CapturePanel() {
  const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ['settings-capture'],
    queryFn: () => api.get<CaptureGet>('/settings/capture'),
  });
  const [features, setFeatures] = useState<Features>({
    console: true,
    network: true,
    canvas: false,
    errors: true,
  });
  const [maskInputs, setMaskInputs] = useState(true);
  const [days, setDays] = useState(30);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setFeatures(data.features);
    setMaskInputs(data.privacy.maskInputs);
    setDays(data.retention.days);
  }, [data]);

  if (isLoading) return <Spinner />;

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/settings/capture', {
        features,
        privacy: { maskInputs },
        retention: { days },
      });
      toast('success', 'Capture settings saved');
    } catch {
      toast('error', 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const toggles: { key: keyof Features; label: string; hint: string }[] = [
    { key: 'console', label: 'Console logs', hint: 'Capture console.log/warn/error output.' },
    { key: 'network', label: 'Network requests', hint: 'Capture fetch/XHR calls (URL, status, timing).' },
    { key: 'canvas', label: 'Canvas / WebGL', hint: 'Record <canvas> content. Heavier on bandwidth.' },
    { key: 'errors', label: 'Errors & rage clicks', hint: 'Capture JS exceptions and rage clicks.' },
  ];

  return (
    <div className="space-y-6">
      <PanelCard title="What to capture" description="These apply to all tracked pages. The tracker reads them on load.">
        <div className="space-y-4">
          {toggles.map((t) => (
            <div key={t.key} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-700">{t.label}</p>
                <p className="text-xs text-gray-500">{t.hint}</p>
              </div>
              <Switch
                checked={features[t.key]}
                onChange={(v) => setFeatures((f) => ({ ...f, [t.key]: v }))}
              />
            </div>
          ))}
          <div className="flex items-center justify-between gap-4 border-t border-[var(--border)] pt-4">
            <div>
              <p className="text-sm font-medium text-gray-700">Mask inputs by default</p>
              <p className="text-xs text-gray-500">
                Hide text typed into inputs. Reveal specific elements with the <code>rrkit-unmask</code> class.
              </p>
            </div>
            <Switch checked={maskInputs} onChange={setMaskInputs} />
          </div>
        </div>
      </PanelCard>

      <PanelCard title="Retention" description="Automatically delete old sessions to control storage.">
        <Field label="Delete sessions older than (days)">
          <Input
            type="number"
            min={1}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="max-w-[160px]"
          />
        </Field>
      </PanelCard>

      <Button onClick={save} loading={saving}>
        Save changes
      </Button>
    </div>
  );
}

/* ---- Metadata ---- */
function MetadataPanel() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useMetadataFields();
  const [fields, setFields] = useState<MetadataFieldInput[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setFields(
        data.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, filterable: f.filterable })),
      );
    }
  }, [data]);

  if (isLoading) return <Spinner />;

  const save = async () => {
    setError(null);
    const keys = fields.map((f) => f.key.trim());
    if (keys.some((k) => !k)) return setError('Every field needs a key.');
    if (new Set(keys).size !== keys.length) return setError('Field keys must be unique.');
    setSaving(true);
    try {
      await api.put('/settings/metadata', { fields });
      await qc.invalidateQueries({ queryKey: ['metadata-fields'] });
      toast('success', 'Metadata fields saved');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PanelCard
      title="Session metadata fields"
      description="Fields your app attaches via rrkit.setMetadata(). Filterable fields are searchable in the sessions list."
    >
      <MetadataEditor value={fields} onChange={setFields} />
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-5">
        <Button onClick={save} loading={saving}>
          Save changes
        </Button>
      </div>
    </PanelCard>
  );
}

/* ---- Integration ---- */
function IntegrationPanel() {
  const { data, isLoading } = useIntegration();
  if (isLoading || !data) return <Spinner />;

  const snippet = `<script>
  window.rrkitConfig = { key: "${data.ingestKey}", host: "${data.instanceUrl}" };
  (function (h) {
    var s = document.createElement("script");
    s.async = 1;
    s.src = h + "/tracker.js";
    document.head.appendChild(s);
  })("${data.instanceUrl}");
</script>`;

  const npm = `import { rrkit } from "@rrkit/tracker";

rrkit.init({ key: "${data.ingestKey}", host: "${data.instanceUrl}" });

// Optionally associate sessions with a user + metadata:
rrkit.identify("user-123");
rrkit.setMetadata({ user_email: "jane@acme.com" });`;

  return (
    <div className="space-y-6">
      <PanelCard
        title="Script tag"
        description="Paste this just before </head> on every page you want to record."
      >
        <CodeBlock code={snippet} language="html" />
      </PanelCard>
      <PanelCard title="npm package" description="For apps that use a bundler (React, Vue, etc.).">
        <CodeBlock code="npm install @rrkit/tracker" language="bash" />
        <div className="mt-3">
          <CodeBlock code={npm} language="javascript" />
        </div>
      </PanelCard>
      <p className="text-xs text-gray-500">
        Inputs are masked by default. Add the <code>rrkit-unmask</code> class to reveal an element, or{' '}
        <code>rrkit-block</code> to skip it entirely. Toggle what gets captured under the Capture tab.
      </p>
    </div>
  );
}
