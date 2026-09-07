import test from 'node:test'
import assert from 'node:assert/strict'
import { sortVersions, versionTitle } from './workflowVersion.js'

test('启用中排最前，其余版本号从大到小', () => {
  const rows = sortVersions([
    { version: 1, enabled: false },
    { version: 3, enabled: false },
    { version: 2, enabled: true },
  ])
  assert.deepEqual(rows.map((row) => row.version), [2, 3, 1])
})

test('名称是 流程版本 (V2)', () => {
  assert.equal(versionTitle(2), '流程版本 (V2)')
})
