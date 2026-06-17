'use client';

import { Field, Input, Switch } from './ui';

export interface StorageValue {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

export const emptyStorage: StorageValue = {
  endpoint: '',
  region: 'us-east-1',
  bucket: '',
  accessKeyId: '',
  secretAccessKey: '',
  forcePathStyle: false,
};

export function StorageFields({
  value,
  onChange,
  secretPlaceholder,
}: {
  value: StorageValue;
  onChange: (v: StorageValue) => void;
  secretPlaceholder?: string;
}) {
  const set = (patch: Partial<StorageValue>) => onChange({ ...value, ...patch });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field
        label="Endpoint"
        hint="Leave empty for AWS S3. Set for MinIO, Cloudflare R2, Backblaze, etc."
      >
        <Input
          value={value.endpoint}
          // Strip any leading protocol so the field always holds a bare host.
          onChange={(e) => set({ endpoint: e.target.value.replace(/^\s*https?:\/\//i, '') })}
          placeholder="s3.example.com"
        />
      </Field>
      <Field label="Region">
        <Input value={value.region} onChange={(e) => set({ region: e.target.value })} placeholder="us-east-1" />
      </Field>
      <Field label="Bucket">
        <Input value={value.bucket} onChange={(e) => set({ bucket: e.target.value })} placeholder="my-replay-bucket" />
      </Field>
      <Field label="Access key ID">
        <Input value={value.accessKeyId} onChange={(e) => set({ accessKeyId: e.target.value })} />
      </Field>
      <Field label="Secret access key" hint={secretPlaceholder ? 'Leave blank to keep the saved secret.' : undefined}>
        <Input
          type="password"
          value={value.secretAccessKey}
          onChange={(e) => set({ secretAccessKey: e.target.value })}
          placeholder={secretPlaceholder}
        />
      </Field>
      <div className="flex items-center justify-between sm:col-span-2">
        <div>
          <p className="text-sm font-medium text-gray-700">Force path-style URLs</p>
          <p className="text-xs text-gray-500">Required by MinIO and some S3-compatible providers.</p>
        </div>
        <Switch checked={value.forcePathStyle} onChange={(v) => set({ forcePathStyle: v })} />
      </div>
    </div>
  );
}
