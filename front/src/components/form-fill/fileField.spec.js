import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_FILE_MAX_COUNT,
  DEFAULT_FILE_MAX_SIZE_MB,
  defaultFileFormats,
  fileAcceptFormats,
  fileDownloadable,
  fileItemsOf,
  fileMaxCount,
  fileMaxSizeMB,
  isAllowedFile,
} from './fileField.js'

test('defaults match spec', () => {
  assert.equal(fileMaxCount({}), DEFAULT_FILE_MAX_COUNT)
  assert.equal(fileMaxSizeMB({}), DEFAULT_FILE_MAX_SIZE_MB)
  assert.deepEqual(defaultFileFormats(), ['word', 'excel', 'pdf'])
  assert.deepEqual(fileAcceptFormats({}), ['word', 'excel', 'pdf'])
  assert.equal(fileDownloadable({}), true)
  assert.equal(fileDownloadable({ downloadable: false }), false)
})

test('fileItemsOf keeps url and original name', () => {
  assert.deepEqual(fileItemsOf([{ url: '/uploads/files/a.docx', name: '合同.docx' }]), [
    { url: '/uploads/files/a.docx', name: '合同.docx' },
  ])
  assert.equal(fileItemsOf(['/uploads/files/a.docx'])[0].url, '/uploads/files/a.docx')
})

test('docx is word; png is not', () => {
  const field = { acceptFormats: ['word', 'excel', 'pdf'] }
  assert.equal(
    isAllowedFile(field, {
      name: 'a.docx',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }),
    true,
  )
  assert.equal(isAllowedFile(field, { name: 'a.png', type: 'image/png' }), false)
  assert.equal(isAllowedFile(field, { name: 'a.docx', type: '' }), true)
})
