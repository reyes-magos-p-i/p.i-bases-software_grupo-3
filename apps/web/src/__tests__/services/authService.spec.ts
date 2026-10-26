import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RegisterPayload } from '@/types/client'

const { create, post, get, patch, googleAuthCodeLogin } = vi.hoisted(() => ({
  create: vi.fn(),
  post: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
  googleAuthCodeLogin: vi.fn(),
}))
vi.mock('axios', () => ({
  default: { create },
  isAxiosError: (error: { isAxiosError?: boolean }) => error?.isAxiosError === true,
}))
vi.mock('vue3-google-login', () => ({ googleAuthCodeLogin }))

describe('Client local authentication', () => {
  const identity = { id: 7, email: 'ana@example.com', firstName: 'Ana', lastName: 'Rojas' }
  const credentials = { email: identity.email, password: ' Exact password ' }

  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    get.mockRejectedValue({ isAxiosError: true, response: { status: 401 } })
    vi.stubEnv('VITE_API_BASE_URL', '/api')
    localStorage.clear()
    create.mockImplementation((defaults) => ({ defaults, post, get, patch }))
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    localStorage.clear()
  })

  it('shares the current bearer transport without creating a second authentication client', async () => {
    const { clientRequestOptions } = await import('@/services/authService')
    localStorage.setItem('accessToken', 'profile-token')
    expect(clientRequestOptions()).toEqual({
      headers: { Authorization: 'Bearer profile-token' },
      adapter: 'fetch',
      withCredentials: false,
      timeout: 10000,
    })
    expect(post).not.toHaveBeenCalled()
  })
  it('establishes the existing client session after a successful local login', async () => {
    const { loginClient } = await import('@/services/authService')
    const { clientSession } = await import('@/services/client-session.service')
    post.mockResolvedValue({ data: { client: identity, accessToken: 'client-token' } })
    await expect(loginClient(credentials)).resolves.toEqual(identity)
    expect(post).toHaveBeenCalledExactlyOnceWith('/auth/clients/login', credentials, {
      adapter: 'fetch',
      withCredentials: false,
      timeout: 15000,
    })
    expect(clientSession.user.value).toEqual(identity)
    expect(localStorage.getItem('accessToken')).toBe('client-token')
  })

  it.each([
    [400, undefined, 'Revisa'],
    [401, undefined, 'incorrectos'],
    [403, 'EMAIL_VERIFICATION_REQUIRED', 'Confirma'],
    [403, undefined, 'autorizar'],
    [500, undefined, 'Error 500'],
  ])('reports HTTP %s (%s) without leaking server details', async (status, code, message) => {
    const { loginClient } = await import('@/services/authService')
    post.mockRejectedValue({
      isAxiosError: true,
      response: { status, data: { code, message: 'private details' } },
    })
    await expect(loginClient(credentials)).rejects.toThrow(message as string)
    expect(localStorage.getItem('accessToken')).toBeNull()
  })

  it('preserves the rate-limit delay in a typed error', async () => {
    const { loginClient } = await import('@/services/authService')
    post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 429, headers: { 'retry-after': '12' } },
    })
    await expect(loginClient(credentials)).rejects.toMatchObject({
      name: 'ClientAuthError',
      status: 429,
      retryAfterSeconds: 12,
    })
    expect(post).toHaveBeenCalledTimes(1)
  })

  it.each([
    {},
    { client: identity },
    { client: { ...identity, role: 'EMPLOYEE' }, accessToken: 'token' },
  ])('does not store malformed authentication responses: %p', async (data) => {
    const { loginClient } = await import('@/services/authService')
    post.mockResolvedValue({ data })
    await expect(loginClient(credentials)).rejects.toThrow()
    expect(localStorage.getItem('accessToken')).toBeNull()
  })

  it('verifies client Bearer credentials without sending the employee cookie', async () => {
    const { getClientSession } = await import('@/services/authService')
    get.mockResolvedValue({
      data: { id: 7, email: identity.email, firstName: 'Ana', firstSurname: 'Rojas' },
    })
    await expect(getClientSession('saved-token')).resolves.toEqual(identity)
    expect(get).toHaveBeenCalledExactlyOnceWith('/auth/me', {
      timeout: 10000,
      headers: { Authorization: 'Bearer saved-token' },
      adapter: 'fetch',
      withCredentials: false,
    })
  })

  it('distinguishes expired sessions from transport failures', async () => {
    const { getClientSession } = await import('@/services/authService')
    get.mockRejectedValueOnce({ isAxiosError: true, response: { status: 401 } })
    await expect(getClientSession('expired')).resolves.toBeNull()
    get.mockRejectedValueOnce(new Error('Private network failure'))
    await expect(getClientSession('saved')).rejects.toThrow('solicitud de autenticación')
  })

  it('checks employee password expiration through the session cookie', async () => {
    const { getEmployeePasswordStatus } = await import('@/services/authService')
    get.mockResolvedValue({ data: { status: 'expired' } })

    await expect(getEmployeePasswordStatus()).resolves.toBe('expired')
    expect(get).toHaveBeenCalledExactlyOnceWith('/auth/password-status', {
      timeout: 10000,
    })
  })

  it('preserves employee-session errors when password status cannot be checked', async () => {
    const { getEmployeePasswordStatus } = await import('@/services/authService')
    get.mockRejectedValue({
      isAxiosError: true,
      response: { status: 401 },
    })

    await expect(getEmployeePasswordStatus()).rejects.toMatchObject({
      name: 'EmployeeAuthError',
      status: 401,
    })
  })
})

