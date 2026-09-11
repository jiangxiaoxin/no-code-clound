import { BadRequestException } from '@nestjs/common';
import { FormField } from './form-record.types';
import { assertRequiredFields } from './form-record.required';

const fields: FormField[] = [
  { key: 'reason', title: '事由', type: 'textarea', required: true },
  {
    key: 'tabs',
    title: '页签',
    type: 'tabs',
    panes: [
      {
        id: 'p1',
        fields: [{ key: 'days', title: '天数', type: 'number', required: true }],
      },
    ],
  },
  { key: 'rows', title: '明细', type: 'subform', required: true, fields: [] },
];

describe('assertRequiredFields', () => {
  it('主表必填为空时提示请填写', () => {
    expect(() => assertRequiredFields(fields, { reason: '' }, 'all')).toThrow(
      '请填写事由',
    );
  });

  it('标签页里的必填也算', () => {
    expect(() =>
      assertRequiredFields(fields, { reason: 'x' }, 'all'),
    ).toThrow('请填写天数');
  });

  it('只校验指定 key', () => {
    expect(() =>
      assertRequiredFields(fields, { reason: '' }, ['days']),
    ).toThrow('请填写天数');
  });

  it('子表单不在这里校验', () => {
    expect(() =>
      assertRequiredFields(fields, { reason: 'x', days: 1 }, 'all'),
    ).not.toThrow();
  });

  it('缺省不校验时不抛', () => {
    expect(() =>
      assertRequiredFields(fields, { reason: '' }, []),
    ).not.toThrow(BadRequestException);
  });

  it('不可见字段跳过必填', () => {
    const hidden: FormField[] = [
      {
        key: 'reason',
        title: '事由',
        type: 'textarea',
        required: true,
        visible: false,
      },
    ];
    expect(() => assertRequiredFields(hidden, { reason: '' }, 'all')).not.toThrow();
  });

  it('公式字段跳过必填', () => {
    const withFormula: FormField[] = [
      {
        key: 't',
        title: '合计',
        type: 'number',
        required: true,
        formula: { expr: "$'a' + 1" },
      },
    ];
    expect(() => assertRequiredFields(withFormula, {}, 'all')).not.toThrow();
  });
});
