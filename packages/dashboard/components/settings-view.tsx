'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type {
  Features,
  Privacy,
  Retention,
  MetadataFieldInput,
  CanvasSettings,
  CanvasFormat,
  FrustrationSettings,
  VolumeSettings,
  DomSettings,
  ConsoleSettings,
  ConsoleLevel,
  UploadSettings,
  NetworkSettings,
  SamplingSettings,
  SessionPolicy,
  AlertsSettings,
  SecuritySettings,
} from '@rrkit/shared';
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
  Select,
  Spinner,
} from '@/components/ui';
import { useToast } from '@/components/toast';
import { StorageFields, emptyStorage, type StorageValue } from '@/components/storage-fields';
import { MetadataEditor } from '@/components/metadata-editor';
import {
  Collapsible,
  ToggleRow,
  StringListField,
  KeyValueField,
} from '@/components/capture-fields';

type Tab = 'general' | 'storage' | 'capture' | 'metadata' | 'integration' | 'privacy';
const TABS: { key: Tab; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'storage', label: 'Storage' },
  { key: 'capture', label: 'Capture' },
  { key: 'metadata', label: 'Metadata' },
  { key: 'integration', label: 'Integration' },
  { key: 'privacy', label: 'Privacy' },
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
          {tab === 'privacy' && <PrivacyPanel />}
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

interface LifecycleStatus {
  supported: boolean;
  days: number | null;
  error?: string;
}

function LifecycleStatusRow() {
  const { data, isLoading } = useQuery({
    queryKey: ['settings-storage-lifecycle'],
    queryFn: () => api.get<LifecycleStatus>('/settings/storage/lifecycle'),
  });

  let body: React.ReactNode;
  let color = 'text-gray-600';
  if (isLoading) {
    body = 'Checking…';
  } else if (!data) {
    body = 'Unavailable.';
    color = 'text-gray-400';
  } else if (data.error) {
    body = data.error;
    color = 'text-amber-600';
  } else if (!data.supported) {
    body = 'Not supported by this bucket.';
    color = 'text-gray-500';
  } else if (data.days != null) {
    body = `Expiring objects after ${data.days} ${data.days === 1 ? 'day' : 'days'}.`;
    color = 'text-green-600';
  } else {
    body = 'No expiry rule configured on this bucket.';
    color = 'text-amber-600';
  }

  return (
    <div className="mt-6 rounded-lg border border-[var(--border)] p-4">
      <p className="text-sm font-medium text-gray-700">S3 lifecycle (retention expiry)</p>
      <p className={cn('mt-1 text-sm', color)}>{body}</p>
      <p className="mt-1 text-xs text-gray-400">
        Read-only. Reflects the bucket&apos;s server-side expiration rule for stored recordings.
      </p>
    </div>
  );
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
      <LifecycleStatusRow />
    </PanelCard>
  );
}

