import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stripTrailingSlashes } from '../../services/movieFunctions'

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }))
vi.mock('@/services/api', () => ({ getApi: () => ({ get: apiGet }) }))

const API_BASE_URL = 'https://api.example.com'
const ENDPOINT = `${API_BASE_URL}/movie-fuctions`

describe('stripTrailingSlashes', () => {
  it('leaves a string with no trailing slash unchanged', () => {
    expect(stripTrailingSlashes('https://api.example.com/v1')).toBe('https://api.example.com/v1')
  })

  it('removes a single trailing slash', () => {
    expect(stripTrailingSlashes('https://api.example.com/')).toBe('https://api.example.com')
  })

  it('removes multiple trailing slashes', () => {
    expect(stripTrailingSlashes('https://api.example.com///')).toBe('https://api.example.com')
  })

  it('keeps slashes in the middle', () => {
    expect(stripTrailingSlashes('/api/users/')).toBe('/api/users')
  })

  it('returns empty string for only slashes', () => {
    expect(stripTrailingSlashes('/')).toBe('')
    expect(stripTrailingSlashes('///')).toBe('')
  })

  it('handles empty string', () => {
    expect(stripTrailingSlashes('')).toBe('')
  })
})

describe('getMovieFunctions', () => {
  beforeEach(() => {
    vi.resetModules()
    apiGet.mockReset()
    localStorage.clear()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  async function loadService() {
    return import('../../services/movieFunctions')
  }

  it('fetches movie functions from the API', async () => {
    vi.stubEnv('VITE_API_BASE_URL', `${API_BASE_URL}/`)

    const payload = [{ title: 'harry potter', posterImage: 'hp.svg' }]
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(payload),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { getMovieFunctions } = await loadService()
    const result = await getMovieFunctions()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(ENDPOINT)
    expect(result).toEqual(payload)
  })

  it('strips trailing slashes from VITE_API_BASE_URLL', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com///')

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue([]),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { getMovieFunctions } = await loadService()
    await getMovieFunctions()

    expect(fetchMock).toHaveBeenCalledWith(ENDPOINT)
  })

  it('throws when VITE_API_BASE_URL is not defined', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '')

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { getMovieFunctions } = await loadService()

    await expect(getMovieFunctions()).rejects.toThrow('VITE_API_BASE_URL is not defined')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws when the response is not ok', async () => {
    vi.stubEnv('VITE_API_BASE_URL', API_BASE_URL)

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn(),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { getMovieFunctions } = await loadService()

    await expect(getMovieFunctions()).rejects.toThrow('Failed to load movie functions: 500')
  })
  it('fetches the complete general catalog without credentials', async () => {
    vi.stubEnv('VITE_API_BASE_URL', API_BASE_URL)
    apiGet.mockResolvedValue({ data: [{ id: 1, title: 'General', posterImage: '1.jpg' }] })
    const signal = new AbortController().signal
    const { getPortalMovies } = await loadService()
    await expect(getPortalMovies(false, signal)).resolves.toEqual([
      { id: 1, title: 'General', posterImage: '1.jpg' },
    ])
    expect(apiGet).toHaveBeenCalledExactlyOnceWith('/movie-fuctions/catalog', {
      adapter: 'fetch',
      withCredentials: false,
      timeout: 10000,
      signal,
    })
  })
  it('uses the current client bearer token for personalized movies', async () => {
    localStorage.setItem('accessToken', 'client-token')
    apiGet.mockResolvedValue({ data: [] })
    const { getPortalMovies } = await loadService()
    await expect(getPortalMovies(true)).resolves.toEqual([])
    expect(apiGet).toHaveBeenCalledExactlyOnceWith('/clients/me/preferences/portal', {
      adapter: 'fetch',
      withCredentials: false,
      timeout: 10000,
      headers: { Authorization: 'Bearer client-token' },
      signal: undefined,
    })
  })
  it('rejects personalized requests without a token and propagates service failures', async () => {
    const { getPortalMovies } = await loadService()
    await expect(getPortalMovies(true)).rejects.toMatchObject({ status: 401 })
    expect(apiGet).not.toHaveBeenCalled()
    apiGet.mockRejectedValue(new Error('offline'))
    await expect(getPortalMovies()).rejects.toThrow('offline')
  })
})
