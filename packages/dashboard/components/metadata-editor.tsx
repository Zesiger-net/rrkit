'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { MetadataFieldInput, MetadataFieldType } from '@rrkit/shared';
import { Button, Input, Select, Switch } from './ui';

const TYPES: MetadataFieldType[] = ['string', 'number', 'boolean', 'email'];

export function MetadataEditor({
  value,
  onChange,
}: {
  value: MetadataFieldInput[];
  onChange: (v: MetadataFieldInput[]) => void;
}) {
  const update = (i: number, patch: Partial<MetadataFieldInput>) => {
    const next = value.slice();
    next[i] = { ...next[i]!, ...patch };
    onChange(next);
  };
  const add = () => onChange([...value, { key: '', label: '', type: 'string', filterable: true }]);
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));

  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <div className="hidden grid-cols-12 gap-2 px-1 text-xs font-medium text-gray-500 sm:grid">
          <div className="col-span-3">Label</div>
          <div className="col-span-3">Key (used in SDK)</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-2">Filterable</div>
          <div className="col-span-2" />
        </div>
      )}
      {value.map((field, i) => (
        <div key={i} className="grid grid-cols-12 items-center gap-2">
          <div className="col-span-12 sm:col-span-3">
            <Input
              placeholder="Email"
              value={field.label}
              onChange={(e) => update(i, { label: e.target.value })}
            />
          </div>
          <div className="col-span-12 sm:col-span-3">
            <Input
              placeholder="user_email"
              value={field.key}
              onChange={(e) => update(i, { key: e.target.value })}
              className="font-mono"
            />
          </div>
          <div className="col-span-6 sm:col-span-2">
            <Select value={field.type} onChange={(e) => update(i, { type: e.target.value as MetadataFieldType })}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
          <div className="col-span-4 sm:col-span-2">
            <Switch checked={field.filterable} onChange={(v) => update(i, { filterable: v })} />
          </div>
          <div className="col-span-2 flex justify-end">
            <button
              onClick={() => remove(i)}
              className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-red-600"
              aria-label="Remove field"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
      <Button variant="secondary" onClick={add}>
        <Plus className="h-4 w-4" />
        Add field
      </Button>
    </div>
  );
}