/* ---- Privacy: GDPR right-to-erasure ---- */
function PrivacyPanel() {
  const toast = useToast();
  const { data: fieldsData } = useMetadataFields();
  const [key, setKey] = useState('user_id');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const erase = async () => {
    if (!value.trim()) {
      toast('error', 'Enter a value to match.');
      return;
    }
    if (
      !confirm(
        `Permanently delete all sessions where ${key} = "${value}", including their recordings? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ deleted: number }>('/sessions/erase', { key, value });
      toast(
        'success',
        res.deleted === 0
          ? 'No matching sessions found.'
          : `Erased ${res.deleted} ${res.deleted === 1 ? 'session' : 'sessions'}.`,
      );
      setValue('');
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Could not erase data');
    } finally {
      setBusy(false);
    }
  };

  const metadataKeys = (fieldsData?.fields ?? []).map((f) => f.key);

  return (
    <PanelCard
      title="Erase user data (GDPR)"
      description="Delete every session (and its recording) matching a metadata key/value. Use this to honour a right-to-erasure request."
    >
      <div className="max-w-md space-y-4">
        <Field label="Metadata key" hint="The metadata field that identifies the user, e.g. user_id.">
          {metadataKeys.length > 0 ? (
            <Select value={key} onChange={(e) => setKey(e.target.value)}>
              {!metadataKeys.includes(key) && <option value={key}>{key}</option>}
              {metadataKeys.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
          ) : (
            <Input value={key} onChange={(e) => setKey(e.target.value)} className="font-mono" />
          )}
        </Field>
        <Field label="Value" hint="The exact value to match, e.g. the user's id.">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. 12345"
            className="font-mono"
          />
        </Field>
        <Button variant="danger" onClick={erase} loading={busy}>
          Erase matching sessions
        </Button>
        <p className="text-xs text-gray-500">
          This is permanent and irreversible. Recordings are removed from storage and the session
          metadata is deleted.
        </p>
      </div>
    </PanelCard>
  );
}

/* ---- Capture ---- */
interface CaptureGet {
  features: Features;
  privacy: Privacy;
  retention: Retention;
  canvas: CanvasSettings;
  frustration: FrustrationSettings;
  volume: VolumeSettings;
  dom: DomSettings;
  console: ConsoleSettings;
  upload: UploadSettings;
  network: NetworkSettings;
  sampling: SamplingSettings;
  sessionPolicy: SessionPolicy;
  alerts: AlertsSettings;
  security: SecuritySettings;
}

const CONSOLE_LEVELS: ConsoleLevel[] = ['log', 'info', 'warn', 'error', 'debug'];
const CANVAS_FORMATS: CanvasFormat[] = ['webp', 'jpeg', 'png'];

const FEATURE_TOGGLES: { key: keyof Features; label: string; hint: string }[] = [
  { key: 'console', label: 'Console logs', hint: 'Capture console.log/warn/error output.' },
  { key: 'network', label: 'Network requests', hint: 'Capture fetch/XHR calls (URL, status, timing).' },
  { key: 'canvas', label: 'Canvas / WebGL', hint: 'Record <canvas> content. Heavier on bandwidth.' },
  { key: 'errors', label: 'JavaScript errors', hint: 'Capture uncaught exceptions and promise rejections.' },
  { key: 'rage', label: 'Rage clicks', hint: 'Detect rapid repeated clicks on the same spot.' },
  { key: 'deadClick', label: 'Dead clicks', hint: 'Detect clicks that produce no change. Opt-in (noisier).' },
  { key: 'webVitals', label: 'Web Vitals', hint: 'Capture Core Web Vitals (LCP, CLS, FCP, TTFB). Opt-in.' },
];

function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function CapturePanel() {
  const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ['settings-capture'],
    queryFn: () => api.get<CaptureGet>('/settings/capture'),
  });

  const [features, setFeatures] = useState<Features | null>(null);
  const [privacy, setPrivacy] = useState<Privacy | null>(null);
  const [days, setDays] = useState(30);
  const [canvas, setCanvas] = useState<CanvasSettings | null>(null);
  const [frustration, setFrustration] = useState<FrustrationSettings | null>(null);
  const [volume, setVolume] = useState<VolumeSettings | null>(null);
  const [dom, setDom] = useState<DomSettings | null>(null);
  const [consoleCfg, setConsoleCfg] = useState<ConsoleSettings | null>(null);
  const [upload, setUpload] = useState<UploadSettings | null>(null);
  const [network, setNetwork] = useState<NetworkSettings | null>(null);
  const [sampling, setSampling] = useState<SamplingSettings | null>(null);
  const [sessionPolicy, setSessionPolicy] = useState<SessionPolicy | null>(null);
  const [alerts, setAlerts] = useState<AlertsSettings | null>(null);
  const [security, setSecurity] = useState<SecuritySettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setFeatures(data.features);
    setPrivacy(data.privacy);
    setDays(data.retention.days);
    setCanvas(data.canvas);
    setFrustration(data.frustration);
    setVolume(data.volume);
    setDom(data.dom);
    setConsoleCfg(data.console);
    setUpload(data.upload);
    setNetwork(data.network);
    setSampling(data.sampling);
    setSessionPolicy(data.sessionPolicy);
    setAlerts(data.alerts);
    setSecurity(data.security);
  }, [data]);

  if (
    isLoading ||
    !features ||
    !privacy ||
    !canvas ||
    !frustration ||
    !volume ||
    !dom ||
    !consoleCfg ||
    !upload ||
    !network ||
    !sampling ||
    !sessionPolicy ||
    !alerts ||
    !security
  ) {
    return <Spinner />;
  }

  const setF = (patch: Partial<Features>) => setFeatures((f) => ({ ...f!, ...patch }));
  const setP = (patch: Partial<Privacy>) => setPrivacy((p) => ({ ...p!, ...patch }));
  const setC = (patch: Partial<CanvasSettings>) => setCanvas((c) => ({ ...c!, ...patch }));
  const setFr = (patch: Partial<FrustrationSettings>) => setFrustration((c) => ({ ...c!, ...patch }));
  const setV = (patch: Partial<VolumeSettings>) => setVolume((c) => ({ ...c!, ...patch }));
  const setD = (patch: Partial<DomSettings>) => setDom((c) => ({ ...c!, ...patch }));
  const setCon = (patch: Partial<ConsoleSettings>) => setConsoleCfg((c) => ({ ...c!, ...patch }));
  const setU = (patch: Partial<UploadSettings>) => setUpload((c) => ({ ...c!, ...patch }));
  const setN = (patch: Partial<NetworkSettings>) => setNetwork((c) => ({ ...c!, ...patch }));
  const setS = (patch: Partial<SamplingSettings>) => setSampling((c) => ({ ...c!, ...patch }));
  const setSp = (patch: Partial<SessionPolicy>) => setSessionPolicy((c) => ({ ...c!, ...patch }));
  const setA = (patch: Partial<AlertsSettings>) => setAlerts((c) => ({ ...c!, ...patch }));
  const setSec = (patch: Partial<SecuritySettings>) => setSecurity((c) => ({ ...c!, ...patch }));

  const toggleConsoleLevel = (level: ConsoleLevel, on: boolean) => {
    const set = new Set(consoleCfg.levels);
    if (on) set.add(level);
    else set.delete(level);
    setCon({ levels: CONSOLE_LEVELS.filter((l) => set.has(l)) });
  };

  const toggleMaskInputType = (type: string, on: boolean) => {
    const set = new Set(privacy.maskInputTypes);
    if (on) set.add(type);
    else set.delete(type);
    setP({ maskInputTypes: [...set] });
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/settings/capture', {
        features,
        privacy,
        retention: { days },
        canvas,
        frustration,
        volume,
        dom,
        console: consoleCfg,
        upload,
        network,
        sampling,
        sessionPolicy,
        alerts,
        security,
      });
      toast('success', 'Capture settings saved');
    } catch {
      toast('error', 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const COMMON_INPUT_TYPES = ['password', 'email', 'tel', 'number', 'text'];

  return (
    <div className="space-y-6">
      {/* Recording */}
      <PanelCard
        title="What to capture"
        description="These apply to all tracked pages. The tracker reads them on load."
      >
        <div className="space-y-4">
          {FEATURE_TOGGLES.map((t) => (
            <ToggleRow
              key={t.key}
              label={t.label}
              hint={t.hint}
              checked={features[t.key]}
              onChange={(v) => setF({ [t.key]: v } as Partial<Features>)}
            />
          ))}
        </div>
      </PanelCard>

      {/* Privacy & masking */}
      <PanelCard title="Privacy & masking" description="Control what text and identifiers are recorded.">
        <div className="space-y-4">
          <ToggleRow
            label="Mask inputs by default"
            hint="Hide text typed into inputs. Reveal specific elements with the rrkit-unmask class."
            checked={privacy.maskInputs}
            onChange={(v) => setP({ maskInputs: v })}
          />
          <ToggleRow
            label="Scrub PII"
            hint="Run a built-in regex scrub (emails, card numbers) over recorded text."
            checked={privacy.scrubPii}
            onChange={(v) => setP({ scrubPii: v })}
          />
          <ToggleRow
            label="Drop IP address"
            hint="Do not store the client IP at all."
            checked={privacy.dropIp}
            onChange={(v) => setP({ dropIp: v })}
          />
          <ToggleRow
            label="Anonymize IP"
            hint="Store a truncated IP (drop the last octet / IPv6 suffix)."
            checked={privacy.anonymizeIp}
            onChange={(v) => setP({ anonymizeIp: v })}
          />
          <ToggleRow
            label="Respect Do Not Track"
            hint="Honour navigator.doNotTrack / Global Privacy Control."
            checked={privacy.respectDnt}
            onChange={(v) => setP({ respectDnt: v })}
          />

          <Collapsible title="Selectors & masked input types" description="Fine-grained, selector-based privacy controls.">
            <div className="space-y-4">
              <Field label="Mask text selector" hint="CSS selector(s) whose text is force-masked (comma-separated).">
                <Input
                  value={privacy.maskTextSelector}
                  onChange={(e) => setP({ maskTextSelector: e.target.value })}
                  placeholder=".sensitive, [data-private]"
                  className="font-mono"
                />
              </Field>
              <Field label="Block selector" hint="CSS selector(s) whose elements are blocked (not recorded).">
                <Input
                  value={privacy.blockSelector}
                  onChange={(e) => setP({ blockSelector: e.target.value })}
                  placeholder=".rrkit-block"
                  className="font-mono"
                />
              </Field>
              <Field label="Ignore selector" hint="CSS selector(s) whose interactions are ignored.">
                <Input
                  value={privacy.ignoreSelector}
                  onChange={(e) => setP({ ignoreSelector: e.target.value })}
                  placeholder=".rrkit-ignore"
                  className="font-mono"
                />
              </Field>
              <Field label="Masked input types" hint="Input types masked in addition to the global toggle.">
                <div className="flex flex-wrap gap-3">
                  {COMMON_INPUT_TYPES.map((type) => (
                    <label key={type} className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={privacy.maskInputTypes.includes(type)}
                        onChange={(e) => toggleMaskInputType(type, e.target.checked)}
                      />
                      {type}
                    </label>
                  ))}
                </div>
              </Field>
            </div>
          </Collapsible>
        </div>
      </PanelCard>

      {/* Retention */}
      <PanelCard title="Retention" description="Automatically delete old sessions to control storage.">
        <Field label="Delete sessions older than (days)">
          <Input
            type="number"
            min={1}
            max={3650}
            value={days}
            onChange={(e) => setDays(num(e.target.value))}
            className="max-w-[160px]"
          />
        </Field>
      </PanelCard>

      {/* Advanced groups */}
      <PanelCard
        title="Advanced capture"
        description="Deep recording knobs. Defaults are sensible; tune only if you know you need to."
      >
        <div className="space-y-3">
          <Collapsible title="Canvas" description="Snapshot rate and image encoding for <canvas> recording.">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="FPS" hint="1–30">
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={canvas.fps}
                  onChange={(e) => setC({ fps: num(e.target.value) })}
                />
              </Field>
              <Field label="Quality" hint="0.1–1.0">
                <Input
                  type="number"
                  min={0.1}
                  max={1}
                  step={0.1}
                  value={canvas.quality}
                  onChange={(e) => setC({ quality: num(e.target.value) })}
                />
              </Field>
              <Field label="Format">
                <Select value={canvas.format} onChange={(e) => setC({ format: e.target.value as CanvasFormat })}>
                  {CANVAS_FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Collapsible>

          <Collapsible title="Frustration thresholds" description="When a cluster of clicks counts as rage / dead.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Rage threshold (clicks)" hint="2–20">
                <Input
                  type="number"
                  min={2}
                  max={20}
                  value={frustration.rageThreshold}
                  onChange={(e) => setFr({ rageThreshold: num(e.target.value) })}
                />
              </Field>
              <Field label="Rage window (ms)" hint="200–10000">
                <Input
                  type="number"
                  min={200}
                  max={10000}
                  value={frustration.rageWindowMs}
                  onChange={(e) => setFr({ rageWindowMs: num(e.target.value) })}
                />
              </Field>
              <Field label="Rage radius (px)" hint="5–400">
                <Input
                  type="number"
                  min={5}
                  max={400}
                  value={frustration.rageRadiusPx}
                  onChange={(e) => setFr({ rageRadiusPx: num(e.target.value) })}
                />
              </Field>
              <Field label="Dead-click window (ms)" hint="300–10000">
                <Input
                  type="number"
                  min={300}
                  max={10000}
                  value={frustration.deadClickWindowMs}
                  onChange={(e) => setFr({ deadClickWindowMs: num(e.target.value) })}
                />
              </Field>
            </div>
          </Collapsible>

          <Collapsible title="Volume / sampling" description="Throttle high-frequency events to shrink recordings.">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Mousemove wait (ms)" hint="0–2000">
                  <Input
                    type="number"
                    min={0}
                    max={2000}
                    value={volume.mousemoveWaitMs}
                    onChange={(e) => setV({ mousemoveWaitMs: num(e.target.value) })}
                  />
                </Field>
                <Field label="Scroll wait (ms)" hint="0–2000">
                  <Input
                    type="number"
                    min={0}
                    max={2000}
                    value={volume.scrollWaitMs}
                    onChange={(e) => setV({ scrollWaitMs: num(e.target.value) })}
                  />
                </Field>
                <Field label="Media wait (ms)" hint="0–2000">
                  <Input
                    type="number"
                    min={0}
                    max={2000}
                    value={volume.mediaWaitMs}
                    onChange={(e) => setV({ mediaWaitMs: num(e.target.value) })}
                  />
                </Field>
              </div>
              <Field label="Input recording" hint="'all' records every keystroke; 'last' only the final value per field.">
                <Select
                  value={volume.input}
                  onChange={(e) => setV({ input: e.target.value as VolumeSettings['input'] })}
                  className="max-w-[200px]"
                >
                  <option value="all">all keystrokes</option>
                  <option value="last">last value only</option>
                </Select>
              </Field>
              <ToggleRow
                label="Record mouse interactions"
                hint="Capture clicks, focus, and other pointer interactions."
                checked={volume.mouseInteraction}
                onChange={(v) => setV({ mouseInteraction: v })}
              />
            </div>
          </Collapsible>

          <Collapsible title="DOM fidelity" description="Snapshot detail vs. storage efficiency.">
            <div className="space-y-4">
              <ToggleRow
                label="Slim DOM"
                hint="Strip comments/scripts/meta to shrink snapshots."
                checked={dom.slimDom}
                onChange={(v) => setD({ slimDom: v })}
              />
              <ToggleRow
                label="Inline stylesheets"
                hint="Embed CSS so replays survive expiring asset URLs."
                checked={dom.inlineStylesheet}
                onChange={(v) => setD({ inlineStylesheet: v })}
              />
              <ToggleRow
                label="Inline images"
                hint="Inline image data (heavier, but survives expiring URLs)."
                checked={dom.inlineImages}
                onChange={(v) => setD({ inlineImages: v })}
              />
              <ToggleRow
                label="Collect fonts"
                hint="Capture web fonts for accurate replay."
                checked={dom.collectFonts}
                onChange={(v) => setD({ collectFonts: v })}
              />
              <ToggleRow
                label="Record cross-origin iframes"
                hint="Attempt to record iframes from other origins."
                checked={dom.recordCrossOriginIframes}
                onChange={(v) => setD({ recordCrossOriginIframes: v })}
              />
              <ToggleRow
                label="Pack events"
                hint="Compress events with rrweb's pack() before upload (player unpacks)."
                checked={dom.pack}
                onChange={(v) => setD({ pack: v })}
              />
              <Field label="Full-snapshot interval (ms)" hint="0 disables. Max 600000.">
                <Input
                  type="number"
                  min={0}
                  max={600000}
                  value={dom.checkoutEveryNms}
                  onChange={(e) => setD({ checkoutEveryNms: num(e.target.value) })}
                  className="max-w-[200px]"
                />
              </Field>
            </div>
          </Collapsible>

          <Collapsible title="Console" description="Which console levels and how much of each argument.">
            <div className="space-y-4">
              <Field label="Levels">
                <div className="flex flex-wrap gap-3">
                  {CONSOLE_LEVELS.map((level) => (
                    <label key={level} className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={consoleCfg.levels.includes(level)}
                        onChange={(e) => toggleConsoleLevel(level, e.target.checked)}
                      />
                      {level}
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="Max argument length (chars)" hint="100–100000">
                <Input
                  type="number"
                  min={100}
                  max={100000}
                  value={consoleCfg.maxArgLength}
                  onChange={(e) => setCon({ maxArgLength: num(e.target.value) })}
                  className="max-w-[200px]"
                />
              </Field>
              <ToggleRow
                label="Capture stack traces"
                hint="Attach a stack trace to console.error / warn."
                checked={consoleCfg.captureStack}
                onChange={(v) => setCon({ captureStack: v })}
              />
            </div>
          </Collapsible>

          <Collapsible title="Upload" description="How often and how aggressively events are flushed.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Upload interval (ms)" hint="500–60000">
                <Input
                  type="number"
                  min={500}
                  max={60000}
                  value={upload.uploadIntervalMs}
                  onChange={(e) => setU({ uploadIntervalMs: num(e.target.value) })}
                />
              </Field>
              <Field label="Flush threshold (bytes)" hint="Flush early once the buffer reaches this size.">
                <Input
                  type="number"
                  min={0}
                  value={upload.flushThresholdBytes}
                  onChange={(e) => setU({ flushThresholdBytes: num(e.target.value) })}
                />
              </Field>
            </div>
          </Collapsible>

          <Collapsible title="Network" description="Header/body capture and redaction (off by default).">
            <div className="space-y-4">
              <ToggleRow
                label="Record headers"
                hint="Capture request/response headers."
                checked={network.recordHeaders}
                onChange={(v) => setN({ recordHeaders: v })}
              />
              <ToggleRow
                label="Record bodies"
                hint="Capture request/response bodies (subject to limits below)."
                checked={network.recordBody}
                onChange={(v) => setN({ recordBody: v })}
              />
              <Field label="Max body bytes" hint="Truncate captured bodies beyond this size.">
                <Input
                  type="number"
                  min={0}
                  value={network.maxBodyBytes}
                  onChange={(e) => setN({ maxBodyBytes: num(e.target.value) })}
                  className="max-w-[200px]"
                />
              </Field>
              <StringListField
                label="Content-type allowlist"
                hint="Only capture bodies for these content-type prefixes. One per line."
                placeholder={'application/json\ntext/'}
                value={network.contentTypeAllowlist}
                onChange={(v) => setN({ contentTypeAllowlist: v })}
              />
              <StringListField
                label="URL allowlist"
                hint="Regex strings; if non-empty, only matching URLs are recorded. One per line."
                value={network.urlAllowlist}
                onChange={(v) => setN({ urlAllowlist: v })}
              />
              <StringListField
                label="URL blocklist"
                hint="Regex strings; matching URLs are never recorded. One per line."
                value={network.urlBlocklist}
                onChange={(v) => setN({ urlBlocklist: v })}
              />
              <StringListField
                label="Redact headers"
                hint="Header names redacted before leaving the browser. One per line."
                value={network.redactHeaders}
                onChange={(v) => setN({ redactHeaders: v })}
              />
              <StringListField
                label="Redact body keys"
                hint="JSON keys / form fields redacted before leaving the browser. One per line."
                value={network.redactBodyKeys}
                onChange={(v) => setN({ redactBodyKeys: v })}
              />
            </div>
          </Collapsible>

          <Collapsible title="Sampling rules" description="Which sessions get recorded at all.">
            <div className="space-y-4">
              <Field label="Session sample rate" hint="0–1. 1 records everyone.">
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={sampling.sessionSampleRate}
                  onChange={(e) => setS({ sessionSampleRate: num(e.target.value) })}
                  className="max-w-[200px]"
                />
              </Field>
              <ToggleRow
                label="Record only on error"
                hint="Buffer events and only persist once an error / rage / dead click fires."
                checked={sampling.recordOnlyOnError}
                onChange={(v) => setS({ recordOnlyOnError: v })}
              />
              <StringListField
                label="URL allowlist"
                hint="Regex strings; if non-empty, only record on matching URLs. One per line."
                value={sampling.urlAllowlist}
                onChange={(v) => setS({ urlAllowlist: v })}
              />
              <StringListField
                label="URL blocklist"
                hint="Regex strings; never record on matching URLs. One per line."
                value={sampling.urlBlocklist}
                onChange={(v) => setS({ urlBlocklist: v })}
              />
              <KeyValueField
                label="Metadata allow"
                hint="Only record sessions whose metadata matches every key=value here."
                value={sampling.metadataAllow}
                onChange={(v) => setS({ metadataAllow: v })}
              />
            </div>
          </Collapsible>

          <Collapsible title="Session policy" description="Minimum bar for keeping a recorded session.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Min duration (ms)" hint="0–600000">
                <Input
                  type="number"
                  min={0}
                  max={600000}
                  value={sessionPolicy.minDurationMs}
                  onChange={(e) => setSp({ minDurationMs: num(e.target.value) })}
                />
              </Field>
              <Field label="Min event count" hint="0–100000">
                <Input
                  type="number"
                  min={0}
                  max={100000}
                  value={sessionPolicy.minEventCount}
                  onChange={(e) => setSp({ minEventCount: num(e.target.value) })}
                />
              </Field>
            </div>
          </Collapsible>

          <Collapsible title="Alerts" description="Outbound notifications for error spikes and rage.">
            <div className="space-y-4">
              <ToggleRow
                label="Enable alerts"
                hint="Master switch for outbound notifications."
                checked={alerts.enabled}
                onChange={(v) => setA({ enabled: v })}
              />
              <Field label="Webhook URL" hint="Outbound webhook (Slack-compatible JSON payload).">
                <Input
                  type="url"
                  value={alerts.webhookUrl}
                  onChange={(e) => setA({ webhookUrl: e.target.value })}
                  placeholder="https://hooks.slack.com/services/..."
                  className="font-mono"
                />
              </Field>
              <Field label="Error spike threshold" hint="Notify when an issue is seen this many times within the window.">
                <Input
                  type="number"
                  min={1}
                  max={100000}
                  value={alerts.errorSpikeThreshold}
                  onChange={(e) => setA({ errorSpikeThreshold: num(e.target.value) })}
                  className="max-w-[200px]"
                />
              </Field>
              <ToggleRow
                label="Notify on new issues"
                hint="Notify on the first occurrence of a brand-new error issue."
                checked={alerts.notifyNewIssues}
                onChange={(v) => setA({ notifyNewIssues: v })}
              />
              <ToggleRow
                label="Notify on rage"
                hint="Notify on rage-click clusters."
                checked={alerts.notifyRage}
                onChange={(v) => setA({ notifyRage: v })}
              />
            </div>
          </Collapsible>

          <Collapsible title="Security" description="Origin allowlist and ingest rate limiting.">
            <div className="space-y-4">
              <StringListField
                label="Allowed origins"
                hint="If non-empty, ingest is only accepted from these origins. One per line."
                placeholder="https://app.example.com"
                value={security.allowedOrigins}
                onChange={(v) => setSec({ allowedOrigins: v })}
              />
              <Field label="Ingest rate per minute (per IP)" hint="0 = unlimited.">
                <Input
                  type="number"
                  min={0}
                  max={1000000}
                  value={security.ingestRatePerMin}
                  onChange={(e) => setSec({ ingestRatePerMin: num(e.target.value) })}
                  className="max-w-[200px]"
                />
              </Field>
            </div>
          </Collapsible>
        </div>
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
