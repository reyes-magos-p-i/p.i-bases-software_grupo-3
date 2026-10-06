import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RegisterPayload } from '@/types/client'

const { create, post, get, googleAuthCodeLogin } = vi.hoisted(() => ({
  create: vi.fn(),
  post: vi.fn(),
  get: vi.fn(),
  googleAuthCodeLogin: vi.fn(),
}))
vi.mock('axios', () => ({
  default: { create },
  isAxiosError: (error: { isAxiosError?: boolean }) => error?.isAxiosError === true,
}))
vi.mock('vue3-google-login', () => ({ googleAuthCodeLogin }))

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
    vi.stubEnv('VITE_API_BASE_URL', '/api')
    create.mockImplementation((defaults) => ({ defaults, post, get }))
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
    vi.stubEnv('VITE_API_BASE_URL', '/api')
    localStorage.clear()
    get.mockRejectedValue({ isAxiosError: true, response: { status: 401 } })
    create.mockImplementation((defaults) => ({ defaults, post, get }))
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
    vi.stubEnv('VITE_API_BASE_URL', '/api')
    localStorage.clear()
    get.mockRejectedValue({ isAxiosError: true, response: { status: 401 } })
    create.mockImplementation((defaults) => ({ defaults, post, get }))
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
    vi.stubEnv('VITE_API_BASE_URL', '/api')
    localStorage.clear()
    create.mockImplementation((defaults) => ({ defaults, post, get }))
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

  it('blocks employee login while a client session is stored', async () => {
    localStorage.setItem('accessToken', 'client-token')
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
    await expect(getEmployeeSession()).rejects.toThrow('verificar')
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
      'verificar',
    )
  })

  it.each([undefined, null, 42, '', '   '])(
    'rejects an invalid first name %p',
    async (firstName) => {
      const { getEmployeeSession } = await import('@/services/authService')
      get.mockResolvedValue({ data: { id: 21, role: 'EMPLOYEE', firstName } })
      await expect(getEmployeeSession()).rejects.toThrow('verificar')
    },
  )

  it.each([
    [400, 'Revisa'],
    [401, 'incorrectos'],
    [403, 'autorizar'],
    [500, 'conectar'],
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
    await expect(logoutEmployee()).rejects.toThrow('conectar')
    get.mockRejectedValueOnce({ isAxiosError: true, code: 'ERR_NETWORK' })
    await expect(getEmployeeSession()).rejects.toThrow('conectar')
  })
})
