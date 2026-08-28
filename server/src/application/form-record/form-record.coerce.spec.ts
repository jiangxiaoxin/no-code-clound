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
});