describe('registerUser', () => {
  const payload: RegisterPayload = {
    email: 'test@example.com',
    firstName: 'Juan',
    lastName: 'Perez',
    phone: '1234567890',
    gender: 'M',
    birthDate: '1990-01-01',
    language: 'es',
    password: 'Password123!',
    acceptTerms: true,
  }

  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    get.mockRejectedValue({ isAxiosError: true, response: { status: 401 } })
    vi.stubEnv('VITE_API_BASE_URL', '/api')
    create.mockImplementation((defaults) => ({ defaults, post, get, patch }))
  })

  afterEach(() => vi.unstubAllEnvs())

  it('shares the Axios instance and URL with user creation', async () => {
    const { registerUser } = await import('@/services/authService')
    const { getUserCreationOptions } = await import('@/services/user.service')
    post.mockResolvedValue({ status: 201 })
    get.mockResolvedValue({ data: {} })
    await expect(registerUser(payload)).resolves.toBeUndefined()
    await getUserCreationOptions()
    expect(create).toHaveBeenCalledExactlyOnceWith({ baseURL: '/api' })
    expect(post).toHaveBeenCalledExactlyOnceWith('/auth/register', payload, { timeout: 60000 })
  })

  it.each([
    ['Correo en uso', 'Correo en uso'],
    [['Correo incorrecto', 'Clave corta'], 'Correo incorrecto. Clave corta'],
    [undefined, 'No se pudo crear la cuenta'],
    ['', 'No se pudo crear la cuenta'],
    [[], 'No se pudo crear la cuenta'],
    [[42], 'No se pudo crear la cuenta'],
    [{ unexpected: true }, 'No se pudo crear la cuenta'],
  ])('handles response message %j without retrying', async (message, expected) => {
    const { registerUser } = await import('@/services/authService')
    post.mockRejectedValue({ isAxiosError: true, response: { data: { message } } })
    await expect(registerUser(payload)).rejects.toThrow(expected)
    expect(post).toHaveBeenCalledTimes(1)
  })

  it.each([
    { isAxiosError: true, code: 'ERR_NETWORK' },
    { isAxiosError: true, code: 'ECONNABORTED' },
    { isAxiosError: true, response: { data: '<html>Error</html>' } },
    new Error('Unexpected failure'),
  ])('reports transport failures without retrying or returning success', async (error) => {
    const { registerUser } = await import('@/services/authService')
    post.mockRejectedValue(error)
    await expect(registerUser(payload)).rejects.toThrow('No se pudo crear la cuenta')
    expect(post).toHaveBeenCalledTimes(1)
  })

  it.each([undefined, '', '   '])('requires the shared API URL (%j)', async (baseURL) => {
    vi.stubEnv('VITE_API_BASE_URL', baseURL)
    const { registerUser } = await import('@/services/authService')
    await expect(registerUser(payload)).rejects.toThrow('VITE_API_BASE_URL')
    expect(post).not.toHaveBeenCalled()
  })
})

