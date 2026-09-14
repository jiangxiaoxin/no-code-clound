import { readFileSync } from 'fs';
import { join } from 'path';
import { parseFormula } from './parser';
import { applyFormulaValues, evaluateAst, inferType, normalizeFormulaValue } from './evaluator';

type StaticType = 'number' | 'string' | 'boolean' | 'date' | 'unknown';

type Fixture = {
  desc: string;
  expr: string;
  values?: Record<string, unknown>;
  row?: Record<string, unknown>;
  parent?: Record<string, unknown>;
  types?: Record<string, string>;
  expect?: unknown;
  expectError?: string;
  expectTypeError?: boolean;
  expectRefs?: string[];
};

const fixtures: Fixture[] = JSON.parse(
  readFileSync(join(__dirname, 'formula.fixtures.json'), 'utf-8'),
);

function contextOf(f: Fixture) {
  if (f.row || f.parent) {
    return {
      now: new Date('2026-09-11T10:00:00'),
      resolve: (path: string[]) => {
        if (path.length !== 1) return undefined;
        const rowValue = (f.row ?? {})[path[0]];
        return rowValue === undefined || rowValue === null
          ? (f.parent ?? {})[path[0]]
          : rowValue;
      },
    };
  }
  return {
    now: new Date('2026-09-11T10:00:00'),
    resolve: (path: string[]) => {
      if (path.length === 1) return f.values?.[path[0]];
      const rows = f.values?.[path[0]];
      return Array.isArray(rows)
        ? rows.map(
            (row) => (row as Record<string, unknown> | null)?.[path[1]],
          )
        : undefined;
    },
  };
}

describe('formula fixtures', () => {
  fixtures.forEach((f) => {
    it(f.desc, () => {
      const parsed = parseFormula(f.expr);
      if (f.expectError) {
        expect(parsed.ok).toBe(false);
        if (!parsed.ok) expect(parsed.error.code).toBe(f.expectError);
        return;
      }
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      if (f.expectRefs) {
        expect(parsed.refs).toEqual(f.expectRefs);
      }
      if (f.types) {
        const typeOf = (path: string[]) =>
          (f.types?.[path.join('.')] as StaticType | undefined) ?? 'unknown';
        const inferred = inferType(parsed.ast, typeOf);
        if (f.expectTypeError) {
          expect(inferred.ok).toBe(false);
          if (!inferred.ok) expect(inferred.error.code).toBe('type');
          return;
        }
        expect(inferred.ok).toBe(true);
      }
      const result = evaluateAst(parsed.ast, contextOf(f));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value ?? null).toEqual(f.expect ?? null);
    });
  });
});

describe('now functions', () => {
  const now = new Date(2026, 8, 11, 10, 30, 0);
  const ctx = { now, resolve: () => undefined };

  function evalExpr(expr: string) {
    const parsed = parseFormula(expr);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.error.message);
    return evaluateAst(parsed.ast, ctx);
  }

  it('TODAY 返回当天本地零点', () => {
    const result = evalExpr('TODAY()');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(new Date(2026, 8, 11, 0, 0, 0).getTime());
    }
  });

  it('NOW 返回注入的当前时间', () => {
    const result = evalExpr('NOW()');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(now.getTime());
    }
  });
});

