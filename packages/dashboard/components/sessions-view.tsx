'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Gauge,
  MousePointer2,
  MousePointerClick,
  Star,
  Trash2,
} from 'lucide-react';
import type {
  ConsoleEventPayload,
  DeadClickEventPayload,
  ErrorEventPayload,
  NetworkEventPayload,
  RageEventPayload,
  RrwebEvent,
  SessionRecord,
  SessionStatus,
  WebVitalEventPayload,
} from '@rrkit/shared';
import { CUSTOM_EVENT_TAGS } from '@rrkit/shared/constants';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime, formatDuration, formatRelative, truncate } from '@/lib/format';
import { useFacets, useMetadataFields, useSession, useSessions, useStats } from '@/lib/queries';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Skeleton,
  Spinner,
  Textarea,
} from '@/components/ui';
import { useToast } from '@/components/toast';
import type { PlayerApi } from './rrweb-player';

const RrwebPlayer = dynamic(() => import('./rrweb-player').then((m) => m.RrwebPlayer), {
  ssr: false,
  loading: () => (
    <div className="flex h-80 items-center justify-center rounded-lg bg-gray-50">
      <Spinner />
    </div>
  ),
});

const statusColor: Record<SessionStatus, string> = {
  recording: 'amber',
  completed: 'green',
  failed: 'red',
};

export default function SessionsView() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const read = () => setSelectedId(new URLSearchParams(window.location.search).get('id'));
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);

  const open = (id: string) => {
    setSelectedId(id);
    const u = new URL(window.location.href);
    u.searchParams.set('id', id);
    window.history.pushState({}, '', u);
  };
  const back = () => {
    setSelectedId(null);
    const u = new URL(window.location.href);
    u.searchParams.delete('id');
    window.history.pushState({}, '', u);
  };

  return selectedId ? <SessionDetail id={selectedId} onBack={back} /> : <SessionsList onOpen={open} />;
}

/* ------------------------------------------------------------------ */
/* List                                                                */
/* ------------------------------------------------------------------ */

