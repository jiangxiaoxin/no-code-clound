import http from './http'
import axios from 'axios'
import { ElMessage } from 'element-plus'

export function listAppsApi() {
  return http.get('/apps')
}

export function createAppApi(payload) {
  return http.post('/apps', payload)
}

export function getAppApi(id) {
  return http.get(`/apps/${id}`)
}

export function deleteAppApi(id) {
  return http.delete(`/apps/${id}`)
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

export function saveFormFieldsApi(appId, formId, payload) {
  return http.put(`/apps/${appId}/forms/${formId}/fields`, payload)
}

export function getFormConfigApi(appId, formId) {
  return http.get(`/apps/${appId}/forms/${formId}/config`)
}

export function saveFormConfigApi(appId, formId, config) {
  return http.patch(`/apps/${appId}/forms/${formId}/config`, { config })
}

export function listFormFieldsApi(appId, params) {
  return http.get(`/apps/${appId}/form-fields`, { params })
}

export function listDictionariesApi(appId, params) {
  return http.get(`/apps/${appId}/dictionaries`, { params })
}

export function getDictionaryApi(appId, id) {
  return http.get(`/apps/${appId}/dictionaries/${id}`)
}

export function createDictionaryApi(appId, payload) {
  return http.post(`/apps/${appId}/dictionaries`, payload)
}

export function updateDictionaryApi(appId, id, payload) {
  return http.patch(`/apps/${appId}/dictionaries/${id}`, payload)
}

export function deleteDictionaryApi(appId, id) {
  return http.delete(`/apps/${appId}/dictionaries/${id}`)
}

export function listDictionaryOptionsApi(appId) {
  return http.get(`/apps/${appId}/dictionaries/options`)
}

export function listDictionaryItemsByCodeApi(appId, code) {
  return http.get(`/apps/${appId}/dictionaries/by-code/${encodeURIComponent(code)}/items`)
}

export function listDictionaryItemsByCodesApi(appId, codes) {
  return http.post(`/apps/${appId}/dictionaries/items-by-codes`, { codes })
}

export function createFormRecordApi(appId, formId, data) {
  return http.post(`/apps/${appId}/forms/${formId}/records`, { data })
}

export function getFormRecordApi(appId, formId, recordId, config = {}) {
  return http.get(
    `/apps/${appId}/forms/${formId}/records/${encodeURIComponent(recordId)}`,
    config,
  )
}

export function queryFormRecordsApi(appId, formId, payload) {
  // debugger
  return http.post(`/apps/${appId}/forms/${formId}/records/query`, payload)
}

export function updateFormRecordApi(appId, formId, recordId, data) {
  return http.patch(`/apps/${appId}/forms/${formId}/records/${recordId}`, { data })
}

export function deleteFormRecordApi(appId, formId, recordId) {
  return http.delete(`/apps/${appId}/forms/${formId}/records/${recordId}`)
}

export async function downloadRecordImportTemplateApi(appId, formId) {
  const token = localStorage.getItem('accessToken')
  try {
    const response = await axios.get(
      `/api/apps/${appId}/forms/${formId}/records/import-template`,
      {
        responseType: 'blob',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    )
    const contentType = String(response.headers['content-type'] || '')
    if (contentType.includes('application/json')) {
      const body = JSON.parse(await response.data.text())
      throw Object.assign(new Error(body.message || '下载失败'), { body })
    }
    const disposition = String(response.headers['content-disposition'] || '')
    const matched = disposition.match(/filename\*=UTF-8''([^;]+)/i)
    const filename = matched
      ? decodeURIComponent(matched[1])
      : '导入模版.xlsx'
    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    const data = error.response?.data
    if (data instanceof Blob) {
      try {
        const body = JSON.parse(await data.text())
        ElMessage.error(body.message || '下载失败')
        return Promise.reject(error)
      } catch {
        // ignore parse error
      }
    }
    ElMessage.error(error.body?.message || error.message || '下载失败')
    return Promise.reject(error)
  }
}

export function importFormRecordsApi(appId, formId, file) {
  const payload = new FormData()
  payload.append('file', file)
  return http.post(`/apps/${appId}/forms/${formId}/records/import`, payload, {
    timeout: 120000,
  })
}

export function uploadAppImageApi(appId, file) {
  const payload = new FormData()
  payload.append('file', file)
  return http.post(`/apps/${appId}/uploads`, payload, {
    timeout: 120000,
  })
}

export function uploadAppFileApi(appId, file) {
  const payload = new FormData()
  payload.append('file', file)
  return http.post(`/apps/${appId}/file-uploads`, payload, {
    timeout: 120000,
  })
}
