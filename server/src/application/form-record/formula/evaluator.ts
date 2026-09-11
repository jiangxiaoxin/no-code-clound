import { flattenFields } from '../flatten-fields';
import { FormField } from '../form-record.types';
import {
  findFunctionDef,
  formatMs,
  FormulaInvokeContext,
  FormulaParamType,
  invokeFunction,
  parseDateLikeToMs,
  strOf,
  toNumber,
  truthy,
} from './functions';
import { FormulaAst, FormulaError, parseFormula } from './parser';

export type EvalContext = {
  now: Date;
  resolve: (path: string[]) => unknown;
};

export type EvalResult =
  | { ok: true; value: unknown }
  | { ok: false; error: FormulaError };

export type StaticType = 'number' | 'string' | 'boolean' | 'date' | 'unknown';

export type InferResult =
  | { ok: true; type: StaticType }
  | { ok: false; error: FormulaError };

const COMPARE_OPS = ['==', '!=', '>=', '<=', '>', '<'];

const RETURN_TYPES: Record<string, StaticType> = {
  AND: 'boolean',
  OR: 'boolean',
  NOT: 'boolean',
  CONCATENATE: 'string',
  LEFT: 'string',
  RIGHT: 'string',
  MID: 'string',
  TEXT: 'string',
  LEN: 'number',
  VALUE: 'number',
  ROUND: 'number',
  ABS: 'number',
  SUM: 'number',
  AVERAGE: 'number',
  MAX: 'number',
  MIN: 'number',
  DATEDIF: 'number',
  TODAY: 'date',
  NOW: 'date',
  DATEDELTA: 'date',
};

