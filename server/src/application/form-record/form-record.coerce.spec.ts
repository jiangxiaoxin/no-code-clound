import { BadRequestException } from '@nestjs/common';
import { coerceRecordData, mergeRecordData } from './form-record.coerce';

const fields = [
  { key: 'name', type: 'input' },
  { key: 'age', type: 'number' },
  { key: 'tags', type: 'select-multiple' },
  { key: 'split', type: 'divider' },
  { key: 'me', type: 'currentUser' },
  { key: 'myDept', type: 'currentUserDept' },
  { key: 'kids', type: 'subform' },
  { key: 'pics', type: 'image' },
  { key: 'docs', type: 'file' },
  { key: 'addr', type: 'address' },
];

describe('coerceRecordData', () => {
  it('drops unknown keys and divider, keeps coerced values', () => {
    const data = coerceRecordData(fields, {
      name: '张三',
      age: 18,
      tags: ['a', 'b'],
      split: 'x',
      me: '张三',
      myDept: '研发部',
      extra: 'no',
    });
    expect(data).toEqual({
      name: '张三',
      age: 18,
      tags: ['a', 'b'],
    });
  });

  it('returns empty object when fields is null', () => {
    expect(coerceRecordData(null, { name: '张三' })).toEqual({});
  });

  it('stores empty array when subform is not an array', () => {
    expect(coerceRecordData(fields, { kids: 'nope' })).toEqual({ kids: [] });
  });

  it('coerces subform rows and drops empty ones', () => {
    const out = coerceRecordData(
      [
        {
          key: 'lines',
          type: 'subform',
          fields: [
            { key: 'name', type: 'input' },
            { key: 'qty', type: 'number' },
          ],
        },
      ],
      { lines: [{ name: '', qty: null }, { name: 'A', qty: 2 }] },
    );
    expect(out.lines).toEqual([{ name: 'A', qty: 2 }]);
  });

  it('rejects empty subform row when a child is required', () => {
    expect(() =>
      coerceRecordData(
        [
          {
            key: 'lines',
            type: 'subform',
            title: '子表单',
            fields: [
              { key: 'name', type: 'input', title: '物料名称', required: true },
              { key: 'qty', type: 'number' },
            ],
          },
        ],
        { lines: [{ name: '', qty: null }] },
      ),
    ).toThrow('[子表单.物料名称]不能为空');
  });

  it('必填子列被设为不可见后，空行不再拿隐藏必填拦人', () => {
    // 隐藏列在填报界面不渲染，用户留空的行不能拿它当必填报错
    const out = coerceRecordData(
      [
        {
          key: 'lines',
          type: 'subform',
          title: '子表单',
          fields: [
            {
              key: 'name',
              type: 'input',
              title: '物料名称',
              required: true,
              visible: false,
            },
            { key: 'qty', type: 'number', title: '数量' },
          ],
        },
      ],
      { lines: [{ name: '', qty: null }] },
    );
    expect(out.lines).toEqual([]);
  });

  it('stores image urls as an array', () => {
    expect(
      coerceRecordData(fields, { pics: ['/uploads/a.png'] }),
    ).toEqual({ pics: ['/uploads/a.png'] });
  });

  it('stores file items as url and name objects', () => {
    expect(
      coerceRecordData(fields, {
        docs: [{ url: '/uploads/files/a.docx', name: '合同.docx' }],
      }),
    ).toEqual({
      docs: [{ url: '/uploads/files/a.docx', name: '合同.docx' }],
    });
    expect(
      coerceRecordData(fields, { docs: ['/uploads/files/a.docx'] }),
    ).toEqual({
      docs: [{ url: '/uploads/files/a.docx', name: 'a.docx' }],
    });
  });

  it('omits empty number', () => {
    expect(coerceRecordData(fields, { age: null })).toEqual({});
    expect(coerceRecordData(fields, { age: '' })).toEqual({});
  });

  it('throws when payload is not an object', () => {
    try {
      coerceRecordData(fields, null);
      throw new Error('expected 400');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).message).toBe('请提交记录数据');
    }
  });

  it('throws when number is not finite', () => {
    try {
      coerceRecordData(fields, { age: '18' });
      throw new Error('expected 400');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).message).toBe('字段值类型不正确');
    }
  });

  it('stores address objects and rejects invalid types', () => {
    expect(
      coerceRecordData(fields, {
        addr: {
          ids: ['370000', '370200'],
          labels: ['山东省', '青岛市'],
          detail: '  香港中路  ',
        },
      }),
    ).toEqual({
      addr: {
        ids: ['370000', '370200'],
        labels: ['山东省', '青岛市'],
        detail: '香港中路',
      },
    });
    try {
      coerceRecordData(fields, { addr: '山东省 / 青岛市' });
      throw new Error('expected 400');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).message).toBe('字段值类型不正确');
    }
  });

  it('coerces fields inside tabs and drops the tabs key', () => {
    const nested = [
      { key: 'before', type: 'input' },
      {
        key: 'tabs_1',
        type: 'tabs',
        panes: [
          {
            id: 'p1',
            title: 'A',
            fields: [{ key: 'name', type: 'input' }],
          },
        ],
      },
    ];
    expect(
      coerceRecordData(nested, {
        before: 'x',
        tabs_1: { no: true },
        name: '张三',
      }),
    ).toEqual({ before: 'x', name: '张三' });
  });
});


