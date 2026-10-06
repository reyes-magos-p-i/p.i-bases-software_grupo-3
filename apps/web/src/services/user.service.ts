import { getApi } from '@/services/api'
import type { CreatedUser, CreateUserRequest, UserCreationOptions } from '@/types/user'

export async function getUserCreationOptions(signal?: AbortSignal): Promise<UserCreationOptions> {
  const response = await getApi().get<UserCreationOptions>('/users/creation-options', {
    signal,
    timeout: 10000,
  })
  return response.data
}

export async function createUser(user: CreateUserRequest): Promise<CreatedUser> {
  const response = await getApi().post<CreatedUser>('/users', user, { timeout: 60000 })
  return response.data
}
