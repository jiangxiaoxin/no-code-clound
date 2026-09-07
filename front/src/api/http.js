import axios from 'axios'
import { ElMessage } from 'element-plus'
import { getAccessToken } from '../utils/authToken.js'

const http = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

http.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

http.interceptors.response.use(
  (response) => {
    const body = response.data
    if (body && typeof body.code === 'number' && body.code !== 0) {
      ElMessage.error(body.message || '请求失败')
      return Promise.reject(body)
    }
    return body?.data
  },
  async (error) => {
    const status = error.response?.status
    const raw = error.response?.data?.message
    const message = Array.isArray(raw) ? raw.join('；') : raw || '请求失败'
    if (!(error.config?.silent404 && status === 404)) {
      ElMessage.error(message)
    }
    const url = String(error.config?.url || '')
    const isAuthAttempt =
      url.includes('/auth/login') || url.includes('/auth/register')

    if (status === 401 && !isAuthAttempt) {
      const { useUserStore } = await import('../stores/user')
      const { router } = await import('../router')
      useUserStore().logout()
      if (router.currentRoute.value.path !== '/login') {
        router.replace('/login')
      }
    }

    return Promise.reject(error)
  },
)

export default http
