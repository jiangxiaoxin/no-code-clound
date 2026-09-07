const TOKEN_KEY = 'accessToken'

function tokenStorage() {
  return import.meta.env.DEV ? sessionStorage : localStorage
}

export function getAccessToken() {
  return tokenStorage().getItem(TOKEN_KEY) || ''
}

export function setAccessToken(token) {
  tokenStorage().setItem(TOKEN_KEY, token)
}

export function removeAccessToken() {
  tokenStorage().removeItem(TOKEN_KEY)
}
