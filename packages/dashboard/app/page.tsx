'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { FullScreenLoader } from '@/components/loader';
import { useStatus } from '@/lib/queries';

export default function Home() {
  const router = useRouter();
  const { data } = useStatus();

  useEffect(() => {
    if (!data) return;
    if (!data.setupComplete) router.replace('/setup');
    else if (!data.authed) router.replace('/login');
    else router.replace('/sessions');
  }, [data, router]);

  return <FullScreenLoader />;
}
