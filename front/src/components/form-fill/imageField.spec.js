import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_IMAGE_MAX_COUNT,
  DEFAULT_IMAGE_MAX_SIZE_MB,
  imageAcceptAttr,
  imageAcceptFormats,
  imageMaxCount,
  imageMaxSizeBytes,
  imageMaxSizeMB,
  imageDownloadName,
  imageUrlsOf,
  isAllowedImageFile,
  imageCompressEnabled,
  compressImageFile,
} from './imageField.js'

test('image limits fall back to default count and 10MB', () => {
  assert.equal(imageMaxCount({}), DEFAULT_IMAGE_MAX_COUNT)
  assert.equal(imageMaxSizeMB({}), DEFAULT_IMAGE_MAX_SIZE_MB)
  assert.equal(imageMaxCount({ maxCount: 3 }), 3)
  assert.equal(imageMaxSizeMB({ maxSizeMB: 2 }), 2)
  assert.equal(imageMaxSizeBytes({ maxSizeMB: 2 }), 2 * 1024 * 1024)
})

test('image formats default to jpeg and png', () => {
  assert.deepEqual(imageAcceptFormats({}), ['jpeg', 'png'])
  assert.deepEqual(imageAcceptFormats({ acceptFormats: ['png'] }), ['png'])
  assert.deepEqual(imageAcceptFormats({ acceptFormats: [] }), ['jpeg', 'png'])
  assert.equal(
    isAllowedImageFile({ acceptFormats: ['png'] }, { type: 'image/png' }),
    true,
  )
  assert.equal(
    isAllowedImageFile({ acceptFormats: ['png'] }, { type: 'image/jpeg' }),
    false,
  )
  assert.equal(
    imageAcceptAttr({ acceptFormats: ['jpeg'] }),
    'image/jpeg,.jpg,.jpeg',
  )
})

test('imageUrlsOf normalizes string or array', () => {
  assert.deepEqual(imageUrlsOf(['/uploads/a.png', '']), ['/uploads/a.png'])
  assert.deepEqual(imageUrlsOf('/uploads/a.png'), ['/uploads/a.png'])
  assert.deepEqual(imageUrlsOf(undefined), [])
})

test('imageDownloadName uses the last path segment', () => {
  assert.equal(imageDownloadName('/uploads/imgs/2026-08-28/a.png'), 'a.png')
  assert.equal(
    imageDownloadName('http://localhost:5173/uploads/b.jpg?x=1'),
    'b.jpg',
  )
  assert.equal(imageDownloadName(''), 'image')
})

test('image compress is off unless explicitly enabled', () => {
  assert.equal(imageCompressEnabled({}), false)
  assert.equal(imageCompressEnabled({ compress: false }), false)
  assert.equal(imageCompressEnabled({ compress: true }), true)
})

test('compressImageFile keeps gif and falls back when canvas is unavailable', async () => {
  const gif = new File(['gif'], 'a.gif', { type: 'image/gif' })
  assert.equal(await compressImageFile(gif), gif)
  const jpeg = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
  assert.equal(await compressImageFile(jpeg), jpeg)
})
