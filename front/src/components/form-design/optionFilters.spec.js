import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  cloneOptionFilters,
  isTimeFilterField,
  opsForFieldType,
  resolveDynamicPath,
  valueTypeForTimeOp,
  withFilterSystemFields,
} from './optionFilters.js'
import { buildSourceQuery, mergeFilterQueries } from '../form-fill/tableOptions.js'

const now = new Date(2026, 7, 26, 15, 30, 0)

test('time fields use range compare and dynamic ops', () => {
  assert.equal(isTimeFilterField('date'), true)
  assert.equal(isTimeFilterField('input'), false)
  assert.deepEqual(
    opsForFieldType('date').map((item) => item.value),
    ['between', 'eq', 'ne', 'gte', 'lte', 'dynamic'],
  )
  assert.equal(valueTypeForTimeOp('between'), 'custom')
  assert.equal(valueTypeForTimeOp('eq'), 'field')
  assert.equal(valueTypeForTimeOp('dynamic'), 'dynamic')
})

test('filter field list appends system fields', () => {
  const fields = withFilterSystemFields([{ key: 'name', type: 'input', title: '名称' }])
  assert.deepEqual(
    fields.map((item) => item.key),
    ['name', 'createdBy', 'updatedBy', 'createdAt', 'updatedAt'],
  )
  assert.equal(opsForFieldType('member').map((item) => item.value).join(','), 'eq,ne,empty,nempty')
})

test('clone keeps range and dynamic values', () => {
  const cloned = cloneOptionFilters({
    match: 'any',
    conditions: [
      {
        key: 'day',
        op: 'between',
        valueType: 'custom',
        sourceType: 'date',
        value: ['2026-08-01', '2026-08-31'],
      },
      {
        key: 'day',
        op: 'dynamic',
        valueType: 'dynamic',
        sourceType: 'date',
        value: { start: ['past', '2', 'day'], end: ['current', 'day'] },
      },
    ],
  })
  assert.equal(cloned.match, 'any')
  assert.deepEqual(cloned.conditions[0].value, ['2026-08-01', '2026-08-31'])
  assert.deepEqual(cloned.conditions[1].value, {
    start: ['past', '2', 'day'],
    end: ['current', 'day'],
  })
})

test('resolve dynamic path for past days and current day', () => {
  assert.equal(
    resolveDynamicPath(['past', '2', 'day'], 'start', 'date', now),
    '2026-08-24',
  )
  assert.equal(
    resolveDynamicPath(['current', 'day'], 'end', 'date', now),
    '2026-08-26',
  )
})

test('buildSourceQuery maps range and dynamic to between', () => {
  assert.deepEqual(
    buildSourceQuery({
      match: 'all',
      conditions: [
        {
          key: 'day',
          op: 'between',
          value: ['2026-08-01', '2026-08-31'],
        },
      ],
    }),
    {
      match: 'all',
      filters: [
        { key: 'day', op: 'between', value: ['2026-08-01', '2026-08-31'] },
      ],
      page: 1,
      pageSize: 100,
    },
  )
  assert.deepEqual(
    buildSourceQuery({
      match: 'all',
      conditions: [
        {
          key: 'day',
          op: 'dynamic',
          sourceType: 'date',
          value: { start: ['past', '2', 'day'], end: ['current', 'day'] },
        },
      ],
    }),
    {
      match: 'all',
      filters: [
        {
          key: 'day',
          op: 'between',
          value: [
            resolveDynamicPath(['past', '2', 'day'], 'start', 'date'),
            resolveDynamicPath(['current', 'day'], 'end', 'date'),
          ],
        },
      ],
      page: 1,
      pageSize: 100,
    },
  )
})

test('buildSourceQuery serializes date field values to YYYY-MM-DD', () => {
  const picked = new Date(2026, 7, 1)
  const result = buildSourceQuery(
    {
      match: 'all',
      conditions: [
        {
          key: 'day',
          op: 'eq',
          valueType: 'field',
          sourceType: 'date',
          value: 'targetDate',
        },
      ],
    },
    { targetDate: picked },
  )
  assert.deepEqual(result.filters, [
    { key: 'day', op: 'eq', value: '2026-08-01' },
  ])
})

test('buildSourceQuery formats datetime by field format, not ISO', () => {
  const picked = new Date(2026, 7, 1, 14, 30, 0)
  const result = buildSourceQuery(
    {
      match: 'all',
      conditions: [
        {
          key: 'happenedAt',
          op: 'eq',
          valueType: 'field',
          sourceType: 'datetime',
          value: 'targetAt',
        },
      ],
    },
    { targetAt: picked },
    [{ key: 'targetAt', type: 'datetime', format: 'YYYY-MM-DD HH:mm' }],
  )
  assert.deepEqual(result.filters, [
    { key: 'happenedAt', op: 'eq', value: '2026-08-01 14:30' },
  ])
})

test('buildSourceQuery formats date year and datetime gte as wall-clock strings', () => {
  const picked = new Date(2026, 7, 1, 9, 0, 0)
  assert.deepEqual(
    buildSourceQuery(
      {
        match: 'all',
        conditions: [
          {
            key: 'year',
            op: 'eq',
            valueType: 'field',
            sourceType: 'date',
            value: 'targetYear',
          },
        ],
      },
      { targetYear: picked },
      [{ key: 'targetYear', type: 'date', format: 'year' }],
    ).filters,
    [{ key: 'year', op: 'eq', value: '2026' }],
  )
  assert.deepEqual(
    buildSourceQuery(
      {
        match: 'all',
        conditions: [
          {
            key: 'happenedAt',
            op: 'gte',
            valueType: 'field',
            sourceType: 'datetime',
            value: 'targetAt',
          },
        ],
      },
      { targetAt: picked },
    ).filters,
    [{ key: 'happenedAt', op: 'gte', value: '2026-08-01 09:00:00' }],
  )
})

test('mergeFilterQueries keeps a single group as filters', () => {
  assert.deepEqual(
    mergeFilterQueries(
      { match: 'all', filters: [{ key: 'name', op: 'eq', value: '张三' }] },
      { match: 'any', filters: [] },
    ),
    {
      match: 'all',
      filters: [{ key: 'name', op: 'eq', value: '张三' }],
    },
  )
})

test('mergeFilterQueries ands two groups', () => {
  assert.deepEqual(
    mergeFilterQueries(
      { match: 'all', filters: [{ key: 'name', op: 'eq', value: '张三' }] },
      {
        match: 'any',
        filters: [{ key: 'name', op: 'contains', value: '三' }],
      },
    ),
    {
      groups: [
        { match: 'all', filters: [{ key: 'name', op: 'eq', value: '张三' }] },
        { match: 'any', filters: [{ key: 'name', op: 'contains', value: '三' }] },
      ],
    },
  )
})
