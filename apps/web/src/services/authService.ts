import { isAxiosError } from 'axios'
import { getApi } from '@/services/api'
import type { RegisterPayload } from '@/types/client'
import type { ClientIdentity } from '@/types/client-auth'
import { googleAuthCodeLogin } from 'vue3-google-login'
import type { EmployeeIdentity, EmployeeLoginRequest } from '@/types/employee-auth'

interface ClientAuthResponse {
  accessToken: string
  client: ClientIdentity
}

export async function facebookLogin(accessToken: string): Promise<ClientAuthResponse> {
  const api = getApi()
  const response = await api.post<ClientAuthResponse>('/auth/facebook', {
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

export async function loginWithGoogle(): Promise<ClientIdentity> {
  const api = getApi()
  const googleResponse = await googleAuthCodeLogin()

  const response = await api.post<ClientAuthResponse>('/auth/google', {
    code: googleResponse.code,
  })
  localStorage.setItem('accessToken', response.data.accessToken)
  return response.data.client
}

export class EmployeeAuthError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(message)
    this.name = 'EmployeeAuthError'
  }
}

function identityFromResponse(value: unknown): EmployeeIdentity {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('id' in value) ||
    typeof value.id !== 'number' ||
    !Number.isSafeInteger(value.id) ||
    value.id < 1 ||
    !('role' in value) ||
    (value.role !== 'EMPLOYEE' && value.role !== 'ADMINISTRATOR') ||
    !('firstName' in value) ||
    typeof value.firstName !== 'string' ||
    !value.firstName.trim()
  ) {
    throw new EmployeeAuthError(
      'No se pudo verificar la sesión del personal. Inténtalo nuevamente.',
    )
  }
  return { id: value.id, role: value.role, firstName: value.firstName }
}

function employeeAuthError(error: unknown): EmployeeAuthError {
  if (error instanceof EmployeeAuthError) return error
  const status = isAxiosError(error) ? error.response?.status : undefined
  if (status === 429) {
    const header = isAxiosError(error) ? error.response?.headers?.['retry-after'] : undefined
    const seconds = Number(header)
    const delay = Number.isFinite(seconds) && seconds > 0 ? Math.min(60, Math.ceil(seconds)) : 60
    return new EmployeeAuthError(
      'Se alcanzó el límite de intentos. Espera antes de volver a intentarlo.',
      status,
      delay,
    )
  }
  const messages: Record<number, string> = {
    400: 'Revisa el correo y la contraseña introducidos.',
    401: 'Correo o contraseña incorrectos.',
    403: 'No se pudo autorizar la solicitud. Si el problema persiste, contacta con asistencia.',
  }
  return new EmployeeAuthError(
    (status && messages[status]) ||
      'No se pudo conectar con el servicio de autenticación. Inténtalo nuevamente.',
    status,
  )
}

export async function loginEmployee(payload: EmployeeLoginRequest): Promise<EmployeeIdentity> {
  try {
    const response = await getApi().post<{ user: unknown }>('/auth/employees/login', payload, {
      timeout: 15000,
    })
    return identityFromResponse(response.data?.user)
  } catch (error) {
    throw employeeAuthError(error)
  }
}

export async function getEmployeeSession(): Promise<EmployeeIdentity | null> {
  try {
    const response = await getApi().get<unknown>('/auth/me', { timeout: 10000 })
    return identityFromResponse(response.data)
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 401) return null
    throw employeeAuthError(error)
  }
}

export async function logoutEmployee(): Promise<void> {
  try {
    await getApi().post('/auth/employees/logout', undefined, { timeout: 10000 })
  } catch (error) {
    throw employeeAuthError(error)
  }
}