describe('email verification API', () => {
  const client = {
    id: 7,
    email: 'ana@example.com',
    firstName: 'Ana',
    lastName: 'Perez',
  }

  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    get.mockRejectedValue({ isAxiosError: true, response: { status: 401 } })
    vi.stubEnv('VITE_API_BASE_URL', '/api')
    localStorage.clear()
    get.mockRejectedValue({ isAxiosError: true, response: { status: 401 } })
    create.mockImplementation((defaults) => ({ defaults, post, get, patch }))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    localStorage.clear()
  })

  it('reports the specific registration email-delivery failure', async () => {
    post.mockRejectedValue({
      isAxiosError: true,
      response: { data: { code: 'EMAIL_DELIVERY_FAILED' } },
    })
    const { EmailDeliveryError, registerUser } = await import('@/services/authService')

    await expect(
      registerUser({
        email: client.email,
        firstName: 'Ana',
        lastName: 'Perez',
        phone: '12345678',
        gender: 'F',
        birthDate: '1990-01-01',
        language: 'es',
        password: 'Password123!',
        acceptTerms: true,
      }),
    ).rejects.toBeInstanceOf(EmailDeliveryError)
  })

  it('resends a verification email and maps any request failure to a safe message', async () => {
    const { resendEmailVerification } = await import('@/services/authService')
    post.mockResolvedValueOnce({ status: 204 })
    await expect(resendEmailVerification(client.email)).resolves.toBeUndefined()
    expect(post).toHaveBeenNthCalledWith(1, '/auth/resend-email-verification', {
      email: client.email,
    })

    post.mockRejectedValueOnce(new Error('private transport detail'))
    await expect(resendEmailVerification(client.email)).rejects.toThrow(
      'No se pudo reenviar el correo de confirmación. Inténtalo nuevamente.',
    )
    expect(post).toHaveBeenCalledTimes(2)
  })

  it('confirms email, establishes a client session and returns the identity', async () => {
    post.mockResolvedValue({
      data: { accessToken: 'verified-token', client },
    })
    const { confirmEmailVerification } = await import('@/services/authService')

    await expect(confirmEmailVerification('one-time-token')).resolves.toEqual(client)
    expect(post).toHaveBeenCalledExactlyOnceWith('/auth/confirm-email', {
      token: 'one-time-token',
    })
    expect(localStorage.getItem('accessToken')).toBe('verified-token')
  })

  it('distinguishes invalid verification links from other confirmation failures', async () => {
    const { confirmEmailVerification, InvalidEmailVerificationError } =
      await import('@/services/authService')
    post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { data: { code: 'EMAIL_VERIFICATION_INVALID' } },
    })
    await expect(confirmEmailVerification('expired-token')).rejects.toBeInstanceOf(
      InvalidEmailVerificationError,
    )

    post.mockRejectedValueOnce(new Error('private transport detail'))
    await expect(confirmEmailVerification('token')).rejects.toThrow(
      'No se pudo confirmar el correo. Inténtalo nuevamente.',
    )
    expect(post).toHaveBeenCalledTimes(2)
  })
})

