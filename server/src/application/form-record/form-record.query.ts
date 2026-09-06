import { BadRequestException } from '@nestjs/common';
import { ObjectId } from 'mongodb';
import { flattenFields } from './flatten-fields';
import { FILTERABLE_TYPES } from './form-record.indexes';
import { FormField } from './form-record.types';

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

function toObjectIds(list: unknown): ObjectId[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (item): item is string =>
        typeof item === 'string' && OBJECT_ID_RE.test(item),
    )
    .map((item) => new ObjectId(item));
}

export type DatePrecision =
  | 'year'
  | 'month'
  | 'day'
  | 'hour'
  | 'minute'
  | 'second';

export type RecordFilter = {
  key: string;
  op: string;
  value: unknown;
  /** 日期时间等于/包含时，按年/月/日/时/分/秒匹配一段时间，而不是精确到毫秒 */
  precision?: DatePrecision;
};
export type RecordSort = { key: string; order?: string };
export type RecordFilterGroup = {
  filters?: RecordFilter[];
  match?: 'all' | 'any';
};

export type RecordQueryBody = {
  filters?: RecordFilter[];
  match?: 'all' | 'any';
  groups?: RecordFilterGroup[];
  sort?: RecordSort | RecordSort[];
  page?: number;
  pageSize?: number;
  /** 只取这些数据（关联数据列表批量补显示字段用）；非法 id 丢弃 */
  ids?: string[];
  /** 排除这些数据（关联本表时排除正在编辑的自己） */
  excludeIds?: string[];
  workflowStatus?:
    | 'draft'
    | 'running'
    | 'approved'
    | 'rejected'
    | 'error';
  pickApproved?: boolean;
  formKind?: 'normal' | 'workflow';
};

const STRING_CONTAINS_TYPES = new Set([
  'input',
  'textarea',
  'time',
  'radio',
  'select',
  'select-multiple',
  'checkbox',
  'date',
  'serialNumber',
]);
const RANGE_TYPES = new Set(['number', 'date', 'time', 'datetime']);
const DICT_VALUE_OPS = new Set(['eq', 'ne', 'in']);

type DictItem = { label: string; value: string };

function fieldDictCode(field: FormField | undefined): string {
  if (field?.dictCode == null || field.dictCode === '') return '';
  return String(field.dictCode).trim();
}

function findField(
  fields: FormField[] | null | undefined,
  key: string,
): FormField | undefined {
  return flattenFields(fields).find((field) => field.key === key);
}

export function mapDictFilterValue(
  value: unknown,
  items: DictItem[],
): unknown {
  if (typeof value !== 'string' || !items.length) return value;
  if (items.some((item) => item.value === value)) return value;
  const found = items.find((item) => item.label === value);
  return found ? found.value : value;
}

export function dictCodesForFilters(
  fields: FormField[] | null | undefined,
  filters: RecordFilter[] | undefined,
): string[] {
  const codes: string[] = [];
  const seen = new Set<string>();
  for (const item of filters ?? []) {
    if (!DICT_VALUE_OPS.has(item.op)) continue;
    const code = fieldDictCode(findField(fields, item.key));
    if (!code || seen.has(code)) continue;
    seen.add(code);
    codes.push(code);
  }
  return codes;
}

export function rewriteDictFilterValues(
  fields: FormField[] | null | undefined,
  filters: RecordFilter[] | undefined,
  itemsByCode: Map<string, DictItem[]>,
): RecordFilter[] | undefined {
  if (!filters) return filters;
  return filters.map((item) => {
    if (!DICT_VALUE_OPS.has(item.op)) return item;
    const code = fieldDictCode(findField(fields, item.key));
    if (!code) return item;
    const items = itemsByCode.get(code) ?? [];
    if (item.op === 'in') {
      if (!Array.isArray(item.value)) return item;
      return {
        ...item,
        value: item.value.map((value) => mapDictFilterValue(value, items)),
      };
    }
    return { ...item, value: mapDictFilterValue(item.value, items) };
  });
}

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
  if (key === 'createdAt') return { path: 'createdAt', type: 'datetime' };
  if (key === 'updatedAt') return { path: 'updatedAt', type: 'datetime' };
  if (key === 'createdBy') return { path: 'createdBy', type: 'createdBy' };
  if (key === 'updatedBy') return { path: 'updatedBy', type: 'createdBy' };
  const field = findField(fields, key);
  if (!field || !FILTERABLE_TYPES.has(field.type)) unsupported();
  return { path: `data.${key}`, type: field.type };
}

