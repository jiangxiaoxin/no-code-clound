import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

test('inline table-data editors import option loaders', () => {
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'FormRecordCell.vue'),
    'utf8',
  )
  assert.match(
    source,
    /import\s*\{[^}]*buildSourceQuery[^}]*recordsToSelectItems[^}]*\}\s*from\s*['"]\.\.\/form-fill\/tableOptions['"]/,
  )
  assert.match(source, /buildSourceQuery\(/)
  assert.match(source, /recordsToSelectItems\(/)
})
