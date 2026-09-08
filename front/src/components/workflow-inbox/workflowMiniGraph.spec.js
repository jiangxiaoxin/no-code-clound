import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveHighlightNodeKey } from './workflowMiniGraph.js'

const graph = {
  nodes: [
    { key: 'n2', type: 'approve', title: '第2次审批' },
    { key: 'cc1', type: 'cc', title: '抄送备注和日期' },
    { key: 'end', type: 'end', title: '结束' },
  ],
  edges: [
    { from: 'n2', to: 'cc1' },
    { from: 'n2', to: 'end' },
  ],
}

test('审批中高亮当前审批节点', () => {
  assert.equal(
    resolveHighlightNodeKey({
      currentNodeKey: 'n2',
      instanceStatus: 'running',
      graph,
      visitedNodeKeys: ['n2'],
    }),
    'n2',
  )
})

test('允许终止后再交时，已通过、已驳回都不高亮结束', () => {
  assert.equal(
    resolveHighlightNodeKey({
      currentNodeKey: 'end',
      instanceStatus: 'approved',
      graph,
      visitedNodeKeys: ['n2', 'end'],
      allowResubmitAfterTerminated: true,
    }),
    '',
  )
  assert.equal(
    resolveHighlightNodeKey({
      currentNodeKey: '',
      instanceStatus: 'rejected',
      graph,
      visitedNodeKeys: ['n2'],
    }),
    '',
  )
})

test('关掉终止后再交时，已通过、已驳回高亮结束', () => {
  assert.equal(
    resolveHighlightNodeKey({
      currentNodeKey: 'end',
      instanceStatus: 'approved',
      graph,
      visitedNodeKeys: ['n2', 'end'],
      allowResubmitAfterTerminated: false,
    }),
    'end',
  )
  assert.equal(
    resolveHighlightNodeKey({
      currentNodeKey: '',
      instanceStatus: 'rejected',
      graph,
      visitedNodeKeys: ['n2'],
      allowResubmitAfterTerminated: false,
    }),
    'end',
  )
})

test('草稿不清当前节点时不高亮结束', () => {
  assert.equal(
    resolveHighlightNodeKey({
      currentNodeKey: '',
      instanceStatus: 'draft',
      graph,
      visitedNodeKeys: [],
      allowResubmitAfterTerminated: false,
    }),
    '',
  )
})
