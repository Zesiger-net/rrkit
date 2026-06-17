import { cn } from '@/lib/cn';

/**
 * The rrkit wordmark: just the name set in "Bitcount Prop Single", dark blue.
 * Size is controlled by the caller via a text-size class.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('font-logo font-normal leading-none text-[#1e3a8a]', className)}>
      rrkit
    </span>
  );
}
