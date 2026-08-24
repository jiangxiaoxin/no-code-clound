import { BadRequestException } from '@nestjs/common';
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

function coerceFieldValue(field: FormField, value: unknown): unknown {
  switch (field.type) {
    case 'divider':
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
    case 'file':
      if (typeof value === 'string') return value;
      if (
        Array.isArray(value) &&
        value.every((item) => typeof item === 'string')
      ) {
        return value;
      }
      invalid();
    case 'subform':
      return Array.isArray(value) ? value : [];
    default:
      return value;
  }
}

export function coerceRecordData(
  fields: FormField[] | null | undefined,
  input: unknown,
): Record<string, unknown> {
  const src = requireObject(input);
  const out: Record<string, unknown> = {};
  for (const field of fields ?? []) {
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
  const fieldMap = new Map((fields ?? []).map((field) => [field.key, field]));
  const next = { ...existing };
  for (const [key, value] of Object.entries(patch)) {
    const field = fieldMap.get(key);
    if (!field) continue;
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
