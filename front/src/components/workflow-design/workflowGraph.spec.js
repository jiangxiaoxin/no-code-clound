import test from 'node:test'
import assert from 'node:assert/strict'
import { toLogicflowGraph, toProductGraph } from './workflowGraph.js'

const product = {
  nodes: [
    { key: 'start', type: 'start', title: '开始', x: 10, y: 20 },
    {
      key: 'n1',
      type: 'approve',
      title: '部门审批',
      x: 30,
      y: 40,
      signMode: 'any',
      commentRequiredOnApprove: false,
      fieldAccess: { field_reason: 'editable' },
      approver: {
        userIds: [1],
        roleIds: [2],
        memberFieldKeys: [],
        sameDeptAsInitiator: true,
        deptLeaderOfInitiator: false,
      },
    },
  ],
  edges: [
    {
      key: 'e1',
      from: 'start',
      to: 'n1',
      title: '提交',
      sort: 1,
      isDefault: false,
      when: { logic: 'all', items: [{ key: 'a', op: 'eq', value: '1' }] },
    },
  ],
}

test('产品图进出 LogicFlow 后关键字段不丢', () => {
  const lf = toLogicflowGraph(product)
  assert.equal(lf.nodes[1].type, 'approve')
  assert.equal(lf.nodes[1].properties.signMode, 'any')
  const back = toProductGraph(lf)
  assert.equal(back.nodes[1].key, 'n1')
  assert.equal(back.nodes[1].type, 'approve')
  assert.equal(back.nodes[1].x, 30)
  assert.equal(back.nodes[1].signMode, 'any')
  assert.deepEqual(back.nodes[1].fieldAccess, { field_reason: 'editable' })
  assert.equal(back.nodes[1].briefFieldKeys, undefined)
  assert.deepEqual(back.nodes[1].approver, product.nodes[1].approver)
  assert.equal(back.edges[0].from, 'start')
  assert.deepEqual(back.edges[0].when, product.edges[0].when)
})

test('简报字段进出 LogicFlow 后不丢', () => {
  const withBrief = {
    ...product,
    nodes: [
      product.nodes[0],
      { ...product.nodes[1], briefFieldKeys: ['field_reason', 'field_days'] },
    ],
  }
  const back = toProductGraph(toLogicflowGraph(withBrief))
  assert.deepEqual(back.nodes[1].briefFieldKeys, ['field_reason', 'field_days'])
})

test('LogicFlow 锚点样式不进产品图', () => {
  const lf = toLogicflowGraph(product)
  lf.nodes[0].anchors = [{ x: 1, y: 2 }]
  lf.nodes[0].style = { fill: 'red' }
  const back = toProductGraph(lf)
  assert.equal(back.nodes[0].anchors, undefined)
  assert.equal(back.nodes[0].style, undefined)
})
