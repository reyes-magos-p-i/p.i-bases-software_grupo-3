import axios from 'axios'
import type { CreatedUser, CreateUserRequest, UserCreationOptions } from '@/types/user'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL?.trim(),
})

function requireBaseUrl() {
  if (!api.defaults.baseURL) {
    throw new Error('Falta configurar VITE_API_BASE_URL para conectar con el backend.')
  }
}

export async function getUserCreationOptions(signal?: AbortSignal): Promise<UserCreationOptions> {
  requireBaseUrl()
  const response = await api.get<UserCreationOptions>('/users/creation-options', {
    signal,
    timeout: 10000,
  })
  return response.data
}

export async function createUser(user: CreateUserRequest): Promise<CreatedUser> {
  requireBaseUrl()

  const response = await api.post<CreatedUser>('/users', user, { timeout: 60000 })
  return response.data
}
