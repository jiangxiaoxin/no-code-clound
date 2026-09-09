import { BadRequestException } from '@nestjs/common';
import { assertSubformConstraints } from './form-record.persist';
import { FormField } from './form-record.types';

// 评审发现的子表单问题：必填子列被设为「不可见」后，
// 填报界面不渲染它，服务端却仍按必填拦截，单据永远交不上去
const fields: FormField[] = [
  {
    key: 'sub',
    type: 'subform',
    title: '设备明细',
    required: true,
    fields: [
      { key: 'name', type: 'input', title: '设备名', required: true },
      {
        key: 'price',
        type: 'number',
        title: '单价',
        required: true,
        visible: false,
      },
    ],
  },
];

describe('assertSubformConstraints 隐藏列', () => {
  it('隐藏的必填子列没填不拦提交', () => {
    expect(() =>
      assertSubformConstraints(fields, { sub: [{ name: '相机', price: null }] }),
    ).not.toThrow();
  });

  it('可见的必填子列没填仍要拦', () => {
    expect(() =>
      assertSubformConstraints(fields, { sub: [{ name: '', price: null }] }),
    ).toThrow(BadRequestException);
  });

  it('必填子表被设为不可见后可以不填', () => {
    const hiddenContainer: FormField[] = [
      {
        key: 'sub',
        type: 'subform',
        title: '设备明细',
        required: true,
        visible: false,
        fields: [{ key: 'name', type: 'input', title: '设备名', required: true }],
      },
    ];
    expect(() => assertSubformConstraints(hiddenContainer, {})).not.toThrow();
  });
});
