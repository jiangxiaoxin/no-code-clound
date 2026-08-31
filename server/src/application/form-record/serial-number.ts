import { BadRequestException } from '@nestjs/common';
import { flattenFields } from './flatten-fields';
import { FormField, SerialRuleSegment } from './form-record.types';

export const SERIAL_TZ = 'Asia/Shanghai';

type ShanghaiParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
};

export function findSerialField(
  fields: FormField[] | null | undefined,
): FormField | null {
  return flattenFields(fields).find((field) => field.type === 'serialNumber') || null;
}

export function assertSerialSchema(fields: FormField[] | null | undefined): void {
  const serials = flattenFields(fields).filter(
    (field) => field.type === 'serialNumber',
  );
  if (serials.length > 1) {
    throw new BadRequestException('每个表单只能有一个流水号');
  }
  if (serials.length === 0) return;
  const rule = serials[0].serialRule;
  if (!Array.isArray(rule) || rule.length === 0) {
    throw new BadRequestException('请配置流水号规则');
  }
  const counters = rule.filter((item) => item?.kind === 'counter');
  if (counters.length > 1) {
    throw new BadRequestException('流水号规则只能有一段自动计数');
  }
}

function shanghaiParts(now: Date): ShanghaiParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: SERIAL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const map: Record<string, string> = {};
  for (const part of fmt.formatToParts(now)) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
    second: map.second,
  };
}

function isoWeekKey(year: number, month: number, day: number): string {
  const utc = new Date(Date.UTC(year, month - 1, day));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const isoYear = utc.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(
    ((Number(utc) - Number(yearStart)) / 86400000 + 1) / 7,
  );
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

export function formatSerialDate(format: string, now: Date): string {
  if (format === 'epochMs') {
    return String(now.getTime());
  }
  const parts = shanghaiParts(now);
  if (format === 'YYYY') return parts.year;
  if (format === 'YYYYMM') return `${parts.year}${parts.month}`;
  if (format === 'YYYYMMDD') {
    return `${parts.year}${parts.month}${parts.day}`;
  }
  if (format === 'YYYYMMDDHHmmss') {
    return `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}${parts.second}`;
  }
  return '';
}

export function periodKey(
  reset: boolean,
  resetPeriod: string | undefined,
  now: Date,
): string {
  if (!reset) return 'all';
  const parts = shanghaiParts(now);
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  if (resetPeriod === 'day') {
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  if (resetPeriod === 'week') {
    return isoWeekKey(year, month, day);
  }
  if (resetPeriod === 'month') {
    return `${parts.year}-${parts.month}`;
  }
  if (resetPeriod === 'quarter') {
    const q = Math.ceil(month / 3);
    return `${parts.year}-Q${q}`;
  }
  if (resetPeriod === 'year') {
    return parts.year;
  }
  return 'all';
}

function fieldPart(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Object.is(value, -0) ? '0' : String(value);
  }
  if (typeof value === 'string') return value;
  return '';
}

function renderSegment(
  seg: SerialRuleSegment,
  data: Record<string, unknown>,
  now: Date,
  counterValue?: number,
): string {
  if (seg.kind === 'fixed') {
    return typeof seg.text === 'string' ? seg.text : '';
  }
  if (seg.kind === 'datetime') {
    return formatSerialDate(seg.format || 'YYYYMMDD', now);
  }
  if (seg.kind === 'counter') {
    if (counterValue == null) return '';
    const digits =
      Number.isInteger(seg.digits) && (seg.digits as number) >= 1
        ? Math.min(seg.digits as number, 12)
        : 5;
    return String(counterValue).padStart(digits, '0');
  }
  if (seg.kind === 'field') {
    const key = seg.fieldKey || '';
    if (!key) return '';
    return fieldPart(data[key]);
  }
  return '';
}

export function renderSerialValue(
  field: FormField,
  data: Record<string, unknown>,
  now: Date,
  counterValue?: number,
): string {
  const rule = Array.isArray(field.serialRule) ? field.serialRule : [];
  const parts: string[] = [];
  for (const seg of rule) {
    const piece = renderSegment(seg, data, now, counterValue);
    if (piece !== '') parts.push(piece);
  }
  const sep = String(field.serialSeparator ?? '-').trim().slice(0, 8);
  return parts.join(sep);
}
