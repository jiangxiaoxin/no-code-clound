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
  assert.match(rows[0].text, /张三 · 开始 · 已提交/)
  assert.match(rows[1].text, /经理甲 · 部门审批 · 待处理/)
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
  assert.match(rows[0].text, /再次提交/)
})
