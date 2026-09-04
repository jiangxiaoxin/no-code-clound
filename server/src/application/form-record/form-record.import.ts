import { FormField } from './form-record.types';
import { coerceRecordData } from './form-record.coerce';
import { flattenFields } from './flatten-fields';
import {
  ADDRESS_IMPORT_NOTE,
  addressImportExample,
  loadAddressTree,
  parseAddressImportCell,
} from './address-import';

export const IMPORT_SKIP_TYPES = new Set([
  'divider',
  'tabs',
  'currentUser',
  'currentUserDept',
  'image',
  'file',
  'subform',
  'member',
  'member-multiple',
  'dept',
  'dept-multiple',
  'data',
  'relate',
  'relate-subform',
  'serialNumber',
]);

export const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024;

export { ADDRESS_IMPORT_NOTE, addressImportExample };

type DictItem = { label?: string; value?: string };

export function importableFields(fields: FormField[] | null | undefined): FormField[] {
  return flattenFields(fields).filter(
    (field) => Boolean(field?.key) && !IMPORT_SKIP_TYPES.has(field.type),
  );
}

export function importHeaders(fields: FormField[]): string[] {
  const used = new Set<string>();
  return fields.map((field) => {
    const base = (field.title || field.key).trim() || field.key;
    let title = base;
    if (used.has(title)) {
      title = `${base}(${field.key.slice(0, 8)})`;
    }
    used.add(title);
    return title;
  });
}

function isEmptyCell(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

export function headerFromCell(value: unknown): string {
  const next = unwrapCell(value);
  if (isEmptyCell(next)) return '';
  if (typeof next === 'string') return next.trim();
  if (typeof next === 'number') return String(next);
  return String(next).trim();
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function unwrapCell(value: unknown): unknown {
  if (isEmptyCell(value)) return undefined;
  if (typeof value !== 'object') return value;
  const cell = value as {
    richText?: { text?: string }[];
    text?: string;
    result?: unknown;
    hyperlink?: string;
  };
  if (Array.isArray(cell.richText)) {
    return cell.richText.map((item) => item?.text || '').join('');
  }
  if (typeof cell.text === 'string' && cell.text) return cell.text;
  if ('result' in cell) return unwrapCell(cell.result);
  return value;
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function splitMulti(value: string): string[] {
  return value
    .split(/[、,;；]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function matchDictValue(
  items: DictItem[] | undefined,
  raw: string,
): string | undefined {
  const list = items || [];
  const found = list.find(
    (item) => item.label === raw || String(item.value ?? '') === raw,
  );
  return found ? String(found.value ?? '') : undefined;
}

function parseCell(
  field: FormField,
  raw: unknown,
  dictItemsByCode: Record<string, DictItem[]>,
): { ok: boolean; value?: unknown } {
  const value = unwrapCell(raw);
  if (isEmptyCell(value)) return { ok: true, value: undefined };

  if (field.type === 'address') {
    const text =
      typeof value === 'string'
        ? value
        : typeof value === 'number'
          ? String(value)
          : '';
    return parseAddressImportCell(field, text, loadAddressTree(field));
  }

  if (field.type === 'number') {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return { ok: true, value };
    }
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
      return { ok: true, value: Number(value) };
    }
    return { ok: false };
  }

  if (field.type === 'date') {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return { ok: true, value: formatDate(value) };
    }
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value.trim())) {
      return { ok: true, value: value.trim().slice(0, 10) };
    }
    return { ok: false };
  }

  if (field.type === 'datetime') {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return { ok: true, value: value.toISOString() };
    }
    if (typeof value === 'string' && value.trim() && !Number.isNaN(Date.parse(value))) {
      return { ok: true, value: value.trim() };
    }
    return { ok: false };
  }

  if (field.type === 'time') {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return { ok: true, value: formatTime(value) };
    }
    if (typeof value === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(value.trim())) {
      const parts = value.trim().split(':');
      const clock = `${pad(Number(parts[0]))}:${parts[1]}${parts[2] ? `:${parts[2]}` : ':00'}`;
      return { ok: true, value: clock };
    }
    return { ok: false };
  }

  if (field.type === 'checkbox' || field.type === 'select-multiple') {
    const parts =
      typeof value === 'number'
        ? [String(value)]
        : typeof value === 'string'
          ? splitMulti(value)
          : Array.isArray(value)
            ? value.map((item) => String(item))
            : null;
    if (!parts) return { ok: false };
    if ((field.optionSource || 'dictionary') === 'dictionary' && field.dictCode) {
      const mapped: string[] = [];
      for (const part of parts) {
        const next = matchDictValue(dictItemsByCode[field.dictCode], part);
        if (next === undefined) return { ok: false };
        mapped.push(next);
      }
      return { ok: true, value: mapped };
    }
    return { ok: true, value: parts };
  }

  const text =
    typeof value === 'string'
      ? value.trim()
      : typeof value === 'number'
        ? String(value)
        : value instanceof Date
          ? formatDate(value)
          : '';
  if (!text) return { ok: false };

  if (
    (field.type === 'radio' || field.type === 'select') &&
    (field.optionSource || 'dictionary') === 'dictionary' &&
    field.dictCode
  ) {
    const mapped = matchDictValue(dictItemsByCode[field.dictCode], text);
    if (mapped === undefined) return { ok: false };
    return { ok: true, value: mapped };
  }

  return { ok: true, value: text };
}

export function parseImportRows(
  headers: string[],
  rows: unknown[][],
  fields: FormField[] | null | undefined,
  dictItemsByCode: Record<string, DictItem[]> = {},
): Record<string, unknown>[] {
  const columns = importableFields(fields);
  const titles = importHeaders(columns);
  const fieldByTitle = new Map(titles.map((title, index) => [title, columns[index]]));
  const headerFields = headers.map((title) => fieldByTitle.get(title) ?? null);
  const accepted: Record<string, unknown>[] = [];

  for (const row of rows) {
    const raw: Record<string, unknown> = {};
    let seenValue = false;
    let invalid = false;
    headerFields.forEach((field, index) => {
      if (!field || invalid) return;
      const parsed = parseCell(field, row[index], dictItemsByCode);
      if (!parsed.ok) {
        invalid = true;
        return;
      }
      if (parsed.value !== undefined) {
        raw[field.key] = parsed.value;
        seenValue = true;
      }
    });
    if (invalid || !seenValue) continue;
    if (
      columns.some(
        (field) =>
          field.required &&
          (raw[field.key] === undefined ||
            (Array.isArray(raw[field.key]) &&
              (raw[field.key] as unknown[]).length === 0)),
      )
    ) {
      continue;
    }
    try {
      accepted.push(coerceRecordData(columns, raw));
    } catch {
      // 格式不对的行直接丢掉
    }
  }
  return accepted;
}
