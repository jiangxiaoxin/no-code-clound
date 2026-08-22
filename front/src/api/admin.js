import http from './http'

export function listAdminUsersApi(params) {
  return http.get('/admin/users', { params })
}

export function createAdminUserApi(payload) {
  return http.post('/admin/users', payload)
}

export function updateAdminUserApi(id, payload) {
  return http.patch(`/admin/users/${id}`, payload)
}

export function updateAdminUserStatusApi(id, status) {
  return http.patch(`/admin/users/${id}/status`, { status })
}

export function resetAdminUserPasswordApi(id, newPassword) {
  return http.post(`/admin/users/${id}/reset-password`, { newPassword })
}

export function listDepartmentsApi() {
  return http.get('/admin/departments')
}

export function createDepartmentApi(payload) {
  return http.post('/admin/departments', payload)
}

export function updateDepartmentApi(id, payload) {
  return http.patch(`/admin/departments/${id}`, payload)
}

export function deleteDepartmentApi(id) {
  return http.delete(`/admin/departments/${id}`)
}

export function listRolesApi(params) {
  return http.get('/admin/roles', { params })
}

export function createRoleApi(payload) {
  return http.post('/admin/roles', payload)
}

export function updateRoleApi(id, payload) {
  return http.patch(`/admin/roles/${id}`, payload)
}

export function deleteRoleApi(id) {
  return http.delete(`/admin/roles/${id}`)
}

export function listPermissionsApi() {
  return http.get('/admin/permissions')
}
