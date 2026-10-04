import { getApi } from '@/services/api'
import type { CreatedUser, CreateUserRequest, UserCreationOptions } from '@/types/user'
import type { BranchOption, UserListQuery, UserListResult } from '@/types/user'
import type { UserDetail, UserDetailSelection } from '@/types/user'

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

export async function getUsers(
  section: 'clients' | 'employees',
  query: UserListQuery,
  signal?: AbortSignal,
): Promise<UserListResult> {
  const response = await getApi().get<UserListResult>(`/users/${section}`, {
    params: {
      ...query,
      ...(query.role ? { role: query.role.length ? query.role.join(',') : undefined } : {}),
      ...(query.branchId
        ? { branchId: query.branchId.length ? query.branchId.join(',') : undefined }
        : {}),
    },
    signal,
    timeout: 10000,
  })
  return response.data
}

export async function getEmployeeListOptions(
  signal?: AbortSignal,
): Promise<{ branches: BranchOption[] }> {
  const response = await getApi().get<{ branches: BranchOption[] }>('/users/employees/options', {
    signal,
    timeout: 10000,
  })
  return response.data
}

export async function getUserDetail(
  selection: UserDetailSelection,
  signal?: AbortSignal,
): Promise<UserDetail> {
  const response = await getApi().get<UserDetail>(`/users/${selection.section}/${selection.id}`, {
    signal,
    timeout: 10000,
  })
  return response.data
}
