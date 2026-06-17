'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { LogOut, MonitorPlay, Settings as SettingsIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useStatus } from '@/lib/queries';
import { FullScreenLoader } from './loader';

export function AppShell({ active, children }: { active: 'sessions' | 'settings'; children: ReactNode }) {
  const router = useRouter();
  const { data, isLoading } = useStatus();

  useEffect(() => {
    if (!data) return;
    if (!data.setupComplete) router.replace('/setup');
    else if (!data.authed) router.replace('/login');
  }, [data, router]);

  if (isLoading || !data || !data.setupComplete || !data.authed) {
    return <FullScreenLoader />;
  }

  const logout = async () => {
    await api.post('/auth/logout').catch(() => {});
    router.replace('/login');
  };

  const nav = [
    { key: 'sessions', label: 'Sessions', href: '/sessions', icon: MonitorPlay },
    { key: 'settings', label: 'Settings', href: '/settings', icon: SettingsIcon },
  ];

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-[var(--border)] bg-white px-3 py-4">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-sm font-bold text-brand-fg">
            r
          </div>
          <span className="text-base font-semibold">rrkit</span>
        </div>
        <nav className="flex-1 space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition',
                  active === item.key ? 'bg-brand-muted text-brand' : 'text-gray-600 hover:bg-gray-100',
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={logout}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
        <div className="mt-2 px-3 text-xs text-gray-400">v{data.version}</div>
      </aside>
      <main className="flex-1 overflow-x-hidden px-8 py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
