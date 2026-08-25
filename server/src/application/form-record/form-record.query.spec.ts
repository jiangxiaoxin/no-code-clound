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
      sort: { updatedAt: -1 },
      skip: 0,
      limit: 20,
      page: 1,
      pageSize: 20,
    });
  });

  it('sorts by createdAt when asked', () => {
    expect(
      buildRecordQuery(fields, { sort: { key: 'createdAt', order: 'asc' } })
        .sort,
    ).toEqual({ createdAt: 1 });
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
      $and: [
        { 'data.name': { $regex: 'a\\.c\\+', $options: 'i' } },
        { 'data.age': 18 },
        { createdBy: 3 },
      ],
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

  it('maps ncontains empty and nempty', () => {
    expect(
      buildRecordQuery(fields, {
        filters: [{ key: 'name', op: 'ncontains', value: 'a.c+' }],
      }).filter,
    ).toEqual({
      'data.name': { $not: { $regex: 'a\\.c\\+', $options: 'i' } },
    });
    expect(
      buildRecordQuery(fields, {
        filters: [{ key: 'name', op: 'empty' }],
      }).filter,
    ).toEqual({
      $or: [
        { 'data.name': { $exists: false } },
        { 'data.name': null },
        { 'data.name': '' },
        { 'data.name': [] },
      ],
    });
    expect(
      buildRecordQuery(fields, {
        filters: [{ key: 'name', op: 'nempty' }],
      }).filter,
    ).toEqual({
      $nor: [
        {
          $or: [
            { 'data.name': { $exists: false } },
            { 'data.name': null },
            { 'data.name': '' },
            { 'data.name': [] },
          ],
        },
      ],
    });
  });

  it('combines filters with $or when match is any', () => {
    expect(
      buildRecordQuery(fields, {
        match: 'any',
        filters: [
          { key: 'name', op: 'eq', value: '张三' },
          { key: 'age', op: 'eq', value: 18 },
        ],
      }).filter,
    ).toEqual({
      $or: [{ 'data.name': '张三' }, { 'data.age': 18 }],
    });
  });

  it('coerces numeric strings when filtering a number field', () => {
    expect(
      buildRecordQuery(fields, {
        filters: [{ key: 'age', op: 'eq', value: '18' }],
      }).filter,
    ).toEqual({ 'data.age': 18 });
  });

  it('keeps multiple nempty filters under match all', () => {
    expect(
      buildRecordQuery(fields, {
        match: 'all',
        filters: [
          { key: 'name', op: 'nempty' },
          { key: 'age', op: 'nempty' },
        ],
      }).filter,
    ).toEqual({
      $and: [
        {
          $nor: [
            {
              $or: [
                { 'data.name': { $exists: false } },
                { 'data.name': null },
                { 'data.name': '' },
                { 'data.name': [] },
              ],
            },
          ],
        },
        {
          $nor: [
            {
              $or: [
                { 'data.age': { $exists: false } },
                { 'data.age': null },
                { 'data.age': '' },
                { 'data.age': [] },
              ],
            },
          ],
        },
      ],
    });
  });

  it('keeps both bounds when filtering the same number field', () => {
    expect(
      buildRecordQuery(fields, {
        filters: [
          { key: 'age', op: 'gte', value: 18 },
          { key: 'age', op: 'lte', value: 30 },
        ],
      }).filter,
    ).toEqual({
      $and: [{ 'data.age': { $gte: 18 } }, { 'data.age': { $lte: 30 } }],
    });
  });
});
