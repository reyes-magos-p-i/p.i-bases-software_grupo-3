import { isAxiosError } from 'axios'
import { getApi } from '@/services/api'
import type { RegisterPayload } from '@/types/client'
import type { ClientIdentity, ClientLoginRequest } from '@/types/client-auth'
import {
  clientIdentityFromResponse,
  establishClientSession,
  hasClientSession,
} from '@/services/client-session.service'
import { googleAuthCodeLogin } from 'vue3-google-login'
import type { EmployeeIdentity, EmployeeLoginRequest } from '@/types/employee-auth'
import { CLIENT_ACCESS_TOKEN_KEY } from './client-session.service'

interface ClientAuthResponse {
  accessToken: string
  client: ClientIdentity
}

export async function facebookLogin(accessToken: string): Promise<ClientAuthResponse> {
  const employee = await getEmployeeSession()
  if (employee) {
    throw new Error('Cierra la sesión del personal antes de iniciar sesión con Facebook.')
  }
  const api = getApi()
  const response = await api.post<ClientAuthResponse>('/auth/facebook', {
    accessToken,
  })
  establishClientSession(response.data.client, response.data.accessToken)
  return response.data
}

export class EmailDeliveryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmailDeliveryError'
  }
}

export class InvalidEmailVerificationError extends Error {
  constructor() {
    super('Este enlace ya no es válido')
    this.name = 'InvalidEmailVerificationError'
  }
}

