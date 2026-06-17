'use client';

import { AlertTriangle, MousePointer2, MousePointerClick, Bug } from 'lucide-react';
import type { IssueRecord } from '@rrkit/shared';
import { cn } from '@/lib/cn';
import { formatRelative, truncate } from '@/lib/format';
import { useFrustration, useIssues } from '@/lib/queries';
import { Card, EmptyState, PageHeader, Skeleton } from '@/components/ui';

export default function IssuesView() {
  const frustration = useFrustration(15_000);
  const issues = useIssues(15_000);

  const f = frustration.data;

  return (
    <div>
      <PageHeader
        title="Issues"
        description="Cross-session errors and frustration signals. Grouped by error fingerprint."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Error issues"
          value={f?.errorIssues}
          icon={<Bug className="h-4 w-4" />}
          color="red"
        />
        <StatCard
          label="Total errors"
          value={f?.errors}
          icon={<AlertTriangle className="h-4 w-4" />}
          color="red"
        />
        <StatCard
          label="Rage clicks"
          value={f?.rage}
          icon={<MousePointerClick className="h-4 w-4" />}
          color="amber"
        />
        <StatCard
          label="Dead clicks"
          value={f?.deadclick}
          icon={<MousePointer2 className="h-4 w-4" />}
          color="gray"
        />
      </div>

      <h2 className="mb-3 text-sm font-semibold">Error issues</h2>
      <IssuesTable items={issues.data?.items} isLoading={issues.isLoading} />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value?: number;
  icon: React.ReactNode;
  color: 'red' | 'amber' | 'gray';
}) {
  const tint: Record<string, string> = {
    red: 'text-red-600',
    amber: 'text-amber-600',
    gray: 'text-gray-500',
  };
  return (
    <Card className="p-4">
      <div className={cn('flex items-center gap-2 text-xs font-medium text-gray-500')}>
        <span className={tint[color]}>{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold">{value ?? '—'}</div>
    </Card>
  );
}

function IssuesTable({ items, isLoading }: { items?: IssueRecord[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Card className="divide-y divide-[var(--border)]">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="ml-auto h-4 w-12" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </Card>
    );
  }

  if (!items || items.length === 0) {
    return (
      <EmptyState
        title="No issues yet"
        description="Errors captured across sessions will be grouped here by fingerprint."
      />
    );
  }

  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="px-4 py-3 font-medium">Message</th>
            <th className="px-4 py-3 font-medium">Count</th>
            <th className="px-4 py-3 font-medium">Sessions</th>
            <th className="px-4 py-3 font-medium">First seen</th>
            <th className="px-4 py-3 font-medium">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.fingerprint} className="border-b border-[var(--border)] last:border-0">
              <td className="px-4 py-3">
                <div className="font-medium text-gray-800" title={it.message}>
                  {truncate(it.message, 90)}
                </div>
                <div className="font-mono text-xs text-gray-400">{truncate(it.fingerprint, 16)}</div>
              </td>
              <td className="px-4 py-3 text-gray-600">{it.count}</td>
              <td className="px-4 py-3 text-gray-600">{it.sessions}</td>
              <td className="px-4 py-3 text-gray-500">{formatRelative(it.firstSeen)}</td>
              <td className="px-4 py-3 text-gray-500">{formatRelative(it.lastSeen)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
