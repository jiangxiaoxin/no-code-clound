import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canDeleteWorkflowRecord,
  canEditWorkflowRecord,
  inboxActionsVisible,
  submitSuccessText,
  workflowStatusText,
} from './workflowStatus.js'

test('状态中文', () => {
  assert.equal(workflowStatusText('running'), '审批中')
  assert.equal(workflowStatusText('approved'), '已通过')
})

test('已通过只有发起人且有实例能编辑', () => {
  assert.equal(
    canEditWorkflowRecord({
      formKind: 'workflow',
      status: 'approved',
      initiatorId: 5,
      actorId: 5,
      hasInstance: true,
      publishEdit: true,
    }),
    true,
  )
  assert.equal(
    canEditWorkflowRecord({
      formKind: 'workflow',
      status: 'approved',
      initiatorId: 5,
      actorId: 5,
      hasInstance: false,
      publishEdit: true,
    }),
    false,
  )
})

test('审批中不能删', () => {
  assert.equal(
    canDeleteWorkflowRecord({
      formKind: 'workflow',
      status: 'running',
      initiatorId: 5,
      actorId: 5,
      publishDelete: true,
    }),
    false,
  )
})

test('草稿、已驳回、异常只有发起人且发布页删除开着能删', () => {
  const base = { formKind: 'workflow', initiatorId: 5, actorId: 5 }
  assert.equal(
    canDeleteWorkflowRecord({ ...base, status: 'draft', publishDelete: false }),
    false,
  )
  assert.equal(
    canDeleteWorkflowRecord({ ...base, status: 'draft', publishDelete: true }),
    true,
  )
  assert.equal(
    canDeleteWorkflowRecord({ ...base, status: 'rejected', publishDelete: false }),
    false,
  )
  assert.equal(
    canDeleteWorkflowRecord({ ...base, status: 'error', publishDelete: true }),
    true,
  )
})

test('提交成功提示用节点标题', () => {
  assert.equal(submitSuccessText('部门审批'), '已提交，等待「部门审批」')
  assert.equal(submitSuccessText(''), '已提交并通过')
})

test('待办底部显示通过驳回', () => {
  assert.deepEqual(
    inboxActionsVisible('todo', { canApprove: true, canReject: true }),
    { approve: true, reject: true },
  )
})

test('抄送抽屉没有通过驳回', () => {
  assert.deepEqual(
    inboxActionsVisible('cc', { canApprove: true, canReject: true }),
    {},
  )
})