function SessionsList({ onOpen }: { onOpen: (id: string) => void }) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [browser, setBrowser] = useState('');
  const [search, setSearch] = useState('');
  const [mf, setMf] = useState<Record<string, string>>({});

  const facets = useFacets();
  const fields = useMetadataFields();
  const filterable = (fields.data?.fields ?? []).filter((f) => f.filterable);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('pageSize', '25');
    if (status) p.set('status', status);
    if (browser) p.set('browser', browser);
    if (search) p.set('search', search);
    for (const [k, v] of Object.entries(mf)) if (v) p.set(`mf_${k}`, v);
    return `?${p.toString()}`;
  }, [page, status, browser, search, mf]);

  const stats = useStats(10_000);
  const { data, isLoading } = useSessions(qs, 10_000);

  const hasFilters = Boolean(status || browser || search || Object.values(mf).some(Boolean));
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 25));

  return (
    <div>
      <PageHeader title="Sessions" description="Recorded user sessions. Click any row to replay it." />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total" value={stats.data?.total} />
        <StatCard label="Recording" value={stats.data?.recording} color="amber" />
        <StatCard label="Completed" value={stats.data?.completed} color="green" />
        <StatCard label="Failed" value={stats.data?.failed} color="red" />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-40">
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="recording">Recording</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </Select>
        </div>
        <div className="w-40">
          <Select
            value={browser}
            onChange={(e) => {
              setBrowser(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All browsers</option>
            {(facets.data?.browser ?? []).map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-56">
          <Input
            placeholder="Search id, IP, metadata…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        {filterable.map((f) => (
          <div key={f.key} className="w-44">
            <Input
              placeholder={f.label}
              value={mf[f.key] ?? ''}
              onChange={(e) => {
                setMf((m) => ({ ...m, [f.key]: e.target.value }));
                setPage(1);
              }}
            />
          </div>
        ))}
      </div>

      {isLoading ? (
        <Card className="divide-y divide-[var(--border)]">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="ml-auto h-4 w-16" />
            </div>
          ))}
        </Card>
      ) : total === 0 ? (
        hasFilters ? (
          <EmptyState
            title="No sessions match these filters"
            description="Try clearing the filters to see all sessions."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setStatus('');
                  setBrowser('');
                  setSearch('');
                  setMf({});
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No sessions recorded yet"
            description="Install the tracker on your site to start capturing sessions."
            action={
              <a href="/settings">
                <Button>Install the tracker</Button>
              </a>
            }
          />
        )
      ) : (
        <>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3 font-medium">Session</th>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Browser / OS</th>
                  <th className="px-4 py-3 font-medium">Duration</th>
                  <th className="px-4 py-3 font-medium">Events</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data!.items.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => onOpen(s.id)}
                    className="cursor-pointer border-b border-[var(--border)] last:border-0 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {s.starred && (
                          <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
                        )}
                        <span className="font-mono text-xs text-gray-700">{truncate(s.id, 22)}</span>
                      </div>
                      <div className="text-xs text-gray-400">{formatRelative(s.created)}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {(s.metadata?.user_id as string | undefined) ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {s.ua_browser ?? '—'}
                      <span className="text-gray-400"> · {s.ua_os ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDuration(s.duration_ms)}</td>
                    <td className="px-4 py-3 text-gray-600">{s.event_count}</td>
                    <td className="px-4 py-3">
                      <Badge color={statusColor[s.status]}>{s.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
            <span>
              {(page - 1) * 25 + 1}–{Math.min(page * 25, total)} of {total}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, color = 'gray' }: { label: string; value?: number; color?: string }) {
  const dot: Record<string, string> = {
    gray: 'bg-gray-400',
    amber: 'bg-amber-500',
    green: 'bg-green-500',
    red: 'bg-red-500',
  };
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
        <span className={cn('h-2 w-2 rounded-full', dot[color])} />
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold">{value ?? '—'}</div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Detail                                                              */
/* ------------------------------------------------------------------ */

interface CustomItem {
  tag: string;
  payload: unknown;
  offset: number;
}

function SessionDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const session = useSession(id);
  const playerApi = useRef<PlayerApi | null>(null);
  const [tab, setTab] = useState<'console' | 'network' | 'issues'>('console');
  const [note, setNote] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteDirty, setNoteDirty] = useState(false);

  const eventsQuery = useQuery({
    queryKey: ['session-events', id],
    queryFn: () => api.get<{ events: RrwebEvent[] }>(`/sessions/${id}/events`),
  });

  const sessionNote = session.data?.note ?? '';
  useEffect(() => {
    if (!noteDirty) setNote(sessionNote);
  }, [sessionNote, noteDirty]);

  const events = eventsQuery.data?.events ?? [];
  const firstTs = events[0]?.timestamp ?? 0;

  const custom: CustomItem[] = useMemo(
    () =>
      events
        .filter((e) => e.type === 5 && e.data && typeof e.data === 'object')
        .map((e) => {
          const d = e.data as { tag: string; payload: unknown };
          return { tag: d.tag, payload: d.payload, offset: e.timestamp - firstTs };
        }),
    [events, firstTs],
  );

  const consoleItems = custom.filter((c) => c.tag === CUSTOM_EVENT_TAGS.console);
  const networkItems = custom.filter((c) => c.tag === CUSTOM_EVENT_TAGS.network);
  const issueItems = custom.filter(
    (c) =>
      c.tag === CUSTOM_EVENT_TAGS.error ||
      c.tag === CUSTOM_EVENT_TAGS.rage ||
      c.tag === CUSTOM_EVENT_TAGS.deadClick,
  );
  const vitalItems = custom.filter((c) => c.tag === CUSTOM_EVENT_TAGS.vital);

  const seek = (offset: number) => playerApi.current?.goto(Math.max(0, offset));

  const copyCurl = async (p: NetworkEventPayload) => {
    try {
      await navigator.clipboard.writeText(buildCurl(p));
      toast('success', 'Copied cURL to clipboard');
    } catch {
      toast('error', 'Could not copy to clipboard');
    }
  };

  const remove = async () => {
    if (!confirm('Delete this session and its recording? This cannot be undone.')) return;
    try {
      await api.del(`/sessions/${id}`);
      await qc.invalidateQueries({ queryKey: ['sessions'] });
      toast('success', 'Session deleted');
      onBack();
    } catch {
      toast('error', 'Could not delete session');
    }
  };

  const s = session.data;

  const patchSession = async (body: { starred?: boolean; note?: string }) => {
    const updated = await api.patch<SessionRecord>(`/sessions/${id}`, body);
    qc.setQueryData(['session', id], updated);
    await qc.invalidateQueries({ queryKey: ['sessions'] });
    return updated;
  };

  const toggleStar = async () => {
    if (!s) return;
    try {
      await patchSession({ starred: !s.starred });
    } catch {
      toast('error', 'Could not update session');
    }
  };

  const saveNote = async () => {
    setNoteSaving(true);
    try {
      await patchSession({ note });
      setNoteDirty(false);
      toast('success', 'Note saved');
    } catch {
      toast('error', 'Could not save note');
    } finally {
      setNoteSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" />
          Back to sessions
        </button>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={toggleStar} disabled={!s}>
            <Star
              className={cn('h-4 w-4', s?.starred && 'fill-amber-400 text-amber-400')}
            />
            {s?.starred ? 'Starred' : 'Star'}
          </Button>
          <Button variant="danger" onClick={remove}>
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <Card className="p-3">
            {eventsQuery.isLoading ? (
              <div className="flex h-80 items-center justify-center">
                <Spinner />
              </div>
            ) : events.length < 2 ? (
              <div className="flex h-80 items-center justify-center text-sm text-gray-400">
                This session has no replayable events.
              </div>
            ) : (
              <RrwebPlayer events={events} onReady={(api) => (playerApi.current = api)} />
            )}
          </Card>

          <Card>
            <div className="flex border-b border-[var(--border)] text-sm">
              {(
                [
                  ['console', `Console (${consoleItems.length})`],
                  ['network', `Network (${networkItems.length})`],
                  ['issues', `Issues (${issueItems.length})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={cn(
                    'px-4 py-3 font-medium',
                    tab === key ? 'border-b-2 border-brand text-brand' : 'text-gray-500',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {tab === 'console' && <ConsolePanel items={consoleItems} onSeek={seek} />}
              {tab === 'network' && (
                <NetworkPanel items={networkItems} onSeek={seek} onCopyCurl={copyCurl} />
              )}
              {tab === 'issues' && <IssuesPanel items={issueItems} onSeek={seek} />}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
        {vitalItems.length > 0 && <WebVitalsCard items={vitalItems} />}
        <Card className="h-fit p-4">
          <h3 className="mb-3 text-sm font-semibold">Session details</h3>
          {s ? (
            <dl className="space-y-2 text-sm">
              <Detail label="Status" value={<Badge color={statusColor[s.status]}>{s.status}</Badge>} />
              <Detail label="Started" value={formatDateTime(s.created)} />
              <Detail label="Duration" value={formatDuration(s.duration_ms)} />
              <Detail label="Events" value={String(s.event_count)} />
              <Detail label="Browser" value={s.ua_browser ?? '—'} />
              <Detail label="OS" value={s.ua_os ?? '—'} />
              <Detail label="Device" value={s.ua_device ?? '—'} />
              <Detail
                label="Screen"
                value={s.screen_w ? `${s.screen_w}×${s.screen_h}` : '—'}
              />
              <Detail
                label="Viewport"
                value={s.viewport_w ? `${s.viewport_w}×${s.viewport_h}` : '—'}
              />
              <Detail label="IP" value={s.ip ?? '—'} />
              {s.url && <Detail label="URL" value={<span className="break-all">{s.url}</span>} />}
              {s.metadata &&
                Object.entries(s.metadata).map(([k, v]) => (
                  <Detail key={k} label={k} value={String(v)} />
                ))}
            </dl>
          ) : (
            <Spinner />
          )}
        </Card>

        <Card className="h-fit p-4">
          <h3 className="mb-3 text-sm font-semibold">Note</h3>
          <Textarea
            rows={4}
            placeholder="Add a triage note…"
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setNoteDirty(true);
            }}
            className="text-sm"
          />
          <div className="mt-3 flex justify-end">
            <Button
              variant="secondary"
              onClick={saveNote}
              loading={noteSaving}
              disabled={!s || !noteDirty}
            >
              Save note
            </Button>
          </div>
        </Card>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-800">{value}</dd>
    </div>
  );
}

function Row({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 border-b border-[var(--border)] px-4 py-2 text-left text-xs last:border-0 hover:bg-gray-50"
    >
      {children}
    </button>
  );
}

function PanelEmpty({ text }: { text: string }) {
  return <div className="px-4 py-8 text-center text-xs text-gray-400">{text}</div>;
}

function offsetLabel(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function ConsolePanel({ items, onSeek }: { items: CustomItem[]; onSeek: (o: number) => void }) {
  if (items.length === 0) return <PanelEmpty text="No console output captured." />;
  const levelColor: Record<string, string> = {
    error: 'text-red-600',
    warn: 'text-amber-600',
    info: 'text-blue-600',
    debug: 'text-gray-400',
    log: 'text-gray-700',
  };
  return (
    <>
      {items.map((c, i) => {
        const p = c.payload as ConsoleEventPayload;
        return (
          <Row key={i} onClick={() => onSeek(c.offset)}>
            <span className="w-10 shrink-0 font-mono text-gray-400">{offsetLabel(c.offset)}</span>
            <span className={cn('shrink-0 font-mono uppercase', levelColor[p.level])}>{p.level}</span>
            <span className="truncate font-mono text-gray-700">{p.args.join(' ')}</span>
          </Row>
        );
      })}
    </>
  );
}

function formatBytes(bytes?: number): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildCurl(p: NetworkEventPayload): string {
  const parts = [`curl -X ${p.method} '${p.url}'`];
  for (const [k, v] of Object.entries(p.reqHeaders ?? {})) {
    parts.push(`  -H '${k}: ${String(v).replace(/'/g, "'\\''")}'`);
  }
  if (p.reqBody) {
    parts.push(`  --data-raw '${p.reqBody.replace(/'/g, "'\\''")}'`);
  }
  return parts.join(' \\\n');
}

function HeaderTable({ headers }: { headers: Record<string, string> }) {
  const entries = Object.entries(headers);
  if (entries.length === 0) return <p className="text-xs text-gray-400">No headers captured.</p>;
  return (
    <table className="w-full text-xs">
      <tbody>
        {entries.map(([k, v]) => (
          <tr key={k} className="align-top">
            <td className="py-0.5 pr-3 font-mono font-medium text-gray-500">{k}</td>
            <td className="py-0.5 font-mono break-all text-gray-700">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function NetworkRow({
  item,
  onSeek,
  onCopyCurl,
}: {
  item: CustomItem;
  onSeek: (o: number) => void;
  onCopyCurl: (p: NetworkEventPayload) => void;
}) {
  const [open, setOpen] = useState(false);
  const p = item.payload as NetworkEventPayload;
  const color =
    p.status === 0 || p.status >= 500
      ? 'text-red-600'
      : p.status >= 400
        ? 'text-amber-600'
        : 'text-green-600';
  const hasDetail =
    Boolean(p.statusText) ||
    Boolean(p.reqHeaders) ||
    Boolean(p.resHeaders) ||
    Boolean(p.reqBody) ||
    Boolean(p.resBody) ||
    p.reqSize != null ||
    p.resSize != null;

  return (
    <div className="border-b border-[var(--border)] last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-2 text-left text-xs hover:bg-gray-50"
      >
        <ChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 text-gray-400 transition', open && 'rotate-180')}
        />
        <span className="w-10 shrink-0 font-mono text-gray-400">{offsetLabel(item.offset)}</span>
        <span className="w-12 shrink-0 font-mono text-gray-500">{p.method}</span>
        <span className={cn('w-10 shrink-0 font-mono', color)}>{p.status || 'ERR'}</span>
        <span className="truncate font-mono text-gray-700">{p.url}</span>
        <span className="ml-auto shrink-0 text-gray-400">{Math.round(p.durationMs)}ms</span>
      </button>
      {open && (
        <div className="space-y-3 bg-gray-50 px-4 py-3 text-xs">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-500">
            <span>
              Status: <span className="font-mono text-gray-700">{p.status || 'ERR'}</span>
              {p.statusText ? ` ${p.statusText}` : ''}
            </span>
            <span>Request size: <span className="font-mono text-gray-700">{formatBytes(p.reqSize)}</span></span>
            <span>Response size: <span className="font-mono text-gray-700">{formatBytes(p.resSize)}</span></span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCopyCurl(p);
              }}
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-white px-2 py-1 font-medium text-gray-600 hover:bg-gray-50"
            >
              Copy as cURL
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSeek(item.offset);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-white px-2 py-1 font-medium text-gray-600 hover:bg-gray-50"
            >
              Jump to replay
            </button>
          </div>

          {!hasDetail && (
            <p className="text-gray-400">
              Header/body capture is off. Enable it under Settings → Capture → Network.
            </p>
          )}

          {(p.reqHeaders || p.reqBody) && (
            <div>
              <p className="mb-1 font-semibold uppercase tracking-wide text-gray-500">Request</p>
              {p.reqHeaders && <HeaderTable headers={p.reqHeaders} />}
              {p.reqBody && (
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-[var(--border)] bg-white p-2 font-mono text-gray-700">
                  {p.reqBody}
                  {p.reqBodyTruncated && <span className="text-gray-400"> … (truncated)</span>}
                </pre>
              )}
            </div>
          )}

          {(p.resHeaders || p.resBody) && (
            <div>
              <p className="mb-1 font-semibold uppercase tracking-wide text-gray-500">Response</p>
              {p.resHeaders && <HeaderTable headers={p.resHeaders} />}
              {p.resBody && (
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-[var(--border)] bg-white p-2 font-mono text-gray-700">
                  {p.resBody}
                  {p.resBodyTruncated && <span className="text-gray-400"> … (truncated)</span>}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NetworkPanel({
  items,
  onSeek,
  onCopyCurl,
}: {
  items: CustomItem[];
  onSeek: (o: number) => void;
  onCopyCurl: (p: NetworkEventPayload) => void;
}) {
  if (items.length === 0) return <PanelEmpty text="No network requests captured." />;
  return (
    <>
      {items.map((c, i) => (
        <NetworkRow key={i} item={c} onSeek={onSeek} onCopyCurl={onCopyCurl} />
      ))}
    </>
  );
}

const VITAL_META: Record<WebVitalEventPayload['name'], { label: string; unit: string }> = {
  LCP: { label: 'LCP', unit: 'ms' },
  FCP: { label: 'FCP', unit: 'ms' },
  TTFB: { label: 'TTFB', unit: 'ms' },
  CLS: { label: 'CLS', unit: '' },
};

function WebVitalsCard({ items }: { items: CustomItem[] }) {
  // Latest sample per metric (items are in event order).
  const latest = new Map<WebVitalEventPayload['name'], number>();
  for (const c of items) {
    const p = c.payload as WebVitalEventPayload;
    latest.set(p.name, p.value);
  }
  const order: WebVitalEventPayload['name'][] = ['LCP', 'FCP', 'TTFB', 'CLS'];
  const present = order.filter((name) => latest.has(name));
  if (present.length === 0) return null;

  return (
    <Card className="h-fit p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Gauge className="h-4 w-4 text-gray-400" />
        Web Vitals
      </h3>
      <dl className="grid grid-cols-2 gap-3">
        {present.map((name) => {
          const meta = VITAL_META[name];
          const value = latest.get(name)!;
          const display = name === 'CLS' ? value.toFixed(3) : String(Math.round(value));
          return (
            <div key={name} className="rounded-lg border border-[var(--border)] p-2">
              <dt className="text-xs font-medium text-gray-500">{meta.label}</dt>
              <dd className="mt-0.5 text-lg font-semibold">
                {display}
                {meta.unit && <span className="ml-0.5 text-xs font-normal text-gray-400">{meta.unit}</span>}
              </dd>
            </div>
          );
        })}
      </dl>
    </Card>
  );
}

function IssuesPanel({ items, onSeek }: { items: CustomItem[]; onSeek: (o: number) => void }) {
  if (items.length === 0)
    return <PanelEmpty text="No errors, rage clicks, or dead clicks detected." />;
  return (
    <>
      {items.map((c, i) => {
        if (c.tag === CUSTOM_EVENT_TAGS.rage) {
          const p = c.payload as RageEventPayload;
          return (
            <Row key={i} onClick={() => onSeek(c.offset)}>
              <span className="w-10 shrink-0 font-mono text-gray-400">{offsetLabel(c.offset)}</span>
              <MousePointerClick className="h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span className="truncate text-gray-700">
                Rage click ×{p.count} on <span className="font-mono">{p.selector}</span>
              </span>
            </Row>
          );
        }
        if (c.tag === CUSTOM_EVENT_TAGS.deadClick) {
          const p = c.payload as DeadClickEventPayload;
          return (
            <Row key={i} onClick={() => onSeek(c.offset)}>
              <span className="w-10 shrink-0 font-mono text-gray-400">{offsetLabel(c.offset)}</span>
              <MousePointer2 className="h-3.5 w-3.5 shrink-0 text-gray-500" />
              <span className="truncate text-gray-700">
                Dead click on <span className="font-mono">{p.selector}</span>
                <span className="text-gray-400"> ({Math.round(p.x)}, {Math.round(p.y)})</span>
              </span>
            </Row>
          );
        }
        const p = c.payload as ErrorEventPayload;
        return (
          <Row key={i} onClick={() => onSeek(c.offset)}>
            <span className="w-10 shrink-0 font-mono text-gray-400">{offsetLabel(c.offset)}</span>
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600" />
            <span className="truncate text-gray-700">{p.message}</span>
          </Row>
        );
      })}
    </>
  );
}