export async function registerUser(payload: RegisterPayload): Promise<void> {
  const api = getApi()
  try {
    await api.post('/auth/register', payload, { timeout: 60000 })
  } catch (error) {
    if (isAxiosError(error)) {
      const code: unknown = error.response?.data?.code
      if (code === 'EMAIL_DELIVERY_FAILED') {
        throw new EmailDeliveryError(
          'No se pudo enviar el correo de confirmación. Puedes solicitar que se reenvíe.',
        )
      }
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

export async function resendEmailVerification(email: string): Promise<void> {
  const api = getApi()
  try {
    await api.post('/auth/resend-email-verification', { email })
  } catch {
    throw new Error('No se pudo reenviar el correo de confirmación. Inténtalo nuevamente.')
  }
}

export async function confirmEmailVerification(token: string): Promise<ClientIdentity> {
  const api = getApi()
  try {
    const response = await api.post<ClientAuthResponse>('/auth/confirm-email', { token })
    establishClientSession(response.data.client, response.data.accessToken)
    return response.data.client
  } catch (error) {
    if (isAxiosError(error) && error.response?.data?.code === 'EMAIL_VERIFICATION_INVALID') {
      throw new InvalidEmailVerificationError()
    }
    throw new Error('No se pudo confirmar el correo. Inténtalo nuevamente.')
  }
}

export async function loginWithGoogle(): Promise<ClientIdentity> {
  const api = getApi()
  const googleResponse = await googleAuthCodeLogin()

  const response = await api.post<ClientAuthResponse>('/auth/google', {
    code: googleResponse.code,
  })
  establishClientSession(response.data.client, response.data.accessToken)
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
  const email = 'email' in value && typeof value.email === 'string' ? value.email : undefined
  return { id: value.id, role: value.role, firstName: value.firstName, email }
}

export class ClientAuthError extends EmployeeAuthError {
  constructor(message: string, status?: number, retryAfterSeconds?: number) {
    super(message, status, retryAfterSeconds)
    this.name = 'ClientAuthError'
  }
}

function employeeAuthError(error: unknown, client = false): EmployeeAuthError {
  if (error instanceof EmployeeAuthError) return error
  const ErrorType = client ? ClientAuthError : EmployeeAuthError
  const status = isAxiosError(error) ? error.response?.status : undefined
  if (
    client &&
    status === 403 &&
    isAxiosError(error) &&
    error.response?.data?.code === 'EMAIL_VERIFICATION_REQUIRED'
  ) {
    return new ClientAuthError('Confirma tu correo electrónico antes de iniciar sesión.', status)
  }
  if (status === 429) {
    const header = isAxiosError(error) ? error.response?.headers?.['retry-after'] : undefined
    const seconds = Number(header)
    const delay = Number.isFinite(seconds) && seconds > 0 ? Math.min(60, Math.ceil(seconds)) : 60
    return new ErrorType(
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
  return new ErrorType(
    (status && messages[status]) ||
      'No se pudo conectar con el servicio de autenticación. Inténtalo nuevamente.',
    status,
  )
}

export async function loginClient(payload: ClientLoginRequest): Promise<ClientIdentity> {
  try {
    const response = await getApi().post<ClientAuthResponse>('/auth/clients/login', payload, {
      timeout: 15000,
    })
    establishClientSession(response.data?.client, response.data?.accessToken)
    return response.data.client
  } catch (error) {
    throw employeeAuthError(error, true)
  }
}

export async function getClientSession(token: string): Promise<ClientIdentity | null> {
  try {
    const response = await getApi().get<unknown>('/auth/me', {
      timeout: 10000,
      headers: { Authorization: `Bearer ${token}` },
      // Fetch can omit same-origin cookies, keeping client Bearer and staff sessions separate.
      adapter: 'fetch',
      withCredentials: false,
    })
    return clientIdentityFromResponse(response.data)
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 401) return null
    throw employeeAuthError(error, true)
  }
}

export async function loginEmployee(payload: EmployeeLoginRequest): Promise<EmployeeIdentity> {
  if (hasClientSession()) {
    throw new EmployeeAuthError(
      'Cierra la sesión de cliente antes de iniciar sesión como personal.',
    )
  }
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

function clientAuthHeader(): Record<string, string> {
  const token = localStorage.getItem(CLIENT_ACCESS_TOKEN_KEY)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export type ClientPasswordStatus = 'valid' | 'expired' | 'must_set'

export class ChangePasswordError extends Error {
  code?: string
  violations?: string[]

  constructor(message: string, code?: string, violations?: string[]) {
    super(message)
    this.name = 'ChangePasswordError'
    this.code = code
    this.violations = violations
  }
}

export async function getClientPasswordStatus(): Promise<ClientPasswordStatus> {
  try {
    const { data } = await getApi().get<{ status: ClientPasswordStatus }>('/auth/password-status', {
      headers: clientAuthHeader(),
    })
    return data.status
  } catch {
    throw new ChangePasswordError('No se pudo comprobar el estado de la contraseña.')
  }
}

export interface ChangeClientPasswordPayload {
  currentPassword?: string
  newPassword: string
  confirmNewPassword: string
  expirationDays: 30 | 60 | 90 | 120
}

export interface ChangeEmployeePasswordPayload extends ChangeClientPasswordPayload {
  currentPassword: string
}

type ChangePasswordErrorResponse = {
  code?: string
  message?: string
  violations?: string[]
}

const passwordChangeErrorMappers = new Map<
  string,
  (body: ChangePasswordErrorResponse) => ChangePasswordError
>([
  [
    'CURRENT_PASSWORD_INCORRECT',
    (body) => new ChangePasswordError('La contraseña actual no es correcta.', body.code),
  ],
  [
    'PASSWORDS_DO_NOT_MATCH',
    (body) => new ChangePasswordError('Las contraseñas no coinciden.', body.code),
  ],
  [
    'NEW_PASSWORD_SAME_AS_CURRENT',
    (body) =>
      new ChangePasswordError('La nueva contraseña no puede ser igual a la actual.', body.code),
  ],
  [
    'PASSWORD_POLICY_VIOLATION',
    (body) =>
      new ChangePasswordError(
        'La contraseña no cumple con la política de seguridad.',
        body.code,
        body.violations,
      ),
  ],
])

function mapPasswordChangeError(error: unknown): ChangePasswordError {
  if (isAxiosError(error) && error.response) {
    const body = error.response.data as ChangePasswordErrorResponse
    const mapper = body?.code ? passwordChangeErrorMappers.get(body.code) : undefined
    if (mapper) return mapper(body)
  }
  return new ChangePasswordError('No se pudo actualizar la contraseña, intenta de nuevo.')
}

export async function changeClientPassword(payload: ChangeClientPasswordPayload): Promise<void> {
  await changePassword('/auth/clients/password', payload, clientAuthHeader())
}

export async function changeEmployeePassword(
  payload: ChangeEmployeePasswordPayload,
): Promise<void> {
  await changePassword('/auth/employees/password', payload)
}

async function changePassword(
  endpoint: string,
  payload: ChangeClientPasswordPayload,
  headers?: Record<string, string>,
): Promise<void> {
  try {
    await getApi().patch(endpoint, payload, { headers })
  } catch (error) {
    throw mapPasswordChangeError(error)
  }
}
