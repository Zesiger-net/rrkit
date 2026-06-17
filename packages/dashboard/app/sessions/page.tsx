'use client';

import { AppShell } from '@/components/app-shell';
import SessionsView from '@/components/sessions-view';

export default function SessionsPage() {
  return (
    <AppShell active="sessions">
      <SessionsView />
    </AppShell>
  );
}