describe('facebook authentication API', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    get.mockRejectedValue({ isAxiosError: true, response: { status: 401 } })
    vi.stubEnv('VITE_API_BASE_URL', '/api')
    localStorage.clear()
    get.mockRejectedValue({ isAxiosError: true, response: { status: 401 } })
    create.mockImplementation((defaults) => ({ defaults, post, get, patch }))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    localStorage.clear()
  })

  it('logs in with Facebook, stores the access token, and returns the response data', async () => {
    const { facebookLogin } = await import('@/services/authService')
    const responseData = {
      accessToken: 'server-access-token',
      client: { id: 7, email: 'ana@example.com', firstName: 'Ana', lastName: 'Perez' },
    }
    post.mockResolvedValue({ data: responseData })

    await expect(facebookLogin('facebook-access-token')).resolves.toEqual(responseData)

    expect(post).toHaveBeenCalledExactlyOnceWith('/auth/facebook', {
      accessToken: 'facebook-access-token',
    })
    expect(localStorage.getItem('accessToken')).toBe('server-access-token')
  })

  it('blocks Facebook login when an employee session exists', async () => {
    get.mockResolvedValueOnce({ data: { id: 21, role: 'EMPLOYEE', firstName: 'Ana' } })
    const { facebookLogin } = await import('@/services/authService')

    await expect(facebookLogin('facebook-access-token')).rejects.toThrow('sesión del personal')
    expect(post).not.toHaveBeenCalled()
  })

  it('logs in with Google, stores its token, and returns the client profile', async () => {
    googleAuthCodeLogin.mockResolvedValue({ code: 'google-auth-code' })
    post.mockResolvedValue({
      data: {
        accessToken: 'google-server-token',
        client: { id: 8, email: 'ana@example.com', firstName: 'Ana', lastName: 'Perez' },
      },
    })
    const { loginWithGoogle } = await import('@/services/authService')

    await expect(loginWithGoogle()).resolves.toEqual({
      id: 8,
      email: 'ana@example.com',
      firstName: 'Ana',
      lastName: 'Perez',
    })

    expect(post).toHaveBeenCalledExactlyOnceWith('/auth/google', { code: 'google-auth-code' })
    expect(localStorage.getItem('accessToken')).toBe('google-server-token')
  })
})

