import { FormField } from './form-record.types';

export const FILTERABLE_TYPES: ReadonlySet<string> = new Set([
  'input',
  'textarea',
  'number',
  'date',
  'time',
  'datetime',
  'radio',
  'checkbox',
  'select',
  'select-multiple',
  'member',
  'dept',
  'data',
  'relate',
]);

export const SYSTEM_INDEX_NAMES = ['idx_createdAt', 'idx_createdBy'] as const;

export function collectionName(formId: number): string {
  return `frm_${formId}`;
}

export function dataIndexName(fieldKey: string): string {
  return `idx_data_${fieldKey}`;
}

export function targetDataIndexNames(
  fields: FormField[] | null | undefined,
): string[] {
  if (!fields) {
    return [];
  }
  return fields
    .filter((field) => FILTERABLE_TYPES.has(field.type))
    .map((field) => dataIndexName(field.key));
}
