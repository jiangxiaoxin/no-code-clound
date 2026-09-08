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

test('审批节点转交加签缺省关闭', () => {
  const product = toProductGraph({
    nodes: [{
      id: 'n1',
      type: 'approve',
      x: 0,
      y: 0,
      properties: { key: 'n1', title: '部门审批', type: 'approve' },
    }],
    edges: [],
  })
  assert.equal(product.nodes[0].allowTransfer, false)
  assert.equal(product.nodes[0].allowAddSign, false)
})

test('开始节点终止后再交开关进出 LogicFlow 后不丢，缺省为开', () => {
  const withFlag = {
    ...product,
    nodes: [
      { ...product.nodes[0], allowResubmitAfterTerminated: false },
      product.nodes[1],
    ],
  }
  const backOff = toProductGraph(toLogicflowGraph(withFlag))
  assert.equal(backOff.nodes[0].allowResubmitAfterTerminated, false)

  const backDefault = toProductGraph(toLogicflowGraph(product))
  assert.equal(backDefault.nodes[0].allowResubmitAfterTerminated, true)

  const missing = toProductGraph({
    nodes: [
      {
        id: 'start',
        type: 'start',
        x: 0,
        y: 0,
        properties: { key: 'start', title: '开始', type: 'start' },
      },
    ],
    edges: [],
  })
  assert.equal(missing.nodes[0].allowResubmitAfterTerminated, true)
})

test('LogicFlow 锚点样式不进产品图', () => {
  const lf = toLogicflowGraph(product)
  lf.nodes[0].anchors = [{ x: 1, y: 2 }]
  lf.nodes[0].style = { fill: 'red' }
  const back = toProductGraph(lf)
  assert.equal(back.nodes[0].anchors, undefined)
  assert.equal(back.nodes[0].style, undefined)
})
