import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildRecordData, serializeValue } from './fillValues.js'

describe('serializeValue date', () => {
  it('keeps YYYY-MM-DD strings as calendar dates', () => {
    assert.equal(
      serializeValue({ type: 'date' }, '2026-08-27'),
      '2026-08-27',
    )
  })

  it('does not shift a stored date when building an edit payload', () => {
    assert.deepEqual(
      buildRecordData([{ key: 'day', type: 'date' }], { day: '2026-01-01' }),
      { day: '2026-01-01' },
    )
  })

  it('serializes a local Date from the picker without UTC conversion', () => {
    assert.equal(
      serializeValue({ type: 'date' }, new Date(2026, 7, 27)),
      '2026-08-27',
    )
  })

  it('normalizes year and month formats from calendar strings', () => {
    assert.equal(
      serializeValue({ type: 'date', format: 'year' }, '2026-08-27'),
      '2026-01-01',
    )
    assert.equal(
      serializeValue({ type: 'date', format: 'month' }, '2026-08'),
      '2026-08-01',
    )
  })
})
