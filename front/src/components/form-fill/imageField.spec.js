import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_IMAGE_MAX_COUNT,
  DEFAULT_IMAGE_MAX_SIZE_MB,
  imageMaxCount,
  imageMaxSizeBytes,
  imageMaxSizeMB,
  imageUrlsOf,
} from './imageField.js'

test('image limits fall back to 9 pictures and 10MB', () => {
  assert.equal(imageMaxCount({}), DEFAULT_IMAGE_MAX_COUNT)
  assert.equal(imageMaxSizeMB({}), DEFAULT_IMAGE_MAX_SIZE_MB)
  assert.equal(imageMaxCount({ maxCount: 3 }), 3)
  assert.equal(imageMaxSizeMB({ maxSizeMB: 2 }), 2)
  assert.equal(imageMaxSizeBytes({ maxSizeMB: 2 }), 2 * 1024 * 1024)
})

test('imageUrlsOf normalizes string or array', () => {
  assert.deepEqual(imageUrlsOf(['/uploads/a.png', '']), ['/uploads/a.png'])
  assert.deepEqual(imageUrlsOf('/uploads/a.png'), ['/uploads/a.png'])
  assert.deepEqual(imageUrlsOf(undefined), [])
})
