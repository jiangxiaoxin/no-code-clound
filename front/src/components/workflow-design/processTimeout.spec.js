import assert from 'node:assert/strict'
import test from 'node:test'
import {
  emptyProcessTimeout,
  normalizeProcessTimeout,
  processTimeoutErrors,
} from './processTimeout.js'

test('默认关闭且不报错', () => {
  assert.equal(emptyProcessTimeout().enabled, false)
  assert.deepEqual(processTimeoutErrors(undefined), [])
  assert.deepEqual(processTimeoutErrors({ enabled: false }), [])
})

test('开启后必须填完整', () => {
  assert.match(
    processTimeoutErrors({ enabled: true, mode: 'absolute', absoluteAt: '' }).join(''),
    /截止时间/,
  )
  assert.match(
    processTimeoutErrors({ enabled: true, mode: 'duration', duration: 0 }).join(''),
    /有效时长/,
  )
})

test('合法配置通过', () => {
  assert.deepEqual(
    processTimeoutErrors({
      enabled: true,
      mode: 'absolute',
      absoluteAt: '2026-09-12 18:00:00',
    }),
    [],
  )
  assert.deepEqual(
    processTimeoutErrors({
      enabled: true,
      mode: 'duration',
      duration: 2,
      durationUnit: 'day',
    }),
    [],
  )
})

test('normalize 补默认值', () => {
  const next = normalizeProcessTimeout({ enabled: true, mode: 'duration' })
  assert.equal(next.duration, 1)
  assert.equal(next.durationUnit, 'hour')
})
