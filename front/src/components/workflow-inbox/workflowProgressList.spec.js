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
