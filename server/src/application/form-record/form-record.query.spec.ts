import { BadRequestException } from '@nestjs/common';
import { buildRecordQuery } from './form-record.query';

const fields = [
  { key: 'name', type: 'input' },
  { key: 'age', type: 'number' },
  { key: 'pic', type: 'image' },
];

describe('buildRecordQuery', () => {
  it('defaults page sort and empty filter', () => {
    expect(buildRecordQuery(fields, {})).toEqual({
      filter: {},
      sort: { createdAt: -1 },
      skip: 0,
      limit: 20,
      page: 1,
      pageSize: 20,
    });
  });

  it('maps eq to data path and contains to escaped regex', () => {
    const result = buildRecordQuery(fields, {
      filters: [
        { key: 'name', op: 'contains', value: 'a.c+' },
        { key: 'age', op: 'eq', value: 18 },
        { key: 'createdBy', op: 'eq', value: 3 },
      ],
    });
    expect(result.filter).toEqual({
      'data.name': { $regex: 'a\\.c\\+', $options: 'i' },
      'data.age': 18,
      createdBy: 3,
    });
  });

  it('rejects unknown or non-filterable field', () => {
    for (const key of ['missing', 'pic']) {
      try {
        buildRecordQuery(fields, {
          filters: [{ key, op: 'eq', value: 'x' }],
        });
        throw new Error('expected 400');
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException);
        expect((e as BadRequestException).message).toBe('不支持该筛选');
      }
    }
  });

  it('rejects oversized pageSize', () => {
    try {
      buildRecordQuery(fields, { pageSize: 101 });
      throw new Error('expected 400');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).message).toBe('分页大小不正确');
    }
  });
});