function parseWallDateTime(
  value: string,
): { date: Date; hasSeconds: boolean } | null {
  const wall = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!wall) return null;
  return {
    date: new Date(
      Number(wall[1]),
      Number(wall[2]) - 1,
      Number(wall[3]),
      Number(wall[4]),
      Number(wall[5]),
      Number(wall[6] || 0),
    ),
    hasSeconds: wall[6] != null,
  };
}

function asDateIfNeeded(type: string, value: unknown): unknown {
  if (type === 'number' && typeof value === 'string' && value !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  if (type === 'createdBy') {
    if (typeof value === 'number' && Number.isInteger(value)) return value;
    if (typeof value === 'string' && value !== '') {
      const n = Number(value);
      if (Number.isInteger(n)) return n;
    }
    unsupported();
  }
  if (type === 'datetime' && typeof value === 'string') {
    const wall = parseWallDateTime(value);
    if (wall) return wall.date;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) unsupported();
    return date;
  }
  return value;
}

const DATE_PRECISIONS = new Set<DatePrecision>([
  'year',
  'month',
  'day',
  'hour',
  'minute',
  'second',
]);

function parseOffsetMinutes(value: string): number {
  if (value.endsWith('Z')) return 0;
  const match = value.match(/([+-])(\d{2}):?(\d{2})$/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '+' ? minutes : -minutes;
}

/**
 * 带时区的 ISO 时间按给定粒度转成左闭右开区间。日历分量取自字符串里的偏移，再换算成 UTC。
 */
function dateRangeForPrecision(
  value: unknown,
  precision: DatePrecision,
): { start: Date; end: Date } {
  if (typeof value !== 'string') unsupported();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) unsupported();

  const offsetMinutes = parseOffsetMinutes(value);
  const wallClock = new Date(parsed.getTime() + offsetMinutes * 60_000);
  const year = wallClock.getUTCFullYear();
  const month = wallClock.getUTCMonth();
  const day = wallClock.getUTCDate();
  const hour = wallClock.getUTCHours();
  const minute = wallClock.getUTCMinutes();
  const second = wallClock.getUTCSeconds();

  let startWallMs = Date.UTC(year, month, day, hour, minute, second, 0);
  if (precision === 'year') startWallMs = Date.UTC(year, 0, 1);
  else if (precision === 'month') startWallMs = Date.UTC(year, month, 1);
  else if (precision === 'day') startWallMs = Date.UTC(year, month, day);
  else if (precision === 'hour') {
    startWallMs = Date.UTC(year, month, day, hour);
  } else if (precision === 'minute') {
    startWallMs = Date.UTC(year, month, day, hour, minute);
  }

  const endWall = new Date(startWallMs);
  if (precision === 'year') endWall.setUTCFullYear(year + 1);
  else if (precision === 'month') endWall.setUTCMonth(month + 1);
  else if (precision === 'day') endWall.setUTCDate(day + 1);
  else if (precision === 'hour') endWall.setUTCHours(hour + 1);
  else if (precision === 'minute') endWall.setUTCMinutes(minute + 1);
  else endWall.setUTCSeconds(second + 1);

  return {
    start: new Date(startWallMs - offsetMinutes * 60_000),
    end: new Date(endWall.getTime() - offsetMinutes * 60_000),
  };
}

function hasExplicitOffset(value: string): boolean {
  return /Z$/i.test(value.trim()) || /[+-]\d{2}:\d{2}$/.test(value);
}

function inferDatetimePrecision(value: string): DatePrecision | undefined {
  const wall = parseWallDateTime(value);
  if (!wall) return undefined;
  return wall.hasSeconds ? 'second' : 'minute';
}

function localRangeForPrecision(
  d: Date,
  precision: DatePrecision,
): { start: Date; end: Date } {
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  const h = d.getHours();
  const min = d.getMinutes();
  const s = d.getSeconds();
  if (precision === 'year') {
    return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) };
  }
  if (precision === 'month') {
    return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1) };
  }
  if (precision === 'day') {
    return { start: new Date(y, m, day), end: new Date(y, m, day + 1) };
  }
  if (precision === 'hour') {
    return { start: new Date(y, m, day, h), end: new Date(y, m, day, h + 1) };
  }
  if (precision === 'minute') {
    return {
      start: new Date(y, m, day, h, min),
      end: new Date(y, m, day, h, min + 1),
    };
  }
  return {
    start: new Date(y, m, day, h, min, s),
    end: new Date(y, m, day, h, min, s + 1),
  };
}

