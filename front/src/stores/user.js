import { defineStore } from 'pinia'
import { ref } from 'vue'
import { profileApi } from '../api/auth'
import {
  getAccessToken,
  removeAccessToken,
  setAccessToken,
} from '../utils/authToken.js'

export const useUserStore = defineStore('user', () => {
  const accessToken = ref(getAccessToken())
  const user = ref(null)

  function setSession(token, userInfo) {
    accessToken.value = token
    user.value = userInfo
    setAccessToken(token)
  }

  function logout() {
    accessToken.value = ''
    user.value = null
    removeAccessToken()
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
