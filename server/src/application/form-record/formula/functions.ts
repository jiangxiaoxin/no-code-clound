export type FormulaFunctionCategory = 'math' | 'logic' | 'text' | 'date' | 'aggregate';

export type FormulaParamType = 'number' | 'string' | 'boolean' | 'date' | 'any';

export type FormulaFunctionDef = {
  name: string;
  category: FormulaFunctionCategory;
  minArgs: number;
  maxArgs: number;
  params: FormulaParamType[];
  variadic?: FormulaParamType;
  summary: string;
};

export const FORMULA_FIELD_TYPES = ['input', 'textarea', 'number', 'date', 'time', 'datetime'];

export const AGGREGATE_FUNCTION_NAMES = ['SUM', 'AVERAGE', 'MAX', 'MIN'];

const VARIADIC_NUMBER: FormulaFunctionDef[] = [
  { name: 'SUM', category: 'aggregate', minArgs: 1, maxArgs: Infinity, params: [], variadic: 'number', summary: 'SUM(数字, ...)：对子表数字列或一组数字求和，空值跳过' },
  { name: 'AVERAGE', category: 'aggregate', minArgs: 1, maxArgs: Infinity, params: [], variadic: 'number', summary: 'AVERAGE(数字, ...)：求平均值，空值跳过，全空得空' },
  { name: 'MAX', category: 'aggregate', minArgs: 1, maxArgs: Infinity, params: [], variadic: 'number', summary: 'MAX(数字, ...)：取最大值' },
  { name: 'MIN', category: 'aggregate', minArgs: 1, maxArgs: Infinity, params: [], variadic: 'number', summary: 'MIN(数字, ...)：取最小值' },
];

export const FORMULA_FUNCTIONS: FormulaFunctionDef[] = [
  { name: 'IF', category: 'logic', minArgs: 3, maxArgs: 3, params: ['boolean', 'any', 'any'], summary: 'IF(条件, 结果1, 结果2)：条件为真返回结果1，否则返回结果2' },
  { name: 'AND', category: 'logic', minArgs: 1, maxArgs: Infinity, params: [], variadic: 'boolean', summary: 'AND(条件, ...)：所有条件为真才返回真' },
  { name: 'OR', category: 'logic', minArgs: 1, maxArgs: Infinity, params: [], variadic: 'boolean', summary: 'OR(条件, ...)：任一条件为真就返回真' },
  { name: 'NOT', category: 'logic', minArgs: 1, maxArgs: 1, params: ['boolean'], summary: 'NOT(条件)：条件为假返回真' },
  { name: 'CONCATENATE', category: 'text', minArgs: 1, maxArgs: Infinity, params: [], variadic: 'any', summary: 'CONCATENATE(文本, ...)：把多段文本连成一段' },
  { name: 'LEFT', category: 'text', minArgs: 2, maxArgs: 2, params: ['string', 'number'], summary: 'LEFT(文本, 数量)：从左边截取指定数量的字符' },
  { name: 'RIGHT', category: 'text', minArgs: 2, maxArgs: 2, params: ['string', 'number'], summary: 'RIGHT(文本, 数量)：从右边截取指定数量的字符' },
  { name: 'MID', category: 'text', minArgs: 3, maxArgs: 3, params: ['string', 'number', 'number'], summary: 'MID(文本, 第几位, 数量)：从指定位次开始截取' },
  { name: 'LEN', category: 'text', minArgs: 1, maxArgs: 1, params: ['string'], summary: 'LEN(文本)：返回字符个数' },
  { name: 'TEXT', category: 'text', minArgs: 2, maxArgs: 2, params: ['any', 'string'], summary: 'TEXT(值, 格式)：数字按 0.00 类格式，日期按 YYYY-MM-DD 类格式转成文本' },
  { name: 'VALUE', category: 'text', minArgs: 1, maxArgs: 1, params: ['string'], summary: 'VALUE(文本)：把数字文本转成数字，转不了得空' },
  { name: 'ISEMPTY', category: 'text', minArgs: 1, maxArgs: 1, params: ['any'], summary: 'ISEMPTY(值)：值为空、空文本或空数组时返回真' },
  ...VARIADIC_NUMBER,
  { name: 'ROUND', category: 'math', minArgs: 2, maxArgs: 2, params: ['number', 'number'], summary: 'ROUND(数字, 位数)：按位数四舍五入' },
  { name: 'ABS', category: 'math', minArgs: 1, maxArgs: 1, params: ['number'], summary: 'ABS(数字)：返回绝对值' },
  { name: 'TODAY', category: 'date', minArgs: 0, maxArgs: 0, params: [], summary: 'TODAY()：返回今天零点的时间戳' },
  { name: 'NOW', category: 'date', minArgs: 0, maxArgs: 0, params: [], summary: 'NOW()：返回当前时间戳' },
  { name: 'DATEDIF', category: 'date', minArgs: 3, maxArgs: 3, params: ['date', 'date', 'string'], summary: 'DATEDIF(开始, 结束, 单位)：单位 Y/M/D，不足整年整月舍去' },
  { name: 'DATEDELTA', category: 'date', minArgs: 2, maxArgs: 2, params: ['date', 'number'], summary: 'DATEDELTA(日期, 天数)：按天加减日期，返回时间戳' },
];