function evalBinary(node: Extract<FormulaAst, { kind: 'binary' }>, ctx: EvalContext): unknown {
  const a = evalNode(node.left, ctx);
  const b = evalNode(node.right, ctx);
  switch (node.op) {
    case '==':
      return eqValues(a, b);
    case '!=':
      return !eqValues(a, b);
    case '>':
    case '<':
    case '>=':
    case '<=': {
      const x = toNumber(a);
      const y = toNumber(b);
      if (x !== undefined && y !== undefined) {
        switch (node.op) {
          case '>':
            return x > y;
          case '<':
            return x < y;
          case '>=':
            return x >= y;
          default:
            return x <= y;
        }
      }
      if (typeof a === 'string' && typeof b === 'string') {
        switch (node.op) {
          case '>':
            return a > b;
          case '<':
            return a < b;
          case '>=':
            return a >= b;
          default:
            return a <= b;
        }
      }
      return undefined;
    }
  }
  if (node.op === '+') {
    if (typeof a === 'string' || typeof b === 'string') {
      const sa = strOf(a);
      const sb = strOf(b);
      return sa === undefined || sb === undefined ? undefined : sa + sb;
    }
  }
  const x = toNumber(a);
  const y = toNumber(b);
  if (x === undefined || y === undefined) return undefined;
  switch (node.op) {
    case '+':
      return x + y;
    case '-':
      return x - y;
    case '*':
      return x * y;
    case '/':
      return y === 0 ? undefined : x / y;
    case '%':
      return y === 0 ? undefined : x % y;
    default:
      return undefined;
  }
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

function evalNode(node: FormulaAst, ctx: EvalContext): unknown {
  switch (node.kind) {
    case 'num':
      return node.value;
    case 'str':
      return node.value;
    case 'bool':
      return node.value;
    case 'ref':
      return ctx.resolve(node.path);
    case 'unary': {
      const n = toNumber(evalNode(node.operand, ctx));
      return n === undefined ? undefined : -n;
    }
    case 'binary':
      return evalBinary(node, ctx);
    case 'call': {
      if (node.name === 'IF') {
        const cond = evalNode(node.args[0], ctx);
        return truthy(cond)
          ? evalNode(node.args[1], ctx)
          : evalNode(node.args[2], ctx);
      }
      const args = node.args.map((arg) => evalNode(arg, ctx));
      const invokeCtx: FormulaInvokeContext = { now: ctx.now };
      return invokeFunction(node.name, args, invokeCtx);
    }
  }
}

export function evaluateAst(ast: FormulaAst, ctx: EvalContext): EvalResult {
  try {
    return { ok: true, value: evalNode(ast, ctx) };
  } catch {
    return {
      ok: false,
      error: { code: 'type', message: '公式计算失败', line: 0, column: 0 },
    };
  }
}

function paramMatches(formal: FormulaParamType, actual: StaticType): boolean {
  switch (formal) {
    case 'any':
      return true;
    case 'number':
      return actual === 'number' || actual === 'date';
    case 'string':
      return actual === 'string' || actual === 'number' || actual === 'date';
    case 'boolean':
      return actual === 'boolean';
    case 'date':
      return actual === 'date' || actual === 'number' || actual === 'string';
    default:
      return false;
  }
}

function inferNode(node: FormulaAst, typeOf: (path: string[]) => StaticType): InferResult {
  switch (node.kind) {
    case 'num':
      return { ok: true, type: 'number' };
    case 'str':
      return { ok: true, type: 'string' };
    case 'bool':
      return { ok: true, type: 'boolean' };
    case 'ref':
      return { ok: true, type: typeOf(node.path) };
    case 'unary': {
      const inner = inferNode(node.operand, typeOf);
      return inner.ok ? { ok: true, type: 'number' } : inner;
    }
    case 'binary': {
      const left = inferNode(node.left, typeOf);
      if (!left.ok) return left;
      const right = inferNode(node.right, typeOf);
      if (!right.ok) return right;
      if (COMPARE_OPS.includes(node.op)) {
        return { ok: true, type: 'boolean' };
      }
      if (node.op === '+') {
        if (left.type === 'string' || right.type === 'string') {
          return { ok: true, type: 'string' };
        }
        if (left.type === 'unknown' || right.type === 'unknown') {
          return { ok: true, type: 'unknown' };
        }
      }
      return { ok: true, type: 'number' };
    }
    case 'call': {
      const def = findFunctionDef(node.name);
      if (!def) {
        return {
          ok: false,
          error: {
            code: 'unknown-function',
            message: `公式不支持函数 ${node.name}`,
            line: node.line,
            column: node.column,
          },
        };
      }
      const argTypes: StaticType[] = [];
      for (let i = 0; i < node.args.length; i++) {
        const arg = inferNode(node.args[i], typeOf);
        if (!arg.ok) return arg;
        argTypes.push(arg.type);
        if (arg.type === 'unknown') continue;
        const formal = i < def.params.length ? def.params[i] : def.variadic;
        if (!formal || !paramMatches(formal, arg.type)) {
          return {
            ok: false,
            error: {
              code: 'type',
              message: `函数 ${node.name} 参数类型不正确`,
              line: node.line,
              column: node.column,
            },
          };
        }
      }
      if (node.name === 'IF') {
        const t1 = argTypes[1];
        const t2 = argTypes[2];
        return { ok: true, type: t1 === t2 ? t1 : 'unknown' };
      }
      return { ok: true, type: RETURN_TYPES[node.name] ?? 'unknown' };
    }
  }
}

export function inferType(
  ast: FormulaAst,
  typeOf: (path: string[]) => StaticType,
): InferResult {
  return inferNode(ast, typeOf);
}

export function normalizeFormulaValue(field: FormField, value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  switch (field.type) {
    case 'number':
      return toNumber(value);
    case 'input':
    case 'textarea': {
      const s = strOf(value);
      return s === undefined ? undefined : s;
    }
    case 'date': {
      const ms = parseDateLikeToMs(value);
      return ms === null ? undefined : formatMs(ms, 'YYYY-MM-DD');
    }
    case 'time': {
      const ms = parseDateLikeToMs(value);
      if (ms === null) return undefined;
      return formatMs(ms, field.format === 'HH:mm' ? 'HH:mm' : 'HH:mm:ss');
    }
    case 'datetime': {
      const ms = parseDateLikeToMs(value);
      return ms === null ? undefined : new Date(ms);
    }
    default:
      return undefined;
  }
}

type FormulaUnit =
  | { id: string; kind: 'main'; field: FormField; ast: FormulaAst; refs: string[] }
  | {
      id: string;
      kind: 'row';
      subKey: string;
      field: FormField;
      ast: FormulaAst;
      refs: string[];
    };

function unitTitle(field: FormField): string {
  return field.title || field.key;
}

function resolveMainRef(path: string[], data: Record<string, unknown>): unknown {
  if (path.length === 1) return data[path[0]];
  if (path.length !== 2) return undefined;
  const rows = data[path[0]];
  if (!Array.isArray(rows)) return undefined;
  return rows.map((row) =>
    row && typeof row === 'object' && !Array.isArray(row)
      ? (row as Record<string, unknown>)[path[1]]
      : undefined,
  );
}

function resolveRowRef(
  path: string[],
  row: Record<string, unknown>,
  data: Record<string, unknown>,
): unknown {
  if (path.length !== 1) return undefined;
  const value = row[path[0]];
  return value === undefined || value === null ? data[path[0]] : value;
}

export function applyFormulaValues(
  fields: FormField[],
  data: Record<string, unknown>,
  now: Date,
): string[] {
  const warnings: string[] = [];
  const units: FormulaUnit[] = [];
  const unitById = new Map<string, FormulaUnit>();

  function registerUnit(unit: FormulaUnit, expr: string) {
    const parsed = parseFormula(expr);
    if (!parsed.ok) {
      warnings.push(
        `[${unitTitle(unit.field)}] 公式计算失败：${parsed.error.message}`,
      );
      return;
    }
    unit.ast = parsed.ast;
    unit.refs = parsed.refs;
    units.push(unit);
    unitById.set(unit.id, unit);
  }

  for (const field of flattenFields(fields)) {
    if (field.type === 'subform') {
      for (const child of field.fields || []) {
        const expr = child.formula?.expr;
        if (typeof expr === 'string' && expr.trim() !== '') {
          registerUnit(
            {
              id: `${field.key}.${child.key}`,
              kind: 'row',
              subKey: field.key,
              field: child,
              ast: null as never,
              refs: [],
            },
            expr,
          );
        }
      }
      continue;
    }
    const expr = field.formula?.expr;
    if (typeof expr === 'string' && expr.trim() !== '') {
      registerUnit(
        { id: field.key, kind: 'main', field, ast: null as never, refs: [] },
        expr,
      );
    }
  }

  const deps = new Map<string, string[]>();
  for (const unit of units) {
    const list: string[] = [];
    for (const ref of unit.refs) {
      const path = ref.split('.');
      let dep: string | null = null;
      if (unit.kind === 'main') {
        if (path.length === 1) {
          dep = unitById.has(path[0]) ? path[0] : null;
        } else if (path.length === 2) {
          const id = `${path[0]}.${path[1]}`;
          dep = unitById.has(id) ? id : null;
        }
      } else if (path.length === 1) {
        const own = `${unit.subKey}.${path[0]}`;
        dep = unitById.has(own)
          ? own
          : unitById.has(path[0])
            ? path[0]
            : null;
      }
      if (dep && dep !== unit.id && !list.includes(dep)) list.push(dep);
    }
    deps.set(unit.id, list);
  }

  const order: FormulaUnit[] = [];
  const state = new Map<string, 0 | 1 | 2>();
  let cycle = false;
  const visit = (unit: FormulaUnit) => {
    const current = state.get(unit.id) ?? 0;
    if (current === 2) return;
    if (current === 1) {
      cycle = true;
      return;
    }
    state.set(unit.id, 1);
    for (const depId of deps.get(unit.id) || []) {
      const dep = unitById.get(depId);
      if (dep) visit(dep);
    }
    state.set(unit.id, 2);
    order.push(unit);
  };
  for (const unit of units) visit(unit);
  if (cycle) {
    warnings.push('公式存在循环引用，已跳过公式计算');
    return warnings;
  }

  function run(unit: FormulaUnit, ctx: EvalContext, write: (value: unknown) => void) {
    const result = evaluateAst(unit.ast, ctx);
    if (!result.ok) {
      warnings.push(
        `[${unitTitle(unit.field)}] 公式计算失败：${result.error.message}`,
      );
      return;
    }
    if (result.value === undefined) return;
    const normalized = normalizeFormulaValue(unit.field, result.value);
    if (normalized !== undefined) write(normalized);
  }

  for (const unit of order) {
    if (unit.kind === 'main') {
      const ctx: EvalContext = {
        now,
        resolve: (path) => resolveMainRef(path, data),
      };
      run(unit, ctx, (value) => {
        data[unit.field.key] = value;
      });
    } else {
      const rows = data[unit.subKey];
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
        const record = row as Record<string, unknown>;
        const ctx: EvalContext = {
          now,
          resolve: (path) => resolveRowRef(path, record, data),
        };
        run(unit, ctx, (value) => {
          record[unit.field.key] = value;
        });
      }
    }
  }
  return warnings;
}
