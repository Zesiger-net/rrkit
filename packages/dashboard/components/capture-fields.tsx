'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button, Field, Input, Switch } from './ui';

/* ------------------------------------------------------------------ *
 * Collapsible "Advanced" section. Common toggles stay prominent; the
 * deeper knobs are tucked away behind these.
 * ------------------------------------------------------------------ */
export function Collapsible({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-[var(--border)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
      >
        <div>
          <p className="text-sm font-semibold text-gray-800">{title}</p>
          {description && <p className="mt-0.5 text-xs text-gray-500">{description}</p>}
        </div>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-gray-400 transition', open && 'rotate-180')}
        />
      </button>
      {open && <div className="border-t border-[var(--border)] p-4">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * A labelled toggle row, matching the existing capture-tab styling.
 * ------------------------------------------------------------------ */
export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {hint && <p className="text-xs text-gray-500">{hint}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Editor for a string[] field. Stores one entry per line; we split /
 * join on save so the value is robust to stray whitespace.
 * ------------------------------------------------------------------ */
export function StringListField({
  label,
  hint,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  placeholder?: string;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <textarea
        className="input-base min-h-[80px] font-mono text-xs"
        placeholder={placeholder}
        value={value.join('\n')}
        onChange={(e) =>
          onChange(
            e.target.value
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
      />
    </Field>
  );
}

/* ------------------------------------------------------------------ *
 * Editor for a Record<string, string> field (e.g. metadataAllow).
 * ------------------------------------------------------------------ */
type KvPair = [string, string];

export function KeyValueField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const pairs: KvPair[] = Object.entries(value);
  const emit = (next: KvPair[]) => {
    const obj: Record<string, string> = {};
    for (const [k, v] of next) if (k.trim()) obj[k.trim()] = v;
    onChange(obj);
  };
  const update = (i: number, patch: Partial<{ k: string; v: string }>) => {
    const next = pairs.slice();
    const [k, v] = next[i]!;
    next[i] = [patch.k ?? k, patch.v ?? v];
    emit(next);
  };
  const add = () => emit([...pairs, ['', '']]);
  const remove = (i: number) => emit(pairs.filter((_, j) => j !== i));

  return (
    <Field label={label} hint={hint}>
      <div className="space-y-2">
        {pairs.map(([k, v], i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              placeholder="key"
              value={k}
              onChange={(e) => update(i, { k: e.target.value })}
              className="font-mono"
            />
            <span className="text-gray-400">=</span>
            <Input
              placeholder="value"
              value={v}
              onChange={(e) => update(i, { v: e.target.value })}
              className="font-mono"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-red-600"
              aria-label="Remove entry"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <Button variant="secondary" onClick={add}>
          <Plus className="h-4 w-4" />
          Add entry
        </Button>
      </div>
    </Field>
  );
}
