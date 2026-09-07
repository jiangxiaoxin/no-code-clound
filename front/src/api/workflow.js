import http from './http'

export function getWorkflowApi(appId, formId) {
  return http.get(`/apps/${appId}/forms/${formId}/workflow`)
}

export function saveWorkflowDraftApi(appId, formId, draftGraph) {
  return http.put(`/apps/${appId}/forms/${formId}/workflow/draft`, { draftGraph })
}

export function publishWorkflowApi(appId, formId) {
  return http.post(`/apps/${appId}/forms/${formId}/workflow/publish`)
}

export function patchWorkflowEnabledApi(appId, formId, enabled) {
  return http.patch(`/apps/${appId}/forms/${formId}/workflow`, { enabled })
}

export function queryWorkflowInboxApi(payload) {
  return http.post('/workflow/inbox/query', payload)
}

export function getWorkflowInboxCountApi(appId) {
  return http.get('/workflow/inbox/count', {
    params: appId ? { appId } : {},
  })
}

export function getWorkflowInboxDetailApi(kind, id) {
  return http.get(`/workflow/inbox/${kind}/${id}`)
}

export function completeWorkflowTaskApi(taskId, payload) {
  return http.post(`/workflow/tasks/${taskId}/complete`, payload)
}

export function saveWorkflowInstanceDraftApi(instanceId, data) {
  return http.post(`/workflow/instances/${instanceId}/draft`, { data })
}

export function submitWorkflowInstanceApi(instanceId, data) {
  return http.post(`/workflow/instances/${instanceId}/submit`, { data })
}

export function cancelWorkflowInstanceApi(instanceId) {
  return http.post(`/workflow/instances/${instanceId}/cancel`)
}

export function retryWorkflowInstanceApi(instanceId) {
  return http.post(`/workflow/instances/${instanceId}/retry`)
}

export function renderSourceRecordsApi(instanceId, payload) {
  return http.post(`/workflow/render/${instanceId}/source-records`, payload)
}

export function renderLinkageApi(instanceId, payload) {
  return http.post(`/workflow/render/${instanceId}/linkage`, payload)
}

export function renderUploadApi(instanceId, fieldKey, file) {
  const payload = new FormData()
  payload.append('file', file)
  // fieldKey 走查询参数：服务端要在 multer 落盘前鉴权，那时还读不到表单体里的字段
  return http.post(
    `/workflow/render/${instanceId}/files?fieldKey=${encodeURIComponent(fieldKey)}`,
    payload,
  )
}
