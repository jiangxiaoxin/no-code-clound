import { defineStore } from 'pinia'
import { ref } from 'vue'
import { profileApi } from '../api/auth'

export const useUserStore = defineStore('user', () => {
  const accessToken = ref(localStorage.getItem('accessToken') || '')
  const user = ref(null)

  function setSession(token, userInfo) {
    accessToken.value = token
    user.value = userInfo
    localStorage.setItem('accessToken', token)
  }

  function logout() {
    accessToken.value = ''
    user.value = null
    localStorage.removeItem('accessToken')
  }

  async function restore() {
    if (!accessToken.value) {
      return
    }
    try {
      user.value = await profileApi()
    } catch {
      logout()
    }
  }

  function hasPermission(permission) {
    return Boolean(user.value?.permissions?.includes(permission))
  }

  return { accessToken, user, setSession, logout, restore, hasPermission }
})
