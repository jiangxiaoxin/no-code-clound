import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyDefaultFieldAccessToGraph,
  gridFieldAccessFromStart,
  resolveFieldAccess,
  withDefaultFieldAccess,
} from './fieldAccess.js'

const fields = [
  { key: 'field_reason', type: 'textarea', title: '事由' },
  { key: 'field_days', type: 'number', title: '天数' },
  { type: 'tabs', panes: [{ fields: [{ key: 'field_note', type: 'input', title: '备注' }] }] },
  { key: 'line', type: 'divider' },
  { key: 'rev', type: 'relate-subform' },
]

test('未配置的字段按只读，已写的可编辑/隐藏保持原值', () => {
  assert.equal(resolveFieldAccess({}, 'field_reason'), 'readonly')
  assert.equal(resolveFieldAccess(undefined, 'field_reason'), 'readonly')
  assert.equal(resolveFieldAccess({ field_reason: 'editable' }, 'field_reason'), 'editable')
  assert.equal(resolveFieldAccess({ field_reason: 'hidden' }, 'field_reason'), 'hidden')
  assert.equal(resolveFieldAccess({ field_reason: 'readonly' }, 'field_reason'), 'readonly')
})

test('空 fieldAccess 补全为表单字段只读，跳过分割线和关联子表单', () => {
  assert.deepEqual(withDefaultFieldAccess({}, fields), {
    field_reason: 'readonly',
    field_days: 'readonly',
    field_note: 'readonly',
  })
})

test('补全时不覆盖已配置的可编辑', () => {
  assert.deepEqual(withDefaultFieldAccess({ field_reason: 'editable' }, fields), {
    field_reason: 'editable',
    field_days: 'readonly',
    field_note: 'readonly',
  })
})

test('保存前给开始、审批和抄送节点补上缺省权限，其它节点不动', () => {
  const graph = {
    nodes: [
      { key: 'start', type: 'start', fieldAccess: {} },
      { key: 'n1', type: 'approve', fieldAccess: {} },
      { key: 'cc1', type: 'cc', fieldAccess: {} },
      { key: 'end', type: 'end' },
    ],
    edges: [],
  }
  const next = applyDefaultFieldAccessToGraph(graph, fields)
  assert.deepEqual(next.nodes[0].fieldAccess, {
    field_reason: 'editable',
    field_days: 'editable',
    field_note: 'editable',
  })
  assert.deepEqual(next.nodes[1].fieldAccess, {
    field_reason: 'readonly',
    field_days: 'readonly',
    field_note: 'readonly',
  })
  assert.deepEqual(next.nodes[2].fieldAccess, {
    field_reason: 'readonly',
    field_days: 'readonly',
    field_note: 'readonly',
  })
})

test('gridFieldAccessFromStart 未配置时返回空对象表示全部可编辑', () => {
  assert.deepEqual(gridFieldAccessFromStart({}, fields), {})
  assert.deepEqual(gridFieldAccessFromStart(undefined, fields), {})
})

test('gridFieldAccessFromStart 已配置时缺省为可编辑', () => {
  assert.deepEqual(
    gridFieldAccessFromStart({ field_reason: 'readonly' }, fields),
    {
      field_reason: 'readonly',
      field_days: 'editable',
      field_note: 'editable',
    },
  )
})