const FUNCTION_MAP = new Map(FORMULA_FUNCTIONS.map((def) => [def.name, def]));

export function findFunctionDef(name: string): FormulaFunctionDef | undefined {
  return FUNCTION_MAP.get(name);
}

const DAY_MS = 86400000;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function localMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): number | null {
  const d = new Date(year, month - 1, day, hour, minute, second, 0);
  if (Number.isNaN(d.getTime())) return null;
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day ||
    d.getHours() !== hour ||
    d.getMinutes() !== minute ||
    d.getSeconds() !== second
  ) {
    return null;
  }
  return d.getTime();
}

/**
 * 与前端 utils/timeValue.js 的 asDate 对齐：年月日按本地时区分量构造，
 * 不能用 Date.parse（YYYY-MM-DD 会按 UTC 解析，两端差 8 小时）。
 */
export function parseDateLikeToMs(value: unknown): number | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.getTime();
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (s === '') return null;
  let m = /^(\d{4})$/.exec(s);
  if (m) return localMs(Number(m[1]), 1, 1, 0, 0, 0);
  m = /^(\d{4})-(\d{2})$/.exec(s);
  if (m) return localMs(Number(m[1]), Number(m[2]), 1, 0, 0, 0);
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return localMs(Number(m[1]), Number(m[2]), Number(m[3]), 0, 0, 0);
  m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (m) {
    return localMs(
      Number(m[1]),
      Number(m[2]),
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6] ?? 0),
    );
  }
  m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (m) {
    return localMs(1970, 1, 1, Number(m[1]), Number(m[2]), Number(m[3] ?? 0));
  }
  const parsed = new Date(s).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

export function formatMs(ms: number, fmt: string): string {
  const d = new Date(ms);
  return fmt.replace(/YYYY|MM|DD|HH|mm|ss/g, (token) => {
    switch (token) {
      case 'YYYY':
        return String(d.getFullYear());
      case 'MM':
        return pad2(d.getMonth() + 1);
      case 'DD':
        return pad2(d.getDate());
      case 'HH':
        return pad2(d.getHours());
      case 'mm':
        return pad2(d.getMinutes());
      case 'ss':
        return pad2(d.getSeconds());
      default:
        return token;
    }
  });
}

export function startOfDayMs(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') {
    const s = value.trim();
    if (s === '') return undefined;
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    const ms = parseDateLikeToMs(s);
    return ms === null ? undefined : ms;
  }
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? undefined : t;
  }
  return undefined;
}

export function truthy(value: unknown): boolean {
  if (value === undefined || value === null || value === false) return false;
  if (value === '' || value === 0) return false;
  if (typeof value === 'number' && Number.isNaN(value)) return false;
  return true;
}

export function strOf(value: unknown): string | undefined {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : undefined;
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return undefined;
}

function textArg(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return undefined;
}

function countArg(value: unknown): number | undefined {
  const n = toNumber(value);
  if (n === undefined) return undefined;
  return Math.max(0, Math.floor(n));
}

function eqValues(a: unknown, b: unknown): boolean {
  const aEmpty = a === undefined || a === null;
  const bEmpty = b === undefined || b === null;
  if (aEmpty && bEmpty) return true;
  if (aEmpty || bEmpty) return false;
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    const x = toNumber(a);
    const y = toNumber(b);
    return x !== undefined && y !== undefined ? x === y : false;
  }
  return String(a) === String(b);
}

function collectNumbers(args: unknown[]): number[] {
  const out: number[] = [];
  for (const arg of args) {
    if (Array.isArray(arg)) {
      for (const item of arg) {
        const n = toNumber(item);
        if (n !== undefined) out.push(n);
      }
    } else {
      const n = toNumber(arg);
      if (n !== undefined) out.push(n);
    }
  }
  return out;
}

