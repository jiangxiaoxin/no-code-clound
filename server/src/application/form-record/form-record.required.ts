import { BadRequestException } from '@nestjs/common';
import { flattenFields } from './flatten-fields';
import { FormField } from './form-record.types';

const SKIP_REQUIRED_TYPES = new Set([
  'subform',
  'divider',
  'currentUser',
  'currentUserDept',
  'relate-subform',
  'tabs',
]);

function isMainFieldEmpty(field: FormField, value: unknown): boolean {
  if (value === undefined || value === null || value === '') {
    return true;
  }
  if (
    field.type === 'checkbox' ||
    field.type === 'select-multiple' ||
    field.type === 'image' ||
    field.type === 'file' ||
    field.type === 'member-multiple' ||
    field.type === 'dept-multiple'
  ) {
    return !Array.isArray(value) || value.length === 0;
  }
  if (field.type === 'member' || field.type === 'dept') {
    return typeof value !== 'number' || !Number.isInteger(value) || value <= 0;
  }
  if (field.type === 'address') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return true;
    }
    const ids = (value as { ids?: unknown }).ids;
    return !Array.isArray(ids) || ids.length === 0;
  }
  return false;
}

export function assertRequiredFields(
  fields: FormField[] | null,
  data: Record<string, unknown>,
  keys: string[] | 'all',
): void {
  const wanted = keys === 'all' ? null : new Set(keys);
  for (const field of flattenFields(fields ?? [])) {
    if (field.visible === false || !field.required || !field.key) continue;
    if (SKIP_REQUIRED_TYPES.has(field.type)) continue;
    if (field.formula) continue;
    if (wanted && !wanted.has(field.key)) continue;
    if (isMainFieldEmpty(field, data[field.key])) {
      throw new BadRequestException(`请填写${field.title || '未命名'}`);
    }
  }
}