describe('employee authentication API', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    get.mockRejectedValue({ isAxiosError: true, response: { status: 401 } })
    vi.stubEnv('VITE_API_BASE_URL', '/api')
    localStorage.clear()
    create.mockImplementation((defaults) => ({ defaults, post, get, patch }))
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    localStorage.clear()
  })

  it('logs in through the shared proxy without changing the password or retaining a token', async () => {
    const { loginEmployee } = await import('@/services/authService')
    post.mockResolvedValue({ data: { user: { id: 21, role: 'ADMINISTRATOR', firstName: 'Ana' } } })
    const credentials = { email: 'staff@example.com', password: ' Exact password ' }
    expect(await loginEmployee(credentials)).toEqual({
      id: 21,
      role: 'ADMINISTRATOR',
      firstName: 'Ana',
    })
    expect(post).toHaveBeenCalledExactlyOnceWith('/auth/employees/login', credentials, {
      timeout: 15000,
    })
  })

  it('changes employee passwords through the cookie-authenticated endpoint', async () => {
    const { changeEmployeePassword } = await import('@/services/authService')
    const payload = {
      currentPassword: 'Current!Password9',
      newPassword: 'Cr0wn!River77',
      confirmNewPassword: 'Cr0wn!River77',
      expirationDays: 90 as const,
    }
    patch.mockResolvedValueOnce({ data: { message: 'Contraseña actualizada correctamente' } })
    await expect(changeEmployeePassword(payload)).resolves.toBeUndefined()
    expect(patch).toHaveBeenCalledExactlyOnceWith('/auth/employees/password', payload, {
      timeout: 15000,
    })
  })

  it('maps employee password errors without exposing backend messages', async () => {
    const { changeEmployeePassword } = await import('@/services/authService')
    patch.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: { code: 'CURRENT_PASSWORD_INCORRECT', message: 'database details' },
      },
    })
    await expect(
      changeEmployeePassword({
        currentPassword: 'bad',
        newPassword: 'Cr0wn!River77',
        confirmNewPassword: 'Cr0wn!River77',
        expirationDays: 90,
      }),
    ).rejects.toMatchObject({ code: 'CURRENT_PASSWORD_INCORRECT' })
    expect(patch).toHaveBeenCalledTimes(1)
  })

  it('blocks employee login while a client session is stored', async () => {
    localStorage.setItem('accessToken', 'client-token')
    get.mockResolvedValueOnce({
      data: { id: 7, email: 'client@example.com', firstName: 'Ana', lastName: 'Rojas' },
    })
    const { loginEmployee } = await import('@/services/authService')

    await expect(
      loginEmployee({ email: 'staff@example.com', password: 'Password' }),
    ).rejects.toThrow('sesión de cliente')
    expect(post).not.toHaveBeenCalled()
  })

  it('recovers only staff identities and treats 401 as no session', async () => {
    const { getEmployeeSession } = await import('@/services/authService')
    get.mockResolvedValueOnce({ data: { id: 22, role: 'EMPLOYEE', firstName: 'Ana' } })
    expect(await getEmployeeSession()).toEqual({ id: 22, role: 'EMPLOYEE', firstName: 'Ana' })
    expect(get).toHaveBeenCalledWith('/auth/me', { timeout: 10000 })
    get.mockRejectedValueOnce({ isAxiosError: true, response: { status: 401 } })
    expect(await getEmployeeSession()).toBeNull()
    get.mockResolvedValueOnce({ data: { id: 22, role: 'CLIENT', firstName: 'Ana' } })
    await expect(getEmployeeSession()).rejects.toThrow('AUTH_RESPONSE_INVALID')
  })

  it.each([
    null,
    {},
    { id: 0, role: 'EMPLOYEE' },
    { id: 1.5, role: 'EMPLOYEE' },
    { id: '21', role: 'ADMINISTRATOR' },
    { id: 21, role: 'CLIENT', firstName: 'Ana' },
  ])('rejects malformed login identity %p', async (user) => {
    const { loginEmployee } = await import('@/services/authService')
    post.mockResolvedValue({ data: { user } })
    await expect(loginEmployee({ email: 'a@example.com', password: 'x' })).rejects.toThrow(
      'AUTH_RESPONSE_INVALID',
    )
  })

  it.each([undefined, null, 42, '', '   '])(
    'rejects an invalid first name %p',
    async (firstName) => {
      const { getEmployeeSession } = await import('@/services/authService')
      get.mockResolvedValue({ data: { id: 21, role: 'EMPLOYEE', firstName } })
      await expect(getEmployeeSession()).rejects.toThrow('AUTH_RESPONSE_INVALID')
    },
  )

  it.each([
    [400, 'Revisa'],
    [401, 'incorrectos'],
    [403, 'autorizar'],
    [500, 'Error 500'],
  ])('maps status %s without exposing internal messages', async (status, message) => {
    const { loginEmployee } = await import('@/services/authService')
    post.mockRejectedValue({
      isAxiosError: true,
      response: { status, data: { message: 'private SQL' } },
    })
    await expect(loginEmployee({ email: 'a@example.com', password: 'x' })).rejects.toThrow(
      String(message),
    )
    await expect(loginEmployee({ email: 'a@example.com', password: 'x' })).rejects.not.toThrow(
      /recarga/i,
    )
    expect(post).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['12', 12],
    ['1.5', 2],
    ['invalid', 60],
    [undefined, 60],
    ['-4', 60],
    ['99999', 60],
  ])('honors Retry-After %p with a bounded delay', async (header, expected) => {
    const { loginEmployee } = await import('@/services/authService')
    post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 429, headers: { 'retry-after': header } },
    })
    await expect(loginEmployee({ email: 'a@example.com', password: 'x' })).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: expected,
    })
  })

  it('clears the server cookie through logout and reports transport failures without retries', async () => {
    const { logoutEmployee, getEmployeeSession } = await import('@/services/authService')
    post.mockResolvedValue({ status: 204 })
    await logoutEmployee()
    expect(post).toHaveBeenCalledExactlyOnceWith('/auth/employees/logout', undefined, {
      timeout: 10000,
    })
    post.mockRejectedValueOnce(new Error('Private transport details'))
    await expect(logoutEmployee()).rejects.toThrow('solicitud de autenticación')
    get.mockRejectedValueOnce({ isAxiosError: true, code: 'ERR_NETWORK' })
    await expect(getEmployeeSession()).rejects.toThrow('AUTH_NETWORK')
  })

  it('allows staff login after an expired client token is rejected', async () => {
    localStorage.setItem('accessToken', 'expired-token')
    post.mockResolvedValueOnce({ data: { user: { id: 21, role: 'EMPLOYEE', firstName: 'Ana' } } })
    const { loginEmployee } = await import('@/services/authService')
    await expect(
      loginEmployee({ email: 'staff@example.com', password: 'secret' }),
    ).resolves.toMatchObject({ id: 21 })
    expect(localStorage.getItem('accessToken')).toBeNull()
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('blocks client login while a verified employee session exists', async () => {
    get.mockResolvedValueOnce({ data: { id: 21, role: 'EMPLOYEE', firstName: 'Ana' } })
    const { loginClient } = await import('@/services/authService')
    await expect(loginClient({ email: 'ana@example.com', password: 'secret' })).rejects.toThrow(
      'sesión del personal',
    )
    expect(post).not.toHaveBeenCalled()
  })

  it('does not replace a newer client session with a late login response', async () => {
    let resolve!: (value: unknown) => void
    post.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    const { loginClient } = await import('@/services/authService')
    const { establishClientSession } = await import('@/services/client-session.service')
    const pending = loginClient({ email: 'ana@example.com', password: 'secret' })
    await vi.waitFor(() => expect(post).toHaveBeenCalled())
    establishClientSession(
      { id: 8, email: 'new@example.com', firstName: 'Luis', lastName: '' },
      'new-token',
    )
    resolve({
      data: {
        client: { id: 7, email: 'ana@example.com', firstName: 'Ana', lastName: '' },
        accessToken: 'old-token',
      },
    })
    await expect(pending).rejects.toThrow('La sesión cambió')
    expect(localStorage.getItem('accessToken')).toBe('new-token')
  })

  it('rejects a malformed employee password status response', async () => {
    get.mockResolvedValueOnce({ data: { status: 'unknown' } })
    const { getEmployeePasswordStatus } = await import('@/services/authService')
    await expect(getEmployeePasswordStatus()).rejects.toThrow('AUTH_RESPONSE_INVALID')
  })

  it('does not start an automatic Facebook login after the user changes the session', async () => {
    const { facebookLogin } = await import('@/services/authService')
    const { clientSessionRevision, beginClientSessionChange } =
      await import('@/services/client-session.service')
    const revision = clientSessionRevision()
    beginClientSessionChange()
    await expect(facebookLogin('provider-token', revision)).rejects.toThrow('La sesión cambió')
    expect(post).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
  })

  it('opens the Google popup before awaiting a session request', async () => {
    let resolve!: (result: { code: string }) => void
    googleAuthCodeLogin.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    post.mockResolvedValueOnce({
      data: {
        client: { id: 7, email: 'ana@example.com', firstName: 'Ana', lastName: '' },
        accessToken: 'google-token',
      },
    })
    const { loginWithGoogle } = await import('@/services/authService')
    const pending = loginWithGoogle()
    expect(googleAuthCodeLogin).toHaveBeenCalledTimes(1)
    expect(get).not.toHaveBeenCalled()
    resolve({ code: 'google-code' })
    await expect(pending).resolves.toMatchObject({ id: 7 })
  })
})
