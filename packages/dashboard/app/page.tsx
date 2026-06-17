'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Logo } from '@/components/logo';
import { useStatus } from '@/lib/queries';

export default function Home() {
  const router = useRouter();
  const { data } = useStatus();

  useEffect(() => {
    if (!data || !data.authed) return;
    if (!data.setupComplete) router.replace('/setup');
    else router.replace('/sessions');
  }, [data, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Logo className="text-6xl" />
    </div>
  );
}
