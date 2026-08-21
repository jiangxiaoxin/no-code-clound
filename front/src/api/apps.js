import http from './http'

export function listAppsApi() {
  return http.get('/apps')
}

export function createAppApi(payload) {
  return http.post('/apps', payload)
}

export function getAppApi(id) {
  return http.get(`/apps/${id}`)
}

export function getDirectoryApi(id) {
  return http.get(`/apps/${id}/directory`)
}

export function createGroupApi(appId, payload) {
  return http.post(`/apps/${appId}/groups`, payload)
}

export function renameGroupApi(appId, groupId, payload) {
  return http.patch(`/apps/${appId}/groups/${groupId}`, payload)
}

export function deleteGroupApi(appId, groupId) {
  return http.delete(`/apps/${appId}/groups/${groupId}`)
}

export function createFormApi(appId, payload) {
  return http.post(`/apps/${appId}/forms`, payload)
}

export function getFormApi(appId, formId) {
  return http.get(`/apps/${appId}/forms/${formId}`)
}

export function renameFormApi(appId, formId, payload) {
  return http.patch(`/apps/${appId}/forms/${formId}`, payload)
}

export function deleteFormApi(appId, formId) {
  return http.delete(`/apps/${appId}/forms/${formId}`)
}
