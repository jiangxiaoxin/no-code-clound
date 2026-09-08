import assert from 'node:assert/strict'
import test from 'node:test'
import { buildProgressRows } from './workflowProgressList.js'

const formatTime = (value) => String(value || '')

test('提交记录排在审批待办前面', () => {
  const rows = buildProgressRows(
    {
      graph: {
        nodes: [
          { key: 'start', type: 'start', title: '开始' },
          { key: 'n1', type: 'approve', title: '部门审批' },
        ],
      },
      tasks: [
        {
          nodeKey: 'n1',
          round: 1,
          assigneeName: '经理甲',
          status: 'pending',
          createdAt: '2026-09-08T11:00:01.000Z',
        },
        {
          nodeKey: 'start',
          round: 1,
          assigneeName: '张三',
          status: 'done',
          action: 'submit',
          finishedAt: '2026-09-08T11:00:00.000Z',
        },
      ],
    },
    formatTime,
  )
  assert.equal(rows.length, 2)
  assert.equal(rows[0].assigneeName, '张三')
  assert.equal(rows[0].nodeTitle, '开始')
  assert.equal(rows[0].statusText, '已提交')
  assert.equal(rows[1].assigneeName, '经理甲')
  assert.equal(rows[1].nodeTitle, '部门审批')
  assert.equal(rows[1].statusText, '待处理')
})

test('第二轮提交显示再次提交', () => {
  const rows = buildProgressRows(
    {
      graph: { nodes: [{ key: 'start', type: 'start', title: '开始' }] },
      tasks: [
        {
          nodeKey: 'start',
          round: 2,
          assigneeName: '张三',
          status: 'done',
          action: 'submit',
          finishedAt: '2026-09-08T12:00:00.000Z',
        },
      ],
    },
    formatTime,
  )
  assert.equal(rows[0].statusText, '再次提交')
})

test('审批意见与取消原因单独输出', () => {
  const rows = buildProgressRows(
    {
      graph: { nodes: [{ key: 'n1', type: 'approve', title: '审批' }] },
      tasks: [
        {
          nodeKey: 'n1',
          assigneeName: 'jiang1',
          status: 'done',
          action: 'approve',
          comment: '我同意',
          finishedAt: '2026-09-08T12:00:00.000Z',
        },
        {
          nodeKey: 'n1',
          assigneeName: 'jiang1',
          status: 'cancelled',
          cancelReason: '发起人撤回',
          finishedAt: '2026-09-08T12:01:00.000Z',
        },
      ],
    },
    formatTime,
  )
  assert.equal(rows[0].comment, '我同意')
  assert.equal(rows[0].statusText, '同意')
  assert.equal(rows[1].comment, '发起人撤回')
  assert.equal(rows[1].statusText, '未处理（已取消）')
})

test('加签系统说明把用户 id 显示为人名', () => {
  const rows = buildProgressRows(
    {
      notes: [
        {
          at: '2026-09-08T12:00:00.000Z',
          text: '4 加签 6：你也审批一下',
        },
      ],
      names: {
        '4': 'jiang1',
        '6': 'jiang3',
      },
    },
    formatTime,
  )
  assert.equal(rows[0].text, 'jiang1 加签 jiang3：你也审批一下')
})

test('或签加签后驳回：先加签、再驳回、最后才是被取消', () => {
  const rows = buildProgressRows(
    {
      graph: {
        nodes: [
          { key: 'start', type: 'start', title: '开始' },
          { key: 'n1', type: 'approve', title: '审批' },
        ],
      },
      names: { '4': 'jiang1', '6': 'jiang2' },
      notes: [
        {
          at: '2026-09-08T07:14:42.000Z',
          text: '4 加签 6：你也来看看',
        },
      ],
      tasks: [
        {
          nodeKey: 'n1',
          round: 1,
          assigneeName: 'jiang2',
          status: 'cancelled',
          cancelReason: '或签其他人已驳回',
          createdAt: '2026-09-08T07:14:42.000Z',
        },
        {
          nodeKey: 'start',
          round: 1,
          assigneeName: 'jiang4',
          status: 'done',
          action: 'submit',
          finishedAt: '2026-09-08T07:13:49.000Z',
        },
        {
          nodeKey: 'n1',
          round: 1,
          assigneeName: 'jiang1',
          status: 'done',
          action: 'reject',
          comment: '我不同意。看别人的意见吧',
          finishedAt: '2026-09-08T07:15:06.000Z',
        },
      ],
    },
    formatTime,
  )
  assert.equal(rows.length, 4)
  assert.equal(rows[0].statusText, '已提交')
  assert.equal(rows[1].kind, 'note')
  assert.equal(rows[1].text, 'jiang1 加签 jiang2：你也来看看')
  assert.equal(rows[2].assigneeName, 'jiang1')
  assert.equal(rows[2].statusText, '驳回')
  assert.equal(rows[3].assigneeName, 'jiang2')
  assert.equal(rows[3].statusText, '未处理（已取消）')
})

test('取消与驳回同一时刻时驳回排在已取消前面', () => {
  const at = '2026-09-08T07:15:06.000Z'
  const rows = buildProgressRows(
    {
      graph: { nodes: [{ key: 'n1', type: 'approve', title: '审批' }] },
      tasks: [
        {
          nodeKey: 'n1',
          round: 1,
          assigneeName: 'jiang2',
          status: 'cancelled',
          cancelReason: '或签其他人已驳回',
          finishedAt: at,
          createdAt: '2026-09-08T07:14:42.000Z',
        },
        {
          nodeKey: 'n1',
          round: 1,
          assigneeName: 'jiang1',
          status: 'done',
          action: 'reject',
          finishedAt: at,
        },
      ],
    },
    formatTime,
  )
  assert.equal(rows[0].statusText, '驳回')
  assert.equal(rows[1].statusText, '未处理（已取消）')
})
