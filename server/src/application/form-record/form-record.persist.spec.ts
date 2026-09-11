import { BadRequestException } from '@nestjs/common';
import { assertSubformConstraints } from './form-record.persist';
import { FormField } from './form-record.types';

const detail: FormField = {
  key: 'rows',
  title: '订单明细',
  type: 'subform',
  required: true,
  fields: [
    { key: 'name', title: '物料名称', type: 'input', required: true },
    { key: 'qty', title: '数量', type: 'number' },
  ],
};

describe('assertSubformConstraints', () => {
  it('可见且必填的子表空着时拦住', () => {
    expect(() => assertSubformConstraints([detail], {})).toThrow(
      BadRequestException,
    );
    expect(() => assertSubformConstraints([detail], {})).toThrow(
      '[订单明细]不能为空',
    );
  });

  it('关掉是否可见后，必填子表空着也不拦', () => {
    const hidden: FormField[] = [{ ...detail, visible: false }];
    expect(() => assertSubformConstraints(hidden, {})).not.toThrow();
  });

  it('子列关掉是否可见后，填了看得见的列即可', () => {
    const fields: FormField[] = [
      {
        ...detail,
        fields: [
          {
            key: 'name',
            title: '物料名称',
            type: 'input',
            required: true,
            visible: false,
          },
          { key: 'qty', title: '数量', type: 'number' },
        ],
      },
    ];
    expect(() =>
      assertSubformConstraints(fields, { rows: [{ qty: 2 }] }),
    ).not.toThrow();
  });

  it('看得见的必填子列空着仍拦住', () => {
    expect(() =>
      assertSubformConstraints([detail], { rows: [{ qty: 2 }] }),
    ).toThrow('[订单明细.物料名称]不能为空');
  });

  it('流程节点只校验当前能改的子表', () => {
    expect(() =>
      assertSubformConstraints([detail], {}, ['field_reason']),
    ).not.toThrow();
    expect(() =>
      assertSubformConstraints([detail], {}, ['rows']),
    ).toThrow('[订单明细]不能为空');
  });

  it('公式子列不算必填', () => {
    const fields: FormField[] = [
      {
        ...detail,
        fields: [
          {
            key: 'name',
            title: '物料名称',
            type: 'input',
            required: true,
            formula: { expr: "$'qty'" },
          },
          { key: 'qty', title: '数量', type: 'number' },
        ],
      },
    ];
    expect(() =>
      assertSubformConstraints(fields, { rows: [{ qty: 2 }] }),
    ).not.toThrow();
  });
});
