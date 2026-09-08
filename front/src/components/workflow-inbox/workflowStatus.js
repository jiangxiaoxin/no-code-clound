export const WORKFLOW_STATUS_TEXT = {
  draft: '草稿',
  running: '审批中',
  approved: '已通过',
  rejected: '已驳回',
  error: '异常',
}

export function workflowStatusText(status) {
  return WORKFLOW_STATUS_TEXT[status] || ''
}

export function canEditWorkflowRecord({
  formKind,
  status,
  initiatorId,
  actorId,
  hasInstance,
  publishEdit,
  allowResubmitAfterTerminated,
}) {
  if (formKind !== 'workflow' || !publishEdit) return false
  if (status === 'running') return false
  if (initiatorId !== actorId) return false
  if (
    (status === 'approved' || status === 'rejected') &&
    allowResubmitAfterTerminated === false
  ) {
    return false
  }
  if (status === 'approved') return Boolean(hasInstance)
  return status === 'draft' || status === 'rejected' || status === 'error'
}

export function canDeleteWorkflowRecord({
  formKind,
  status,
  initiatorId,
  actorId,
  publishDelete,
}) {
  if (formKind !== 'workflow') return true
  if (status === 'running') return false
  if (status === 'approved') return Boolean(publishDelete)
  if (status === 'draft' || status === 'rejected' || status === 'error') {
    return initiatorId === actorId && Boolean(publishDelete)
  }
  return false
}

export function submitSuccessText(nextNodeTitle) {
  return nextNodeTitle ? `已提交，等待「${nextNodeTitle}」` : '已提交并通过'
}

export function inboxActionsVisible(kind, actions = {}) {
  if (kind === 'todo') {
    return {
      approve: Boolean(actions.canApprove),
      reject: Boolean(actions.canReject),
      transfer: Boolean(actions.canTransfer),
      addSign: Boolean(actions.canAddSign),
      returnPrevious: Boolean(actions.canReturnPrevious),
      returnStart: Boolean(actions.canReturnStart),
      resubmit: Boolean(actions.canResubmit),
    }
  }
  if (kind === 'mine') {
    return {
      draft: Boolean(actions.canDraft),
      submit: Boolean(actions.canSubmit),
      cancel: Boolean(actions.canCancel),
      retry: Boolean(actions.canRetry),
    }
  }
  if (kind === 'cc') return {}
  return {}
}
