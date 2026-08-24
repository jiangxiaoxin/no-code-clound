import { FormField } from './form-record/form-record.types';

export function normalizeColumns(value: unknown): 1 | 2 | 3 | 4 {
  return value === 2 || value === 3 || value === 4 ? value : 1;
}

export function parseFormSchema(raw: unknown): {
  columns: 1 | 2 | 3 | 4;
  fields: FormField[] | null;
} {
  if (Array.isArray(raw)) {
    return { columns: 1, fields: raw as FormField[] };
  }
  if (
    raw &&
    typeof raw === 'object' &&
    Array.isArray((raw as { fields?: unknown }).fields)
  ) {
    const row = raw as { columns?: unknown; fields: FormField[] };
    return {
      columns: normalizeColumns(row.columns),
      fields: row.fields,
    };
  }
  return { columns: 1, fields: null };
}

export function serializeFormSchema(
  fields: Record<string, unknown>[],
  columns?: number,
): Record<string, unknown>[] | { columns: number; fields: Record<string, unknown>[] } {
  const next = normalizeColumns(columns);
  if (next === 1) {
    return fields;
  }
  return { columns: next, fields };
}
