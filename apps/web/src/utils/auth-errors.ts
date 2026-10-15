import { isAxiosError } from 'axios'

export class AuthResponseError extends Error {
  constructor() {
    super(
      'El servicio devolvió una respuesta no válida. Inténtalo nuevamente. (AUTH_RESPONSE_INVALID)',
    )
    this.name = 'AuthResponseError'
  }
}

export function authErrorStatus(error: unknown): number | undefined {
  if (isAxiosError(error)) return error.response?.status
  if (error instanceof Error && 'status' in error && typeof error.status === 'number') {
    return error.status
  }
  return undefined
}

function httpErrorMessage(status: number, fallback: string): string {
  const messages: Record<number, string> = {
    403: 'No se pudo autorizar esta solicitud. Comprueba tus permisos o contacta con asistencia.',
    404: 'No se encontró el recurso solicitado. Si el problema persiste, contacta con asistencia.',
    500: 'Ocurrió un problema en el servidor. Inténtalo nuevamente o contacta con asistencia.',
    502: 'No se pudo obtener una respuesta del servicio. Inténtalo nuevamente.',
    503: 'El servicio no está disponible temporalmente. Inténtalo más tarde.',
    504: 'El servicio tardó demasiado en responder. Inténtalo nuevamente.',
  }
  if (status && messages[status]) return `Error ${status}: ${messages[status]}`
  if (status && status >= 500) return `Error ${status}: ${messages[500]}`
  if (status && status >= 400 && ![400, 401, 409, 410, 422, 429].includes(status)) {
    return `Error ${status}: ${fallback}`
  }
  return fallback
}

function isAuthFeedback(error: unknown): error is Error {
  return (
    error instanceof Error &&
    (error instanceof AuthResponseError ||
      ['EmployeeAuthError', 'ClientAuthError', 'ChangePasswordError'].includes(error.name))
  )
}

export function authErrorMessage(error: unknown, fallback: string): string {
  if (isAuthFeedback(error)) return error.message
  const code = isAxiosError(error) ? error.response?.data?.code : undefined
  if (['EMAIL_VERIFICATION_REQUIRED', 'PASSWORD_EXPIRED', 'PASSWORD_MUST_SET'].includes(code)) {
    return fallback
  }
  const status = authErrorStatus(error)
  if (status !== undefined) return httpErrorMessage(status, fallback)
  if (isAxiosError(error) && !error.response) {
    return error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT'
      ? 'La solicitud tardó demasiado. Inténtalo nuevamente. (AUTH_TIMEOUT)'
      : 'No se pudo conectar con el servicio. Comprueba tu conexión. (AUTH_NETWORK)'
  }
  return fallback
}