function calendarDiff(
  startMs: number,
  endMs: number,
  unit: string,
): number | undefined {
  if (endMs < startMs) return undefined;
  const a = new Date(startMs);
  const b = new Date(endMs);
  if (unit === 'D') {
    return Math.floor((startOfDayMs(endMs) - startOfDayMs(startMs)) / DAY_MS);
  }
  if (unit === 'Y') {
    let years = b.getFullYear() - a.getFullYear();
    if (
      b.getMonth() < a.getMonth() ||
      (b.getMonth() === a.getMonth() && b.getDate() < a.getDate())
    ) {
      years -= 1;
    }
    return years;
  }
  if (unit === 'M') {
    let months =
      (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    if (b.getDate() < a.getDate()) months -= 1;
    return months;
  }
  return undefined;
}

export type FormulaInvokeContext = { now: Date };

export function invokeFunction(
  name: string,
  args: unknown[],
  ctx: FormulaInvokeContext,
): unknown {
  switch (name) {
    case 'AND':
      return args.every((arg) => truthy(arg));
    case 'OR':
      return args.some((arg) => truthy(arg));
    case 'NOT':
      return !truthy(args[0]);
    case 'CONCATENATE': {
      let out = '';
      for (const arg of args) {
        const s = strOf(arg);
        if (s === undefined) return undefined;
        out += s;
      }
      return out;
    }
    case 'LEFT': {
      const s = textArg(args[0]);
      if (s === undefined) return undefined;
      const n = countArg(args[1]);
      if (n === undefined) return undefined;
      return s.slice(0, n);
    }
    case 'RIGHT': {
      const s = textArg(args[0]);
      if (s === undefined) return undefined;
      const n = countArg(args[1]);
      if (n === undefined) return undefined;
      return n === 0 ? '' : s.slice(-n);
    }
    case 'MID': {
      const s = textArg(args[0]);
      if (s === undefined) return undefined;
      const start = toNumber(args[1]);
      const count = toNumber(args[2]);
      if (start === undefined || count === undefined) return undefined;
      const from = Math.floor(start);
      const len = Math.floor(count);
      if (from < 1 || len <= 0) return '';
      return s.slice(from - 1, from - 1 + len);
    }
    case 'LEN': {
      const s = textArg(args[0]);
      return s === undefined ? undefined : s.length;
    }
    case 'TEXT': {
      const fmt = args[1];
      if (typeof fmt !== 'string') return undefined;
      if (/(YYYY|MM|DD|HH|mm|ss)/.test(fmt)) {
        const ms = parseDateLikeToMs(args[0]);
        return ms === null ? undefined : formatMs(ms, fmt);
      }
      const n = toNumber(args[0]);
      if (n === undefined) return undefined;
      const decimals = /\.(\d+)/.exec(fmt);
      if (fmt === '0') return n.toFixed(0);
      if (decimals) return n.toFixed(Math.min(100, decimals[1].length));
      return String(n);
    }
    case 'VALUE':
      return toNumber(args[0]);
    case 'ISEMPTY': {
      const v = args[0];
      return (
        v === undefined ||
        v === null ||
        v === '' ||
        (Array.isArray(v) && v.length === 0)
      );
    }
    case 'SUM': {
      const list = collectNumbers(args);
      if (!list.length) return undefined;
      return list.reduce((sum, n) => sum + n, 0);
    }
    case 'AVERAGE': {
      const list = collectNumbers(args);
      if (!list.length) return undefined;
      return list.reduce((sum, n) => sum + n, 0) / list.length;
    }
    case 'MAX': {
      const list = collectNumbers(args);
      if (!list.length) return undefined;
      return Math.max(...list);
    }
    case 'MIN': {
      const list = collectNumbers(args);
      if (!list.length) return undefined;
      return Math.min(...list);
    }
    case 'ROUND': {
      const n = toNumber(args[0]);
      const d = toNumber(args[1]);
      if (n === undefined || d === undefined) return undefined;
      const digits = Math.min(100, Math.max(0, Math.floor(d)));
      const factor = 10 ** digits;
      return Math.round(n * factor) / factor;
    }
    case 'ABS': {
      const n = toNumber(args[0]);
      return n === undefined ? undefined : Math.abs(n);
    }
    case 'TODAY':
      return startOfDayMs(ctx.now.getTime());
    case 'NOW':
      return ctx.now.getTime();
    case 'DATEDIF': {
      const start = parseDateLikeToMs(args[0]);
      const end = parseDateLikeToMs(args[1]);
      if (start === null || end === null) return undefined;
      const unit = typeof args[2] === 'string' ? args[2].trim().toUpperCase() : '';
      return calendarDiff(start, end, unit);
    }
    case 'DATEDELTA': {
      const ms = parseDateLikeToMs(args[0]);
      const delta = toNumber(args[1]);
      if (ms === null || delta === undefined) return undefined;
      return ms + delta * DAY_MS;
    }
    default:
      return undefined;
  }
}
