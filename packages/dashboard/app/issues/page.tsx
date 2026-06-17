'use client';

import { AppShell } from '@/components/app-shell';
import IssuesView from '@/components/issues-view';

export default function IssuesPage() {
  return (
    <AppShell active="issues">
      <IssuesView />
    </AppShell>
  );
}
