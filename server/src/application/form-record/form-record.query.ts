import { BadRequestException } from '@nestjs/common';
import { FILTERABLE_TYPES } from './form-record.indexes';
import { FormField } from './form-record.types';

export type RecordFilter = { key: string; op: string; value: unknown };
export type RecordSort = { key: string; order?: string };
export type RecordQueryBody = {
  filters?: RecordFilter[];
  match?: 'all' | 'any';
  sort?: RecordSort;
  page?: number;
  pageSize?: number;
};

const STRING_CONTAINS_TYPES = new Set([
  'input',
  'textarea',
  'time',
  'radio',
  'select',
  'date',
]);
const RANGE_TYPES = new Set(['number', 'date', 'datetime']);

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function unsupported(): never {
  throw new BadRequestException('不支持该筛选');
}

function resolvePath(
  key: string,
  fields: FormField[] | null | undefined,
): { path: string; type: string } {
  if (key === 'createdAt') return { path: 'createdAt', type: 'createdAt' };
  if (key === 'updatedAt') return { path: 'updatedAt', type: 'updatedAt' };
  if (key === 'createdBy') return { path: 'createdBy', type: 'createdBy' };
  const field = (fields ?? []).find((item) => item.key === key);
  if (!field || !FILTERABLE_TYPES.has(field.type)) unsupported();
  return { path: `data.${key}`, type: field.type };
}

function asDateIfNeeded(type: string, value: unknown): unknown {
  if (type === 'number' && typeof value === 'string' && value !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  if (
    (type === 'datetime' || type === 'createdAt') &&
    typeof value === 'string'
  ) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) unsupported();
    return date;
  }
  return value;
}

function emptyClause(path: string): Record<string, unknown> {
  return {
    $or: [
      { [path]: { $exists: false } },
      { [path]: null },
      { [path]: '' },
      { [path]: [] },
    ],
  };
}

function containsClause(
  type: string,
  path: string,
  value: unknown,
): Record<string, unknown> {
  if (type === 'createdAt' || type === 'createdBy') unsupported();
  if (!STRING_CONTAINS_TYPES.has(type) || typeof value !== 'string') {
    unsupported();
  }
  return { [path]: { $regex: escapeRegex(value), $options: 'i' } };
}

function buildClause(
  type: string,
  path: string,
  op: string,
  value: unknown,
): Record<string, unknown> {
  if (type === 'createdBy' && op !== 'eq' && op !== 'in') unsupported();
  const prepared = asDateIfNeeded(type, value);
  if (op === 'eq') return { [path]: prepared };
  if (op === 'ne') return { [path]: { $ne: prepared } };
  if (op === 'in') {
    if (!Array.isArray(value)) unsupported();
    const items = value.map((item) => asDateIfNeeded(type, item));
    return { [path]: { $in: items } };
  }
  if (op === 'contains') return containsClause(type, path, value);
  if (op === 'ncontains') {
    const clause = containsClause(type, path, value);
    const regex = (clause[path] as { $regex: string; $options: string });
    return { [path]: { $not: regex } };
  }
  if (op === 'empty') return emptyClause(path);
  if (op === 'nempty') return { $nor: [emptyClause(path)] };
  if (op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte') {
    if (type !== 'createdAt' && !RANGE_TYPES.has(type)) unsupported();
    return { [path]: { [`$${op}`]: prepared } };
  }
  unsupported();
}

function combineClauses(
  clauses: Record<string, unknown>[],
  match?: string,
): Record<string, unknown> {
  if (match && match !== 'all' && match !== 'any') unsupported();
  if (!clauses.length) return {};
  if (clauses.length === 1) return clauses[0];
  if (match === 'any') return { $or: clauses };
  return Object.assign({}, ...clauses);
}

export function buildRecordQuery(
  fields: FormField[] | null | undefined,
  body: RecordQueryBody,
): {
  filter: Record<string, unknown>;
  sort: Record<string, 1 | -1>;
  skip: number;
  limit: number;
  page: number;
  pageSize: number;
} {
  const page = body.page ?? 1;
  const pageSize = body.pageSize ?? 20;
  if (
    !Number.isInteger(page) ||
    !Number.isInteger(pageSize) ||
    page < 1 ||
    pageSize < 1 ||
    pageSize > 100
  ) {
    throw new BadRequestException('分页大小不正确');
  }

  const clauses = (body.filters ?? []).map((item) => {
    const resolved = resolvePath(item.key, fields);
    return buildClause(resolved.type, resolved.path, item.op, item.value);
  });
  const filter = combineClauses(clauses, body.match);

  const sortKey = body.sort?.key ?? 'updatedAt';
  const orderRaw = body.sort?.order ?? 'desc';
  if (orderRaw !== 'asc' && orderRaw !== 'desc') unsupported();
  const resolvedSort = resolvePath(sortKey, fields);
  const sort = { [resolvedSort.path]: orderRaw === 'asc' ? 1 : -1 } as Record<
    string,
    1 | -1
  >;

  return {
    filter,
    sort,
    skip: (page - 1) * pageSize,
    limit: pageSize,
    page,
    pageSize,
  };
}
