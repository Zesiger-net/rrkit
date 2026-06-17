import { Spinner } from './ui';

export function FullScreenLoader() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Spinner className="h-7 w-7" />
        <span className="text-sm text-gray-400">Loading…</span>
      </div>
    </div>
  );
}
