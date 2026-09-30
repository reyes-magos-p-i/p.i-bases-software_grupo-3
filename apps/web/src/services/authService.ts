import { isAxiosError } from 'axios'
import { getApi } from '@/services/api'
import type { RegisterPayload } from '@/types/client'

export async function facebookLogin(accessToken: string) {
  const api = getApi()
  const response = await api.post('/auth/facebook', {
    accessToken,
  })
  localStorage.setItem('accessToken', response.data.accessToken)
  return response.data
}

export async function registerUser(payload: RegisterPayload): Promise<void> {
  const api = getApi()
  try {
    await api.post('/auth/register', payload, { timeout: 60000 })
  } catch (error) {
    if (isAxiosError(error)) {
      const message: unknown = error.response?.data?.message
      if (typeof message === 'string' && message.trim()) {
        throw new Error(message)
      }
      if (
        Array.isArray(message) &&
        message.length &&
        message.every((item) => typeof item === 'string')
      ) {
        throw new Error(message.join('. '))
      }
    }
    throw new Error('No se pudo crear la cuenta')
  }
}