describe('applyFormulaValues', () => {
  const now = new Date(2026, 8, 11, 10, 0, 0);

  it('主表、行内与链式公式都计算', () => {
    const fields = [
      { key: 'price', type: 'number', title: '单价' },
      {
        key: 'sub01',
        type: 'subform',
        title: '明细',
        fields: [
          { key: 'qty', type: 'number', title: '数量' },
          {
            key: 'amount',
            type: 'number',
            title: '金额',
            formula: { expr: "$'qty' * $'price'" },
          },
        ],
      },
      {
        key: 'total',
        type: 'number',
        title: '合计',
        formula: { expr: "SUM($'sub01.amount')" },
      },
    ];
    const data = { price: 2, sub01: [{ qty: 1 }, { qty: 3 }] };
    const warnings = applyFormulaValues(fields as never, data, now);
    expect(warnings).toEqual([]);
    const rows = data.sub01 as Record<string, unknown>[];
    expect(rows[0].amount).toBe(2);
    expect(rows[1].amount).toBe(6);
    expect(data.total).toBe(8);
  });

  it('结果为空时清掉主表上一次算出的值', () => {
    const fields = [
      {
        key: 'sub01',
        type: 'subform',
        title: '明细',
        fields: [{ key: 'qty', type: 'number', title: '数量' }],
      },
      {
        key: 'total',
        type: 'number',
        title: '合计',
        formula: { expr: "SUM($'sub01.qty')" },
      },
    ];
    const data: Record<string, unknown> = { sub01: [], total: 100 };
    const warnings = applyFormulaValues(fields as never, data, now);
    expect(warnings).toEqual([]);
    expect(data.total).toBeUndefined();
  });

  it('结果为空时清掉行内上一次算出的值', () => {
    const fields = [
      {
        key: 'sub01',
        type: 'subform',
        title: '明细',
        fields: [
          { key: 'qty', type: 'number', title: '数量' },
          {
            key: 'amount',
            type: 'number',
            title: '金额',
            formula: { expr: "$'qty' * 2" },
          },
        ],
      },
    ];
    const data = { sub01: [{ qty: null, amount: 20 }] };
    const warnings = applyFormulaValues(fields as never, data, now);
    expect(warnings).toEqual([]);
    expect((data.sub01[0] as Record<string, unknown>).amount).toBeUndefined();
  });

  it('表达式非法时字段留空并给警告', () => {
    const fields = [
      { key: 'a', type: 'number', title: 'A', formula: { expr: 'SUM((' } },
      { key: 'b', type: 'number', title: 'B', formula: { expr: "$'a' + 1" } },
    ];
    const data: Record<string, unknown> = {};
    const warnings = applyFormulaValues(fields as never, data, now);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('A');
    expect(data.a).toBeUndefined();
    expect(data.b).toBeUndefined();
  });

  it('date 字段结果归一化为 YYYY-MM-DD', () => {
    const fields = [
      {
        key: 'tomorrow',
        type: 'date',
        title: '明天',
        formula: { expr: 'DATEDELTA(TODAY(), 1)' },
      },
    ];
    const data: Record<string, unknown> = {};
    const warnings = applyFormulaValues(fields as never, data, now);
    expect(warnings).toEqual([]);
    expect(data.tomorrow).toBe('2026-09-12');
  });

  it('input 字段数字结果归一化为文本', () => {
    const fields = [
      { key: 'n', type: 'number', title: '数量' },
      {
        key: 'label',
        type: 'input',
        title: '标签',
        formula: { expr: "CONCATENATE(\"共\", $'n')" },
      },
    ];
    const data: Record<string, unknown> = { n: 3 };
    const warnings = applyFormulaValues(fields as never, data, now);
    expect(warnings).toEqual([]);
    expect(data.label).toBe('共3');
  });

  it('行内公式本行字段优先于主表字段', () => {
    const fields = [
      { key: 'a', type: 'number', title: '主表A' },
      {
        key: 'sub01',
        type: 'subform',
        title: '明细',
        fields: [
          {
            key: 'c',
            type: 'number',
            title: '系数',
            formula: { expr: "$'a' + 1" },
          },
        ],
      },
    ];
    const data = { a: 1, sub01: [{ a: 10 }, {}] };
    const warnings = applyFormulaValues(fields as never, data, now);
    expect(warnings).toEqual([]);
    const rows = data.sub01 as Record<string, unknown>[];
    expect(rows[0].c).toBe(11);
    expect(rows[1].c).toBe(2);
  });
});

describe('normalizeFormulaValue', () => {
  it('datetime 字段写 Date 对象', () => {
    const field = { key: 'd', type: 'datetime' };
    expect(
      normalizeFormulaValue(field as never, '2026-09-11 10:30:00'),
    ).toEqual(new Date(2026, 8, 11, 10, 30, 0));
  });

  it('time 字段按格式归一化', () => {
    const hm = { key: 't', type: 'time', format: 'HH:mm' };
    expect(normalizeFormulaValue(hm as never, '10:30:00')).toBe('10:30');
    const hms = { key: 't', type: 'time' };
    expect(normalizeFormulaValue(hms as never, '10:30')).toBe('10:30:00');
  });

  it('非法结果返回 undefined', () => {
    expect(normalizeFormulaValue({ key: 'n', type: 'number' } as never, 'abc')).toBeUndefined();
    expect(normalizeFormulaValue({ key: 'd', type: 'date' } as never, 'not-date')).toBeUndefined();
  });
});
