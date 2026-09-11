import { BadRequestException } from '@nestjs/common';
import { FormField } from './form-record/form-record.types';
import { assertFormulaSchemas } from './formula-schema';

function fieldsOf(list: unknown[]): FormField[] {
  return list as FormField[];
}

describe('assertFormulaSchemas', () => {
  it('合法公式通过并写回 refs', () => {
    const fields = fieldsOf([
      { key: 'a', type: 'number', title: '单价' },
      {
        key: 'sub01',
        type: 'subform',
        title: '明细',
        fields: [{ key: 'field02', type: 'number', title: '金额' }],
      },
      {
        key: 't',
        type: 'number',
        title: '合计',
        formula: { expr: "$'a' + SUM($'sub01.field02')" },
      },
    ]);
    expect(() => assertFormulaSchemas(fields)).not.toThrow();
    expect(fields[2].formula?.refs).toEqual(['a', 'sub01.field02']);
  });

  it('行内公式通过并写回 refs', () => {
    const fields = fieldsOf([
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
    ]);
    expect(() => assertFormulaSchemas(fields)).not.toThrow();
    const subform = fields[1] as FormField & { fields: FormField[] };
    expect(subform.fields[1].formula?.refs).toEqual(['qty', 'price']);
  });

  it('不支持的控件类型不能配公式', () => {
    const fields = fieldsOf([
      { key: 'x', type: 'radio', formula: { expr: '1' } },
    ]);
    expect(() => assertFormulaSchemas(fields)).toThrow(BadRequestException);
    expect(() => assertFormulaSchemas(fields)).toThrow('不支持公式');
  });

  it('公式字段不能配必填', () => {
    const fields = fieldsOf([
      { key: 'x', type: 'number', required: true, formula: { expr: '1 + 1' } },
    ]);
    expect(() => assertFormulaSchemas(fields)).toThrow('不支持必填');
  });

  it('公式字段不能配不允许重复值', () => {
    const fields = fieldsOf([
      { key: 'x', type: 'number', unique: true, formula: { expr: '1 + 1' } },
    ]);
    expect(() => assertFormulaSchemas(fields)).toThrow('不允许重复值');
  });

  it('空公式提示请填写公式', () => {
    const fields = fieldsOf([
      { key: 'x', type: 'number', formula: { expr: '   ' } },
    ]);
    expect(() => assertFormulaSchemas(fields)).toThrow('请填写公式');
  });

  it('语法错误提示行列', () => {
    const fields = fieldsOf([
      { key: 'x', type: 'number', formula: { expr: '1 +' } },
    ]);
    expect(() => assertFormulaSchemas(fields)).toThrow('公式语法错误');
  });

  it('不支持的函数', () => {
    const fields = fieldsOf([
      { key: 'x', type: 'number', formula: { expr: 'FOO(1)' } },
    ]);
    expect(() => assertFormulaSchemas(fields)).toThrow('公式不支持函数 FOO');
  });

  it('参数个数不正确', () => {
    const fields = fieldsOf([
      { key: 'x', type: 'number', formula: { expr: 'IF(1 > 0, 2)' } },
    ]);
    expect(() => assertFormulaSchemas(fields)).toThrow('参数个数不正确');
  });

  it('引用不存在的字段', () => {
    const fields = fieldsOf([
      { key: 'x', type: 'number', formula: { expr: "$'nope' + 1" } },
    ]);
    expect(() => assertFormulaSchemas(fields)).toThrow(
      '公式引用了不存在的字段',
    );
  });

  it('引用不支持作为来源的控件等同引用不存在', () => {
    const fields = fieldsOf([
      { key: 'img', type: 'image' },
      { key: 'x', type: 'number', formula: { expr: "$'img' + 1" } },
    ]);
    expect(() => assertFormulaSchemas(fields)).toThrow(
      '公式引用了不存在的字段',
    );
  });

  it('主表公式直接引用子表路径（非聚合）报字段不存在', () => {
    const fields = fieldsOf([
      {
        key: 'sub01',
        type: 'subform',
        fields: [{ key: 'c', type: 'number', title: '数量' }],
      },
      { key: 'x', type: 'number', formula: { expr: "$'sub01.c' + 1" } },
    ]);
    expect(() => assertFormulaSchemas(fields)).toThrow(
      '公式引用了不存在的字段',
    );
  });

  it('聚合参数引用主表字段被拦', () => {
    const fields = fieldsOf([
      { key: 'a', type: 'number', title: '单价' },
      { key: 'x', type: 'number', formula: { expr: "SUM($'a')" } },
    ]);
    expect(() => assertFormulaSchemas(fields)).toThrow(
      '聚合函数参数请选择子表单数字字段',
    );
  });

  it('聚合参数引用子表非数字列被拦', () => {
    const fields = fieldsOf([
      {
        key: 'sub01',
        type: 'subform',
        fields: [{ key: 'c', type: 'input', title: '名称' }],
      },
      { key: 'x', type: 'number', formula: { expr: "SUM($'sub01.c')" } },
    ]);
    expect(() => assertFormulaSchemas(fields)).toThrow(
      '聚合函数参数请选择子表单数字字段',
    );
  });

  it('聚合参数引用不存在的子表列被拦', () => {
    const fields = fieldsOf([
      { key: 'x', type: 'number', formula: { expr: "SUM($'sub01.c')" } },
    ]);
    expect(() => assertFormulaSchemas(fields)).toThrow(
      '聚合函数参数请选择子表单数字字段',
    );
  });

  it('函数参数类型不正确', () => {
    const fields = fieldsOf([
      { key: 'txt', type: 'input', title: '名称' },
      { key: 'x', type: 'number', formula: { expr: "ROUND($'txt', 1)" } },
    ]);
    expect(() => assertFormulaSchemas(fields)).toThrow('参数类型不正确');
  });

  it('公式结果类型与字段不匹配', () => {
    const fields = fieldsOf([
      { key: 'txt', type: 'input', title: '名称' },
      { key: 'x', type: 'date', formula: { expr: "LEFT($'txt', 1)" } },
    ]);
    expect(() => assertFormulaSchemas(fields)).toThrow(
      '公式结果类型与字段不匹配',
    );
  });

  it('date 字段用日期函数结果类型匹配', () => {
    const fields = fieldsOf([
      {
        key: 'x',
        type: 'date',
        formula: { expr: 'DATEDELTA(TODAY(), 1)' },
      },
    ]);
    expect(() => assertFormulaSchemas(fields)).not.toThrow();
  });

  it('input 字段任意结果类型都可以', () => {
    const fields = fieldsOf([
      { key: 'a', type: 'number', title: '单价' },
      { key: 'x', type: 'input', formula: { expr: "$'a' * 2" } },
    ]);
    expect(() => assertFormulaSchemas(fields)).not.toThrow();
  });

  it('两个公式字段互相引用是循环引用', () => {
    const fields = fieldsOf([
      { key: 'a', type: 'number', formula: { expr: "$'b' + 1" } },
      { key: 'b', type: 'number', formula: { expr: "$'a' + 1" } },
    ]);
    expect(() => assertFormulaSchemas(fields)).toThrow('循环引用');
  });

  it('公式字段引用自己是循环引用', () => {
    const fields = fieldsOf([
      { key: 'a', type: 'number', formula: { expr: "$'a' + 1" } },
    ]);
    expect(() => assertFormulaSchemas(fields)).toThrow('循环引用');
  });

  it('行内公式引用其他子表字段被拦', () => {
    const fields = fieldsOf([
      {
        key: 'sub02',
        type: 'subform',
        fields: [{ key: 'q2', type: 'number', title: '其他子表数量' }],
      },
      {
        key: 'sub01',
        type: 'subform',
        fields: [
          { key: 'qty', type: 'number', title: '数量' },
          { key: 'x', type: 'number', formula: { expr: "$'q2' + 1" } },
        ],
      },
    ]);
    expect(() => assertFormulaSchemas(fields)).toThrow(
      '公式引用了不存在的字段',
    );
  });

  it('行内公式引用子表路径被拦', () => {
    const fields = fieldsOf([
      {
        key: 'sub01',
        type: 'subform',
        fields: [
          { key: 'qty', type: 'number', title: '数量' },
          {
            key: 'x',
            type: 'number',
            formula: { expr: "$'sub01.qty' + 1" },
          },
        ],
      },
    ]);
    expect(() => assertFormulaSchemas(fields)).toThrow(
      '公式引用了不存在的字段',
    );
  });

  it('行内公式引用主表与标签页内字段都合法', () => {
    const fields = fieldsOf([
      { key: 'price', type: 'number', title: '单价' },
      {
        key: 'tabs',
        type: 'tabs',
        panes: [
          {
            id: 'p1',
            fields: [{ key: 'rate', type: 'number', title: '折扣' }],
          },
        ],
      },
      {
        key: 'sub01',
        type: 'subform',
        fields: [
          {
            key: 'amount',
            type: 'number',
            formula: { expr: "$'price' * $'rate'" },
          },
        ],
      },
    ]);
    expect(() => assertFormulaSchemas(fields)).not.toThrow();
  });

  it('标签页里的主表公式能引用子表列', () => {
    const fields = fieldsOf([
      {
        key: 'sub01',
        type: 'subform',
        fields: [{ key: 'amount', type: 'number', title: '金额' }],
      },
      {
        key: 'tabs',
        type: 'tabs',
        panes: [
          {
            id: 'p1',
            fields: [
              {
                key: 'total',
                type: 'number',
                formula: { expr: "SUM($'sub01.amount')" },
              },
            ],
          },
        ],
      },
    ]);
    expect(() => assertFormulaSchemas(fields)).not.toThrow();
    const tabs = fields[1] as FormField & {
      panes: { fields: FormField[] }[];
    };
    expect(tabs.panes[0].fields[0].formula?.refs).toEqual([
      'sub01.amount',
    ]);
  });

  it('没有公式的字段不受影响', () => {
    const fields = fieldsOf([
      { key: 'a', type: 'number', required: true, unique: true },
    ]);
    expect(() => assertFormulaSchemas(fields)).not.toThrow();
  });
});