describe('mergeRecordData', () => {
  it('keeps unmentioned keys and deletes explicit null', () => {
    const next = mergeRecordData(
      { name: '旧', age: 1 },
      { age: null, tags: ['x'] },
      fields,
    );
    expect(next).toEqual({ name: '旧', tags: ['x'] });
  });

  it('member keeps positive int and drops empty', () => {
    expect(
      coerceRecordData([{ key: 'owner', type: 'member' }], { owner: 8 }),
    ).toEqual({ owner: 8 });
    expect(
      coerceRecordData([{ key: 'owner', type: 'member' }], { owner: '' }),
    ).toEqual({});
  });

  it('member-multiple keeps unique positive ints in order', () => {
    expect(
      coerceRecordData([{ key: 'owners', type: 'member-multiple' }], {
        owners: [3, 3, 1],
      }),
    ).toEqual({ owners: [3, 1] });
  });

  it('dept-multiple keeps unique positive ints in order', () => {
    expect(
      coerceRecordData([{ key: 'depts', type: 'dept-multiple' }], {
        depts: [3, 3, 1],
      }),
    ).toEqual({ depts: [3, 1] });
  });

  it('rejects non-positive member id', () => {
    expect(() =>
      coerceRecordData([{ key: 'owner', type: 'member' }], { owner: 0 }),
    ).toThrow(BadRequestException);
  });

  it('drops client serialNumber on coerce and keeps existing on merge', () => {
    const serialFields = [
      { key: 'name', type: 'input' },
      { key: 'sn', type: 'serialNumber' },
    ];
    expect(coerceRecordData(serialFields, { name: 'A', sn: 'hack' })).toEqual({
      name: 'A',
    });
    expect(
      mergeRecordData(
        { name: 'A', sn: '20260831-00001' },
        { name: 'B', sn: 'hack' },
        serialFields,
      ),
    ).toEqual({ name: 'B', sn: '20260831-00001' });
  });

  it('drops client formula values on coerce and merge', () => {
    const formulaFields = [
      { key: 'a', type: 'number' },
      { key: 't', type: 'number', formula: { expr: "$'a' + 1" } },
    ];
    expect(coerceRecordData(formulaFields, { a: 1, t: 999 })).toEqual({ a: 1 });
    expect(
      mergeRecordData({ a: 1, t: 2 }, { a: 3, t: 999 }, formulaFields),
    ).toEqual({ a: 3 });
  });

  it('relate-subform 不入库', () => {
    const fields = [
      { key: 'name', type: 'input' },
      { key: 'rs1', type: 'relate-subform' },
    ];
    expect(coerceRecordData(fields, { name: 'A', rs1: 'x' })).toEqual({ name: 'A' });
  });
});
