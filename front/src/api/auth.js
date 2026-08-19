import http from './http'

export function registerApi(payload) {
  return http.post('/auth/register', payload)
}

export function loginApi(payload) {
  return http.post('/auth/login', payload)
}

export function profileApi() {
  return http.get('/auth/profile')
}

export function logoutApi() {
  return http.post('/auth/logout')
}
