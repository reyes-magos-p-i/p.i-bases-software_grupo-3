import axios from 'axios'
import type { CreatedUser, CreateUserRequest } from '@/types/user'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL?.trim(),
})

export async function createUser(user: CreateUserRequest): Promise<CreatedUser> {
  if (!api.defaults.baseURL) {
    throw new Error('Falta configurar VITE_API_BASE_URL para conectar con el backend.')
  }

  const response = await api.post<CreatedUser>('/users', user)
  return response.data
}
