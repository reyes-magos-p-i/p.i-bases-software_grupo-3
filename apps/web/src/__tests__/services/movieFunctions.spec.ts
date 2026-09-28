import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const API_BASE_URL = 'https://api.example.com'
const ENDPOINT = `${API_BASE_URL}/movie-fuctions`

describe('getMovieFunctions', () => {
  beforeEach(() => {
    vi.resetModules()
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
})