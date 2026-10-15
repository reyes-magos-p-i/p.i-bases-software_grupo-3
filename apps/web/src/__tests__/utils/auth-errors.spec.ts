import { describe, expect, it } from 'vitest'
import { AuthResponseError, authErrorMessage, authErrorStatus } from '@/utils/auth-errors'

describe('authentication feedback', () => {
  it.each([400, 401, 409, 410, 422, 429])(
    'keeps routine HTTP %s feedback free of codes',
    (status) => {
      expect(
        authErrorMessage({ isAxiosError: true, response: { status } }, 'Revisa los datos.'),
      ).toBe('Revisa los datos.')
    },
  )

  it.each([403, 404, 500, 502, 503, 504, 507])(
    'identifies exceptional HTTP %s failures without exposing server details',
    (status) => {
      const message = authErrorMessage(
        { isAxiosError: true, response: { status, data: { message: 'private database details' } } },
        'Falló la solicitud.',
      )
      expect(message).toContain(`Error ${status}:`)
      expect(message).not.toContain('private')
    },
  )

  it.each(['EMAIL_VERIFICATION_REQUIRED', 'PASSWORD_EXPIRED', 'PASSWORD_MUST_SET'])(
    'keeps routine %s feedback free of codes',
    (code) => {
      expect(
        authErrorMessage(
          { isAxiosError: true, response: { status: 403, data: { code } } },
          'Actualiza tu cuenta.',
        ),
      ).toBe('Actualiza tu cuenta.')
    },
  )

  it.each(['ECONNABORTED', 'ETIMEDOUT', 'ERR_NETWORK'])(
    'identifies transport failure %s without inventing an HTTP status',
    (code) => {
      const message = authErrorMessage({ isAxiosError: true, code }, 'Falló la solicitud.')
      expect(message).toContain(code === 'ERR_NETWORK' ? 'AUTH_NETWORK' : 'AUTH_TIMEOUT')
      expect(message).not.toMatch(/Error \d+/u)
    },
  )

  it('preserves typed status and rejects untrusted error text', () => {
    expect(authErrorStatus(Object.assign(new Error('safe'), { status: 401 }))).toBe(401)
    expect(authErrorStatus({ status: 401 })).toBeUndefined()
    expect(authErrorMessage(new Error('private details'), 'Inténtalo de nuevo.')).toBe(
      'Inténtalo de nuevo.',
    )
    expect(authErrorMessage(new AuthResponseError(), 'fallback')).toContain('AUTH_RESPONSE_INVALID')
    const feedback = Object.assign(new Error('Correo o contraseña incorrectos.'), {
      name: 'ClientAuthError',
      status: 401,
    })
    expect(authErrorMessage(feedback, 'fallback')).toBe('Correo o contraseña incorrectos.')
    expect(
      authErrorMessage(
        { isAxiosError: true, response: { status: 405 } },
        'No se pudo completar la solicitud.',
      ),
    ).toBe('Error 405: No se pudo completar la solicitud.')
  })
})