function datetimeRange(
  value: unknown,
  precision: DatePrecision,
): { start: Date; end: Date } {
  if (typeof value !== 'string') unsupported();
  if (!hasExplicitOffset(value)) {
    const wall = parseWallDateTime(value);
    if (wall) return localRangeForPrecision(wall.date, precision);
  }
  return dateRangeForPrecision(value, precision);
}

function datePrecisionClause(
  path: string,
  value: unknown,
  precision: DatePrecision,
): Record<string, unknown> {
  const range = datetimeRange(value, precision);
  return { [path]: { $gte: range.start, $lt: range.end } };
}

function datePeriod(value: string): { start: string; end?: string } {
  if (/^\d{4}$/.test(value)) {
    return { start: `${value}-01-01`, end: `${Number(value) + 1}-01-01` };
  }
  if (/^\d{4}-\d{2}$/.test(value)) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const end =
      month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, '0')}-01`;
    return { start: `${value}-01`, end };
  }
  return { start: value };
}

function dateCompare(
  path: string,
  op: string,
  value: unknown,
): Record<string, unknown> {
  if (op === 'between') {
    if (!Array.isArray(value) || value.length !== 2) unsupported();
    if (typeof value[0] !== 'string' || typeof value[1] !== 'string') {
      unsupported();
    }
    const start = datePeriod(value[0]);
    const end = datePeriod(value[1]);
    return {
      [path]: end.end
        ? { $gte: start.start, $lt: end.end }
        : { $gte: start.start, $lte: end.start },
    };
  }
  if (typeof value !== 'string') unsupported();
  const period = datePeriod(value);
  if (op === 'eq') {
    return period.end
      ? { [path]: { $gte: period.start, $lt: period.end } }
      : { [path]: period.start };
  }
  if (op === 'ne') {
    return period.end
      ? { $nor: [{ [path]: { $gte: period.start, $lt: period.end } }] }
      : { [path]: { $ne: period.start } };
  }
  if (op === 'gte') return { [path]: { $gte: period.start } };
  if (op === 'gt') {
    return period.end
      ? { [path]: { $gte: period.end } }
      : { [path]: { $gt: period.start } };
  }
  if (op === 'lt') return { [path]: { $lt: period.start } };
  if (op === 'lte') {
    return period.end
      ? { [path]: { $lt: period.end } }
      : { [path]: { $lte: period.start } };
  }
  unsupported();
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
  if (type === 'createdAt' || type === 'createdBy' || type === 'updatedAt') {
    unsupported();
  }
  if (typeof value !== 'string') unsupported();
  if (type === 'number') {
    return {
      $expr: {
        $regexMatch: {
          input: { $toString: { $ifNull: [`$${path}`, ''] } },
          regex: escapeRegex(value),
          options: 'i',
        },
      },
    };
  }
  if (!STRING_CONTAINS_TYPES.has(type)) unsupported();
  return { [path]: { $regex: escapeRegex(value), $options: 'i' } };
}

function buildClause(
  type: string,
  path: string,
  op: string,
  value: unknown,
  precision?: DatePrecision,
): Record<string, unknown> {
  if (op === 'empty') return emptyClause(path);
  if (op === 'nempty') return { $nor: [emptyClause(path)] };
  if (
    type === 'createdBy' &&
    op !== 'eq' &&
    op !== 'ne' &&
    op !== 'in'
  ) {
    unsupported();
  }
  if (
    type === 'date' &&
    (op === 'eq' ||
      op === 'ne' ||
      op === 'gt' ||
      op === 'gte' ||
      op === 'lt' ||
      op === 'lte' ||
      op === 'between')
  ) {
    return dateCompare(path, op, value);
  }
  let resolvedPrecision = precision;
  if (
    resolvedPrecision === undefined &&
    type === 'datetime' &&
    typeof value === 'string' &&
    (op === 'eq' || op === 'ne')
  ) {
    resolvedPrecision = inferDatetimePrecision(value);
  }
  if (resolvedPrecision !== undefined) {
    if (type !== 'datetime' || !DATE_PRECISIONS.has(resolvedPrecision)) {
      unsupported();
    }
    if (op !== 'eq' && op !== 'ne' && op !== 'in') {
      unsupported();
    }
  }
  const prepared = asDateIfNeeded(type, value);
  if (op === 'eq') {
    return resolvedPrecision
      ? datePrecisionClause(path, value, resolvedPrecision)
      : { [path]: prepared };
  }
  if (op === 'ne') {
    if (resolvedPrecision) {
      const range = datetimeRange(value, resolvedPrecision);
      return { $nor: [{ [path]: { $gte: range.start, $lt: range.end } }] };
    }
    return { [path]: { $ne: prepared } };
  }
  if (op === 'in') {
    if (!Array.isArray(value)) unsupported();
    if (precision) {
      if (!value.length) return { [path]: { $in: [] } };
      return {
        $or: value.map((item) => datePrecisionClause(path, item, precision)),
      };
    }
    if (
      type === 'datetime' &&
      value.some(
        (item) => typeof item === 'string' && inferDatetimePrecision(item),
      )
    ) {
      return {
        $or: value.map((item) => {
          const itemPrecision =
            typeof item === 'string' ? inferDatetimePrecision(item) : undefined;
          return itemPrecision
            ? datePrecisionClause(path, item, itemPrecision)
            : { [path]: asDateIfNeeded(type, item) };
        }),
      };
    }
    const items = value.map((item) => asDateIfNeeded(type, item));
    return { [path]: { $in: items } };
  }
  if (op === 'contains') return containsClause(type, path, value);
  if (op === 'ncontains') {
    const clause = containsClause(type, path, value);
    if (clause.$expr) return { $nor: [clause] };
    const regex = clause[path] as { $regex: string; $options: string };
    return { [path]: { $not: regex } };
  }
  if (op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte') {
    if (!RANGE_TYPES.has(type)) unsupported();
    return { [path]: { [`$${op}`]: prepared } };
  }
  if (op === 'between') {
    if (!RANGE_TYPES.has(type)) unsupported();
    if (!Array.isArray(value) || value.length !== 2) unsupported();
    const start = asDateIfNeeded(type, value[0]);
    const end = asDateIfNeeded(type, value[1]);
    return { [path]: { $gte: start, $lte: end } };
  }
  unsupported();
}

function clausesFromFilters(
  filters: RecordFilter[] | undefined,
  fields: FormField[] | null | undefined,
): Record<string, unknown>[] {
  return (filters ?? []).map((item) => {
    const resolved = resolvePath(item.key, fields);
    return buildClause(
      resolved.type,
      resolved.path,
      item.op,
      item.value,
      item.precision,
    );
  });
}

function combineClauses(
  clauses: Record<string, unknown>[],
  match?: string,
): Record<string, unknown> {
  if (match && match !== 'all' && match !== 'any') unsupported();
  if (!clauses.length) return {};
  if (clauses.length === 1) return clauses[0];
  if (match === 'any') return { $or: clauses };
  return { $and: clauses };
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

  const clauses = clausesFromFilters(body.filters, fields);
  const parts: Record<string, unknown>[] = [];
  const top = combineClauses(clauses, body.match);
  if (Object.keys(top).length) parts.push(top);
  for (const group of body.groups ?? []) {
    const next = combineClauses(
      clausesFromFilters(group.filters, fields),
      group.match,
    );
    if (Object.keys(next).length) parts.push(next);
  }
  if (body.ids !== undefined) {
    parts.push({ _id: { $in: toObjectIds(body.ids) } });
  }
  const forceApproved =
    body.pickApproved === true &&
    body.formKind === 'workflow' &&
    body.ids === undefined;
  const workflowStatus = forceApproved ? 'approved' : body.workflowStatus;
  if (workflowStatus) {
    parts.push({ workflowStatus });
  }
  const excluded = toObjectIds(body.excludeIds);
  if (excluded.length) {
    parts.push({ _id: { $nin: excluded } });
  }
  const filter =
    parts.length <= 1 ? (parts[0] ?? {}) : { $and: parts };

  const sortItems = Array.isArray(body.sort)
    ? body.sort
    : body.sort
      ? [body.sort]
      : [];
  const sort = {} as Record<string, 1 | -1>;
  for (const item of sortItems) {
    if (!item || typeof item.key !== 'string') unsupported();
    const orderRaw = item.order ?? 'desc';
    if (orderRaw !== 'asc' && orderRaw !== 'desc') unsupported();
    const resolvedSort = resolvePath(item.key, fields);
    sort[resolvedSort.path] = orderRaw === 'asc' ? 1 : -1;
  }
  if (!Object.keys(sort).length) {
    sort.updatedAt = -1;
  }

  return {
    filter,
    sort,
    skip: (page - 1) * pageSize,
    limit: pageSize,
    page,
    pageSize,
  };
}
