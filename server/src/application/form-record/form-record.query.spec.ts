import { BadRequestException } from '@nestjs/common';
import {
  buildRecordQuery,
  dictCodesForFilters,
  mapDictFilterValue,
  rewriteDictFilterValues,
} from './form-record.query';

const fields = [
  { key: 'name', type: 'input' },
  { key: 'age', type: 'number' },
  { key: 'happenedAt', type: 'datetime' },
  { key: 'tags', type: 'checkbox' },
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

  it('supports multiple sort rules in priority order', () => {
    expect(
      buildRecordQuery(fields, {
        sort: [
          { key: 'name', order: 'asc' },
          { key: 'age', order: 'desc' },
        ],
      }).sort,
    ).toEqual({ 'data.name': 1, 'data.age': -1 });
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

  it('ands filter groups so default filters and search can both apply', () => {
    expect(
      buildRecordQuery(fields, {
        groups: [
          {
            match: 'all',
            filters: [{ key: 'name', op: 'eq', value: '张三' }],
          },
          {
            match: 'any',
            filters: [
              { key: 'name', op: 'contains', value: '三' },
              { key: 'tags', op: 'contains', value: '三' },
            ],
          },
        ],
      }).filter,
    ).toEqual({
      $and: [
        { 'data.name': '张三' },
        {
          $or: [
            { 'data.name': { $regex: '三', $options: 'i' } },
            { 'data.tags': { $regex: '三', $options: 'i' } },
          ],
        },
      ],
    });
  });

  it('coerces numeric strings when filtering a number field', () => {
    expect(
      buildRecordQuery(fields, {
        filters: [{ key: 'age', op: 'eq', value: '18' }],
      }).filter,
    ).toEqual({ 'data.age': 18 });
  });

  it('contains on number matches stringified value', () => {
    expect(
      buildRecordQuery(fields, {
        filters: [{ key: 'age', op: 'contains', value: '18' }],
      }).filter,
    ).toEqual({
      $expr: {
        $regexMatch: {
          input: { $toString: { $ifNull: ['$data.age', ''] } },
          regex: '18',
          options: 'i',
        },
      },
    });
  });

  it('contains on checkbox matches array elements', () => {
    expect(
      buildRecordQuery(fields, {
        filters: [{ key: 'tags', op: 'contains', value: 'a.c+' }],
      }).filter,
    ).toEqual({
      'data.tags': { $regex: 'a\\.c\\+', $options: 'i' },
    });
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

  it('maps between to a closed range', () => {
    expect(
      buildRecordQuery(
        [
          { key: 'day', type: 'date' },
          { key: 'name', type: 'input' },
        ],
        {
          filters: [
            { key: 'day', op: 'between', value: ['2026-08-01', '2026-08-31'] },
          ],
        },
      ).filter,
    ).toEqual({
      'data.day': { $gte: '2026-08-01', $lte: '2026-08-31' },
    });
  });

  it('matches date eq by year and month wall-clock strings', () => {
    expect(
      buildRecordQuery([{ key: 'day', type: 'date' }], {
        filters: [{ key: 'day', op: 'eq', value: '2026' }],
      }).filter,
    ).toEqual({
      'data.day': { $gte: '2026-01-01', $lt: '2027-01-01' },
    });
    expect(
      buildRecordQuery([{ key: 'day', type: 'date' }], {
        filters: [{ key: 'day', op: 'eq', value: '2026-08' }],
      }).filter,
    ).toEqual({
      'data.day': { $gte: '2026-08-01', $lt: '2026-09-01' },
    });
  });

  it('matches datetime wall-clock eq by the value format', () => {
    expect(
      buildRecordQuery(fields, {
        filters: [{ key: 'happenedAt', op: 'eq', value: '2026-08-26 14:20:35' }],
      }).filter,
    ).toEqual({
      'data.happenedAt': {
        $gte: new Date(2026, 7, 26, 14, 20, 35),
        $lt: new Date(2026, 7, 26, 14, 20, 36),
      },
    });
    expect(
      buildRecordQuery(fields, {
        filters: [{ key: 'happenedAt', op: 'eq', value: '2026-08-26 14:20' }],
      }).filter,
    ).toEqual({
      'data.happenedAt': {
        $gte: new Date(2026, 7, 26, 14, 20, 0),
        $lt: new Date(2026, 7, 26, 14, 21, 0),
      },
    });
  });

  it('parses datetime gte from a wall-clock string', () => {
    expect(
      buildRecordQuery(fields, {
        filters: [
          { key: 'happenedAt', op: 'gte', value: '2026-08-01 00:00:00' },
        ],
      }).filter,
    ).toEqual({
      'data.happenedAt': { $gte: new Date(2026, 7, 1, 0, 0, 0) },
    });
  });

  it('filters system createdAt and updatedBy', () => {
    expect(
      buildRecordQuery(fields, {
        filters: [
          {
            key: 'createdAt',
            op: 'between',
            value: ['2026-08-01T00:00:00.000Z', '2026-08-31T23:59:59.000Z'],
          },
        ],
      }).filter,
    ).toEqual({
      createdAt: {
        $gte: new Date('2026-08-01T00:00:00.000Z'),
        $lte: new Date('2026-08-31T23:59:59.000Z'),
      },
    });
    expect(
      buildRecordQuery(fields, {
        filters: [{ key: 'updatedBy', op: 'eq', value: '3' }],
      }).filter,
    ).toEqual({ updatedBy: 3 });
  });

  it.each([
    ['year', '2026-08-26T14:20:35+08:00', '2025-12-31T16:00:00.000Z', '2026-12-31T16:00:00.000Z'],
    ['month', '2026-08-26T14:20:35+08:00', '2026-07-31T16:00:00.000Z', '2026-08-31T16:00:00.000Z'],
    ['day', '2026-08-26T14:20:35+08:00', '2026-08-25T16:00:00.000Z', '2026-08-26T16:00:00.000Z'],
    ['hour', '2026-08-26T14:20:35+08:00', '2026-08-26T06:00:00.000Z', '2026-08-26T07:00:00.000Z'],
    ['minute', '2026-08-26T14:20:35+08:00', '2026-08-26T06:20:00.000Z', '2026-08-26T06:21:00.000Z'],
    ['second', '2026-08-26T14:20:35+08:00', '2026-08-26T06:20:35.000Z', '2026-08-26T06:20:36.000Z'],
  ])('matches datetime eq by %s precision', (precision, value, start, end) => {
    expect(
      buildRecordQuery(fields, {
        filters: [{ key: 'createdAt', op: 'eq', value, precision }],
      }).filter,
    ).toEqual({
      createdAt: { $gte: new Date(start), $lt: new Date(end) },
    });
  });

  it('applies precision to form datetime fields and supports in', () => {
    expect(
      buildRecordQuery(fields, {
        filters: [
          {
            key: 'happenedAt',
            op: 'in',
            value: ['2026-08-26T06:20:35.000Z', '2026-08-26T06:21:00.000Z'],
            precision: 'second',
          },
        ],
      }).filter,
    ).toEqual({
      $or: [
        {
          'data.happenedAt': {
            $gte: new Date('2026-08-26T06:20:35.000Z'),
            $lt: new Date('2026-08-26T06:20:36.000Z'),
          },
        },
        {
          'data.happenedAt': {
            $gte: new Date('2026-08-26T06:21:00.000Z'),
            $lt: new Date('2026-08-26T06:21:01.000Z'),
          },
        },
      ],
    });
  });

  it('rejects precision for non-datetime fields', () => {
    expect(() =>
      buildRecordQuery(fields, {
        filters: [{ key: 'name', op: 'eq', value: 'x', precision: 'day' }],
      }),
    ).toThrow(BadRequestException);
  });

  it('filters fields inside tabs panes', () => {
    expect(
      buildRecordQuery(
        [
          {
            key: 'tabs_1',
            type: 'tabs',
            panes: [
              {
                id: 'p1',
                title: 'A',
                fields: [{ key: 'inner', type: 'input' }],
              },
            ],
          },
        ],
        { filters: [{ key: 'inner', op: 'eq', value: 'x' }] },
      ).filter,
    ).toEqual({ 'data.inner': 'x' });
  });
});

describe('rewriteDictFilterValues', () => {
  const dictFields = [
    { key: 'status', type: 'radio', dictCode: '11' },
    { key: 'name', type: 'input' },
  ];
  const itemsByCode = new Map([
    [
      '11',
      [
        { label: '启用', value: '1' },
        { label: '停用', value: '2' },
      ],
    ],
  ]);

  it('maps dictionary labels to stored values for eq and ne', () => {
    expect(mapDictFilterValue('启用', itemsByCode.get('11') ?? [])).toBe('1');
    expect(mapDictFilterValue('1', itemsByCode.get('11') ?? [])).toBe('1');
    expect(
      rewriteDictFilterValues(
        dictFields,
        [
          { key: 'status', op: 'eq', value: '启用' },
          { key: 'status', op: 'ne', value: '停用' },
          { key: 'name', op: 'eq', value: '青岛' },
        ],
        itemsByCode,
      ),
    ).toEqual([
      { key: 'status', op: 'eq', value: '1' },
      { key: 'status', op: 'ne', value: '2' },
      { key: 'name', op: 'eq', value: '青岛' },
    ]);
  });

  it('maps in-list labels and leaves contains unchanged', () => {
    expect(
      rewriteDictFilterValues(
        dictFields,
        [
          { key: 'status', op: 'in', value: ['启用', '2'] },
          { key: 'status', op: 'contains', value: '启用' },
        ],
        itemsByCode,
      ),
    ).toEqual([
      { key: 'status', op: 'in', value: ['1', '2'] },
      { key: 'status', op: 'contains', value: '启用' },
    ]);
  });

  it('collects dict codes used by value filters', () => {
    expect(
      dictCodesForFilters(dictFields, [
        { key: 'status', op: 'eq', value: '启用' },
        { key: 'name', op: 'eq', value: '青岛' },
      ]),
    ).toEqual(['11']);
  });

  it('resolves dictCode for fields inside tabs panes', () => {
    const nested = [
      {
        key: 'tabs_1',
        type: 'tabs',
        panes: [
          {
            id: 'p1',
            title: 'A',
            fields: [{ key: 'status', type: 'radio', dictCode: '11' }],
          },
        ],
      },
    ];
    expect(
      dictCodesForFilters(nested, [
        { key: 'status', op: 'eq', value: '启用' },
      ]),
    ).toEqual(['11']);
    expect(
      rewriteDictFilterValues(
        nested,
        [{ key: 'status', op: 'eq', value: '启用' }],
        itemsByCode,
      ),
    ).toEqual([{ key: 'status', op: 'eq', value: '1' }]);
  });
});

describe('buildRecordQuery ids / excludeIds', () => {
  const idA = '64b7f9c2e3a1b2c3d4e5f601';
  const idB = '64b7f9c2e3a1b2c3d4e5f602';

  it('ids 只保留合法 ObjectId', () => {
    const built = buildRecordQuery([], { ids: [idA, 'not-an-id'] });
    const clause = built.filter as { _id: { $in: { toHexString(): string }[] } };
    expect(clause._id.$in.map((item) => item.toHexString())).toEqual([idA]);
  });

  it('ids 全非法时查不到数据', () => {
    const built = buildRecordQuery([], { ids: ['nope'] });
    const clause = built.filter as { _id: { $in: unknown[] } };
    expect(clause._id.$in).toEqual([]);
  });

  it('excludeIds 与其它条件并存', () => {
    const nameFields = [{ key: 'name', type: 'input' }] as never;
    const built = buildRecordQuery(nameFields, {
      filters: [{ key: 'name', op: 'eq', value: 'A' }],
      excludeIds: [idB],
    });
    const parts = built.filter.$and as Record<string, unknown>[];
    expect(parts).toHaveLength(2);
    expect(parts[0]).toEqual({ 'data.name': 'A' });
    const nin = (parts[1] as { _id: { $nin: { toHexString(): string }[] } })._id
      .$nin;
    expect(nin.map((item) => item.toHexString())).toEqual([idB]);
  });

  it('excludeIds 全非法时不加条件', () => {
    const built = buildRecordQuery([], { excludeIds: ['nope'] });
    expect(built.filter).toEqual({});
  });

  it('不传时行为不变', () => {
    const built = buildRecordQuery([], {});
    expect(built.filter).toEqual({});
    expect(built.sort).toEqual({ updatedAt: -1 });
  });

  it('pickApproved 且流程表强制已通过', () => {
    const built = buildRecordQuery(fields, {
      pickApproved: true,
      formKind: 'workflow',
    });
    expect(built.filter).toEqual({ workflowStatus: 'approved' });
  });

  it('普通表 pickApproved 不加已通过条件', () => {
    const built = buildRecordQuery(fields, {
      pickApproved: true,
      formKind: 'normal',
    });
    expect(built.filter).toEqual({});
  });

  it('带 ids 时即使 pickApproved 也不加已通过条件', () => {
    const id = '64b64c4c4c4c4c4c4c4c4c4c';
    const built = buildRecordQuery(fields, {
      pickApproved: true,
      formKind: 'workflow',
      ids: [id],
    });
    expect(built.filter).not.toEqual(
      expect.objectContaining({ workflowStatus: 'approved' }),
    );
    expect(JSON.stringify(built.filter)).not.toContain('workflowStatus');
  });
});
