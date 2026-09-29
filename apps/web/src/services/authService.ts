import { isAxiosError } from 'axios'
import { getApi } from '@/services/api'
import type { RegisterPayload } from '@/types/client'
//for login with google
import { googleAuthCodeLogin } from 'vue3-google-login'
import axios from 'axios'

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

// reusable google login function
export async function loginWithGoogle(): Promise<void> {
  // waiting for auth code from google
  const api = getApi()
  const googleResponse = await googleAuthCodeLogin()

  await api.post('/auth/google', {
    code: googleResponse.code,
  })
}
