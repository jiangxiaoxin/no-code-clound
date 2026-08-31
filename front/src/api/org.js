import http from './http'

export function listOrgDepartmentsApi() {
  return http.get('/org/departments')
}

export function listOrgRolesApi() {
  return http.get('/org/roles')
}

export function listOrgUsersApi(params) {
  return http.get('/org/users', { params })
}
