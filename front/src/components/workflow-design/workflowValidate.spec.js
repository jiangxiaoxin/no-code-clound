import test from 'node:test'
import assert from 'node:assert/strict'
import { validatePublishedGraph } from './workflowValidate.js'

const leaveGraph = {
  nodes: [
    { key: 'start', type: 'start', title: '开始', x: 0, y: 0 },
    { key: 'br1', type: 'branch', title: '按请假类型', x: 0, y: 1 },
    {
      key: 'n1',
      type: 'approve',
      title: '部门审批',
      x: 0,
      y: 2,
      approver: { userIds: [], roleIds: [2], memberFieldKeys: [] },
    },
    {
      key: 'n2',
      type: 'approve',
      title: '人事备案',
      x: 0,
      y: 3,
      approver: { userIds: [9], roleIds: [], memberFieldKeys: [] },
    },
    { key: 'end', type: 'end', title: '结束', x: 0, y: 4 },
  ],
  edges: [
    { key: 'e1', from: 'start', to: 'br1' },
    {
      key: 'e2',
      from: 'br1',
      to: 'n1',
      sort: 1,
      when: { logic: 'all', items: [{ key: 'field_leave_type', op: 'eq', value: '事假' }] },
    },
    { key: 'e3', from: 'br1', to: 'n2', sort: 2, isDefault: true },
    { key: 'e4', from: 'n1', to: 'n2' },
    { key: 'e5', from: 'n2', to: 'end' },
  ],
}

const fields = [
  { key: 'field_leave_type', type: 'select', title: '请假类型' },
]

test('请假单完整图可以发布', () => {
  assert.deepEqual(validatePublishedGraph(leaveGraph, fields), [])
})

test('缺其他情况不能发布', () => {
  const broken = {
    ...leaveGraph,
    edges: leaveGraph.edges.filter((edge) => edge.key !== 'e3'),
  }
  const errors = validatePublishedGraph(broken, fields)
  assert.equal(errors.some((item) => item.includes('其他情况')), true)
})

test('环不能发布', () => {
  const cycle = {
    nodes: [
      { key: 'start', type: 'start', title: '开始' },
      {
        key: 'n1',
        type: 'approve',
        title: '一审',
        approver: { userIds: [1], roleIds: [], memberFieldKeys: [] },
      },
      { key: 'end', type: 'end', title: '结束' },
    ],
    edges: [
      { key: 'e1', from: 'start', to: 'n1' },
      { key: 'e2', from: 'n1', to: 'n1' },
      { key: 'e3', from: 'n1', to: 'end' },
    ],
  }
  assert.match(validatePublishedGraph(cycle, fields).join(''), /不能绕回/)
})

test('只勾发起人部门负责人也可以发布', () => {
  const graph = {
    nodes: [
      { key: 'start', type: 'start', title: '开始' },
      {
        key: 'n1',
        type: 'approve',
        title: '部门审批',
        approver: {
          userIds: [],
          roleIds: [],
          memberFieldKeys: [],
          deptLeaderOfInitiator: true,
        },
      },
      { key: 'end', type: 'end', title: '结束' },
    ],
    edges: [
      { key: 'e1', from: 'start', to: 'n1' },
      { key: 'e2', from: 'n1', to: 'end' },
    ],
  }
  const errors = validatePublishedGraph(graph, fields)
  assert.equal(errors.some((item) => item.includes('没有审批人')), false)
})

test('四个来源都空不能发布', () => {
  const graph = {
    nodes: [
      { key: 'start', type: 'start', title: '开始' },
      {
        key: 'n1',
        type: 'approve',
        title: '部门审批',
        approver: { userIds: [], roleIds: [], memberFieldKeys: [] },
      },
      { key: 'end', type: 'end', title: '结束' },
    ],
    edges: [
      { key: 'e1', from: 'start', to: 'n1' },
      { key: 'e2', from: 'n1', to: 'end' },
    ],
  }
  const errors = validatePublishedGraph(graph, fields)
  assert.equal(errors.some((item) => item.includes('没有审批人')), true)
})
