import type { MetadataField, MetadataFieldInput } from '@rrkit/shared';
import { getDb } from './connection';
import { isValidFieldKey, reconcileMetadataColumns } from './migrate';

interface FieldRow {
  id: number;
  key: string;
  label: string;
  type: string;
  filterable: number;
  created: string;
}

function toField(row: FieldRow): MetadataField {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    type: row.type as MetadataField['type'],
    filterable: row.filterable === 1,
    created: row.created,
  };
}

export const metadataFieldsRepo = {
  list(): MetadataField[] {
    const rows = getDb()
      .prepare('SELECT * FROM metadata_fields ORDER BY id ASC')
      .all() as FieldRow[];
    return rows.map(toField);
  },

  filterableKeys(): string[] {
    const rows = getDb()
      .prepare('SELECT key FROM metadata_fields WHERE filterable = 1 ORDER BY id ASC')
      .all() as Array<{ key: string }>;
    return rows.map((r) => r.key);
  },

  keys(): string[] {
    const rows = getDb()
      .prepare('SELECT key FROM metadata_fields ORDER BY id ASC')
      .all() as Array<{ key: string }>;
    return rows.map((r) => r.key);
  },

  /** Replace the full set of field definitions (used by setup + settings). */
  replaceAll(fields: MetadataFieldInput[]): MetadataField[] {
    const db = getDb();
    const now = new Date().toISOString();
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM metadata_fields').run();
      const insert = db.prepare(
        'INSERT INTO metadata_fields (key, label, type, filterable, created) VALUES (?, ?, ?, ?, ?)',
      );
      for (const f of fields) {
        if (!isValidFieldKey(f.key)) {
          throw new Error(`Invalid metadata field key: ${f.key}`);
        }
        insert.run(f.key, f.label, f.type, f.filterable ? 1 : 0, now);
      }
    });
    tx();
    // Add any new indexed generated columns for newly-filterable fields.
    reconcileMetadataColumns(db);
    return this.list();
  },
};
