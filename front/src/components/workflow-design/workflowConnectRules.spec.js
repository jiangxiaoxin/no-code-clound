import test from 'node:test'
import assert from 'node:assert/strict'
import { validateCanvasEdge } from './workflowConnectRules.js'

const base = {
  nodes: [
    { key: 'start', type: 'start', title: '开始' },
    { key: 'br1', type: 'branch', title: '分支' },
    { key: 'a1', type: 'approve', title: '部门审批' },
    { key: 'a2', type: 'approve', title: '人事审批' },
    { key: 'end', type: 'end', title: '结束' },
    { key: 'cc1', type: 'cc', title: '抄送' },
  ],
  edges: [],
}

test('分支可以同时连多个审批节点', () => {
  const graph = {
    ...base,
    edges: [
      { key: 'e1', from: 'br1', to: 'a1' },
    ],
  }
  const result = validateCanvasEdge(graph, { from: 'br1', to: 'a2', key: 'e2' })
  assert.equal(result.ok, true)
})

test('开始不能连第二个审批节点', () => {
  const graph = {
    ...base,
    edges: [{ key: 'e1', from: 'start', to: 'a1' }],
  }
  const result = validateCanvasEdge(graph, { from: 'start', to: 'a2', key: 'e2' })
  assert.equal(result.ok, false)
  assert.match(result.message, /多个审批节点/)
})

test('审批不能连第二个审批节点', () => {
  const graph = {
    ...base,
    nodes: [...base.nodes, { key: 'a3', type: 'approve', title: '总监审批' }],
    edges: [{ key: 'e1', from: 'a1', to: 'a2' }],
  }
  const result = validateCanvasEdge(graph, { from: 'a1', to: 'a3', key: 'e2' })
  assert.equal(result.ok, false)
  assert.match(result.message, /多个审批节点/)
})

test('审批连抄送后再连主路审批仍允许', () => {
  const graph = {
    ...base,
    edges: [{ key: 'e_cc', from: 'a1', to: 'cc1' }],
  }
  const result = validateCanvasEdge(graph, { from: 'a1', to: 'a2', key: 'e_main' })
  assert.equal(result.ok, true)
})

test('开始已有主出线时不能再连分支', () => {
  const graph = {
    ...base,
    edges: [{ key: 'e1', from: 'start', to: 'br1' }],
  }
  const result = validateCanvasEdge(graph, { from: 'start', to: 'a1', key: 'e2' })
  assert.equal(result.ok, false)
  assert.match(result.message, /只能有一条主出线/)
})

test('结束节点不能连出线', () => {
  const result = validateCanvasEdge(base, { from: 'end', to: 'a1', key: 'e1' })
  assert.equal(result.ok, false)
  assert.match(result.message, /结束/)
})

test('节点不能连接自己', () => {
  const result = validateCanvasEdge(base, { from: 'a1', to: 'a1', key: 'e1' })
  assert.equal(result.ok, false)
  assert.match(result.message, /自己/)
})

test('不能连回开始节点', () => {
  const result = validateCanvasEdge(base, { from: 'a1', to: 'start', key: 'e1' })
  assert.equal(result.ok, false)
  assert.match(result.message, /开始节点/)
})
