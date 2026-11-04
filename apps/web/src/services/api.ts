import axios, { isAxiosError } from 'axios'

export type PasswordBlockReason = 'expired' | 'must_set'
type PasswordBlockedListener = (reason: PasswordBlockReason) => void

const PASSWORD_BLOCK_CODES: Record<string, PasswordBlockReason> = {
  PASSWORD_EXPIRED: 'expired',
  PASSWORD_MUST_SET: 'must_set',
}
const passwordBlockedListeners = new Set<PasswordBlockedListener>()

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL?.trim(),
})

/**
 * Any endpoint can answer 403 PASSWORD_EXPIRED / PASSWORD_MUST_SET when the password stops
 * being valid during a session; listeners send the user to the password change.
 */
export function onPasswordBlocked(listener: PasswordBlockedListener): () => void {
  passwordBlockedListeners.add(listener)
  return () => passwordBlockedListeners.delete(listener)
}

export function notifyPasswordBlocked(error: unknown): void {
  if (!isAxiosError(error) || error.response?.status !== 403) return
  const data: unknown = error.response.data
  const code = typeof data === 'object' && data !== null && 'code' in data ? data.code : undefined
  const reason = typeof code === 'string' ? PASSWORD_BLOCK_CODES[code] : undefined
  if (reason) for (const listener of passwordBlockedListeners) listener(reason)
}

api.interceptors.response.use(undefined, (error: unknown) => {
  notifyPasswordBlocked(error)
  return Promise.reject(error)
})

export function getApi() {
  if (!api.defaults.baseURL) {
    throw new Error('Falta configurar VITE_API_BASE_URL para conectar con el backend.')
  }
  return api
}
