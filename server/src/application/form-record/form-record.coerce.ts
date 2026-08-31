import { BadRequestException } from '@nestjs/common';
import { flattenFields } from './flatten-fields';
import { FormField } from './form-record.types';

function requireObject(input: unknown): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException('请提交记录数据');
  }
  return input as Record<string, unknown>;
}

function invalid(): never {
  throw new BadRequestException('字段值类型不正确');
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function fileBasename(path: string): string {
  const cleaned = String(path || '').split(/[?#]/)[0];
  return cleaned.split(/[\\/]/).filter(Boolean).pop() || '';
}

function coerceFileItem(item: unknown): { url: string; name: string } | null {
  if (typeof item === 'string') {
    const url = item.trim();
    if (!url) return null;
    return { url, name: fileBasename(url) || url };
  }
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const row = item as { url?: unknown; name?: unknown };
  const url = typeof row.url === 'string' ? row.url.trim() : '';
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  if (!url || !name) return null;
  return { url, name };
}

function coerceFileValue(value: unknown): { url: string; name: string }[] {
  if (typeof value === 'string') {
    const item = coerceFileItem(value);
    return item ? [item] : invalid();
  }
  if (!Array.isArray(value)) invalid();
  return value
    .map((item) => coerceFileItem(item))
    .filter((item): item is { url: string; name: string } => Boolean(item));
}

const SUBFORM_MAX_ROWS = 200;

function isCoercedEmpty(field: FormField, value: unknown): boolean {
  if (value === undefined || value === null || value === '') {
    return true;
  }
  if (
    field.type === 'checkbox' ||
    field.type === 'select-multiple' ||
    field.type === 'image' ||
    field.type === 'file'
  ) {
    return !Array.isArray(value) || value.length === 0;
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

function isSubformRowEmpty(
  fields: FormField[],
  row: Record<string, unknown>,
): boolean {
  return fields.every((field) => isCoercedEmpty(field, row[field.key]));
}

function coerceSubformValue(field: FormField, value: unknown): unknown {
  if (!Array.isArray(value)) {
    return [];
  }
  const children = field.fields ?? [];
  if (!children.length) {
    return [];
  }
  const rows: Record<string, unknown>[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      continue;
    }
    const row = coerceRecordData(children, raw);
    if (isSubformRowEmpty(children, row)) {
      continue;
    }
    rows.push(row);
  }
  if (rows.length > SUBFORM_MAX_ROWS) {
    throw new BadRequestException('子表单最多 200 行');
  }
  return rows;
}

function coerceFieldValue(field: FormField, value: unknown): unknown {
  switch (field.type) {
    case 'divider':
    case 'tabs':
    case 'currentUser':
    case 'currentUserDept':
    case 'serialNumber':
      return undefined;
    case 'input':
    case 'textarea':
    case 'time':
    case 'radio':
    case 'select':
    case 'data':
    case 'relate':
      return typeof value === 'string' ? value : invalid();
    case 'number':
      if (isEmpty(value)) return undefined;
      return typeof value === 'number' && Number.isFinite(value)
        ? value
        : invalid();
    case 'date':
      if (isEmpty(value)) return undefined;
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? value
        : invalid();
    case 'datetime':
      if (isEmpty(value)) return undefined;
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        invalid();
      }
      return new Date(value as string);
    case 'checkbox':
    case 'select-multiple':
      return Array.isArray(value) &&
        value.every((item) => typeof item === 'string')
        ? value
        : invalid();
    case 'member':
    case 'dept':
      if (isEmpty(value)) return undefined;
      return typeof value === 'number' && Number.isInteger(value)
        ? value
        : invalid();
    case 'image':
      if (typeof value === 'string') return value;
      if (
        Array.isArray(value) &&
        value.every((item) => typeof item === 'string')
      ) {
        return value;
      }
      return invalid();
    case 'file':
      return coerceFileValue(value);
    case 'address': {
      if (isEmpty(value)) return undefined;
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        invalid();
      }
      const row = value as { ids?: unknown; labels?: unknown; detail?: unknown };
      if (!Array.isArray(row.ids) || !Array.isArray(row.labels)) invalid();
      if (row.ids.length !== row.labels.length) invalid();
      if (!row.ids.every((item) => typeof item === 'string')) invalid();
      if (!row.labels.every((item) => typeof item === 'string')) invalid();
      if (row.ids.length === 0) return undefined;
      const next: { ids: string[]; labels: string[]; detail?: string } = {
        ids: row.ids,
        labels: row.labels,
      };
      if (typeof row.detail === 'string') {
        const detail = row.detail.trim().slice(0, 256);
        if (detail) next.detail = detail;
      } else if (row.detail != null) {
        invalid();
      }
      return next;
    }
    case 'subform':
      return coerceSubformValue(field, value);
    default:
      return value;
  }
}

/**
 * 
 * @param fields 
 * @param input 
 * @returns 对数据进行强制整理后返回整理后的数据
 */
export function coerceRecordData(
  fields: FormField[] | null | undefined,
  input: unknown,
): Record<string, unknown> {
  const src = requireObject(input);
  const out: Record<string, unknown> = {};
  for (const field of flattenFields(fields ?? [])) {
    if (!(field.key in src)) continue;
    const coerced = coerceFieldValue(field, src[field.key]);
    if (coerced !== undefined) {
      out[field.key] = coerced;
    }
  }
  return out;
}

export function mergeRecordData(
  existing: Record<string, unknown>,
  patchInput: unknown,
  fields: FormField[] | null | undefined,
): Record<string, unknown> {
  const patch = requireObject(patchInput);
  const fieldMap = new Map(
    flattenFields(fields ?? []).map((field) => [field.key, field]),
  );
  const next = { ...existing };
  for (const [key, value] of Object.entries(patch)) {
    const field = fieldMap.get(key);
    if (!field) continue;
    if (field.type === 'serialNumber') continue;
    if (value === null) {
      delete next[key];
      continue;
    }
    const coerced = coerceFieldValue(field, value);
    if (coerced === undefined) {
      delete next[key];
    } else {
      next[key] = coerced;
    }
  }
  return next;
}
