// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getApi } from '@/services/api'
import { getPosterUrl, getPromotionPosterUrl, uploadPoster, uploadPromotionPoster } from '@/services/image-handler.service'

vi.mock('@/services/api', () => ({ getApi: vi.fn() }))

const post = vi.fn()
const api = { post, defaults: { baseURL: '/api' } }

beforeEach(() => {
  post.mockReset()
  api.defaults.baseURL = '/api'
  vi.mocked(getApi).mockReset().mockReturnValue(
    api as unknown as ReturnType<typeof getApi>,
  )
})

afterEach(() => { vi.unstubAllEnvs() })

describe('uploadPromotionPoster', () => {
  it('uploads the file as multipart data using the image field and credentials', async () => {
    const file = new File(['image'], 'banner.png', { type: 'image/png' })
    post.mockResolvedValue({ data: {
      filename: 'banner.webp', path: '/uploads/promotions/banner.webp',
    } })

    await uploadPromotionPoster(file)

    expect(getApi).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith(
      '/image-handler/promotions',
      expect.any(FormData),
      { withCredentials: true },
    )
    const data = post.mock.calls[0]![1] as FormData
    expect([...data.keys()]).toEqual(['image'])
    expect(data.getAll('image')).toHaveLength(1)
    const uploaded = data.get('image') as File
    expect(uploaded).toBeInstanceOf(File)
    expect(uploaded.name).toBe(file.name)
    expect(uploaded.type).toBe(file.type)
    expect(uploaded.size).toBe(file.size)
  })

  it('returns the filename and path from response.data', async () => {
    const data = { filename: 'new.webp', path: '/uploads/promotions/new.webp' }
    post.mockResolvedValue({ data, status: 201 })

    const result = await uploadPromotionPoster(new File(['image'], 'banner.png'))

    expect(result).toBe(data)
  })

  it.each([400, 401, 403, 413, 415, 500])('propagates HTTP %s failures', async (status) => {
    const error = Object.assign(new Error(`HTTP ${status}`), {
      isAxiosError: true, response: { status },
    })
    post.mockRejectedValue(error)

    await expect(uploadPromotionPoster(new File(['image'], 'banner.png'))).rejects.toBe(error)
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('propagates network errors without retrying the upload', async () => {
    const error = new Error('Network Error')
    post.mockRejectedValue(error)

    await expect(uploadPromotionPoster(new File(['image'], 'banner.png'))).rejects.toBe(error)
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('propagates API configuration errors before sending the upload', async () => {
    const error = new Error('Falta configurar VITE_API_BASE_URL para conectar con el backend.')
    vi.mocked(getApi).mockImplementation(() => { throw error })

    await expect(uploadPromotionPoster(new File(['image'], 'banner.png'))).rejects.toBe(error)
    expect(post).not.toHaveBeenCalled()
  })
})

describe('getPromotionPosterUrl', () => {
  it.each([undefined, null, '', '/uploads/promotions/'])(
    'returns null for missing filenames: %p', (stored) => {
      expect(getPromotionPosterUrl(stored)).toBeNull()
      expect(getApi).not.toHaveBeenCalled()
    },
  )

  it.each([
    { stored: 'banner.webp' },
    { stored: '/uploads/promotions/banner.webp' },
    { stored: 'uploads/promotions/banner.webp' },
  ])('extracts the filename from $stored', ({ stored }) => {
    expect(getPromotionPosterUrl(stored)).toBe('/api/image-handler/promotions/banner.webp')
  })

  it.each(['/api', '/api/', '/api///'])(
    'normalizes trailing slashes for %s', (baseURL) => {
      api.defaults.baseURL = baseURL
      expect(getPromotionPosterUrl('banner.webp')).toBe('/api/image-handler/promotions/banner.webp')
    },
  )

  it('supports an absolute backend base URL', () => {
    api.defaults.baseURL = 'https://cinema.example/api/'
    expect(getPromotionPosterUrl('/uploads/promotions/banner.webp'))
      .toBe('https://cinema.example/api/image-handler/promotions/banner.webp')
  })

  it('encodes special characters in filenames', () => {
    expect(getPromotionPosterUrl('/uploads/promotions/oferta verano #1.webp'))
      .toBe('/api/image-handler/promotions/oferta%20verano%20%231.webp')
  })

  it('propagates missing API configuration when a filename is present', () => {
    const error = new Error('Falta configurar VITE_API_BASE_URL para conectar con el backend.')
    vi.mocked(getApi).mockImplementation(() => { throw error })
    expect(() => getPromotionPosterUrl('banner.webp')).toThrow(error)
  })
})

describe('uploadPoster', () => {
  it('posts the movie poster as multipart data using the image field', async () => {
    const file = new File(['movie poster'], 'movie.jpg', { type: 'image/jpeg' })
    const data = { filename: 'movie.webp', path: '/uploads/posters/movie.webp' }
    post.mockResolvedValue({ data, status: 201 })

    const result = await uploadPoster(file)

    expect(getApi).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledTimes(1)
    // This implementation does not pass a third Axios config argument.
    expect(post).toHaveBeenCalledWith('/image-handler/posters', expect.any(FormData))
    const body = post.mock.calls[0]![1] as FormData
    expect([...body.keys()]).toEqual(['image'])
    expect(body.getAll('image')).toHaveLength(1)
    const uploaded = body.get('image') as File
    expect(uploaded.name).toBe('movie.jpg')
    expect(uploaded.type).toBe('image/jpeg')
    expect(uploaded.size).toBe(file.size)
    expect(result).toBe(data)
  })

  it.each([400, 401, 403, 413, 415, 500])('propagates HTTP %s errors', async (status) => {
    const error = Object.assign(new Error(`HTTP ${status}`), { response: { status } })
    post.mockRejectedValue(error)
    await expect(uploadPoster(new File(['image'], 'movie.png'))).rejects.toBe(error)
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('propagates network errors without retrying', async () => {
    const error = new Error('Network Error')
    post.mockRejectedValue(error)
    await expect(uploadPoster(new File(['image'], 'movie.png'))).rejects.toBe(error)
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('propagates a getApi configuration failure without sending a request', async () => {
    const error = new Error('API configuration missing')
    vi.mocked(getApi).mockImplementation(() => { throw error })
    await expect(uploadPoster(new File(['image'], 'movie.png'))).rejects.toBe(error)
    expect(post).not.toHaveBeenCalled()
  })
})

describe('getPosterUrl', () => {
  it.each([undefined, null, '', '/uploads/posters/'])(
    'returns null without requiring configuration for %p', (stored) => {
      vi.stubEnv('VITE_API_BASE_URL', '')
      expect(getPosterUrl(stored)).toBeNull()
      expect(getApi).not.toHaveBeenCalled()
    },
  )

  it.each(['', '   '])('rejects missing or blank base URL: %p', (baseURL) => {
    vi.stubEnv('VITE_API_BASE_URL', baseURL)
    expect(() => getPosterUrl('movie.webp')).toThrow('Falta configurar VITE_API_BASE_URL.')
  })

  it.each([
    { baseURL: '/api', path: '/api/image-handler/posters/movie.webp' },
    { baseURL: '/api/', path: '/api/image-handler/posters/movie.webp' },
    { baseURL: '  /api  ', path: '/api/image-handler/posters/movie.webp' },
    { baseURL: '/', path: '/api/image-handler/posters/movie.webp' },
    { baseURL: '/backend/api', path: '/backend/api/image-handler/posters/movie.webp' },
  ])('resolves relative base $baseURL against the browser origin', ({ baseURL, path }) => {
    vi.stubEnv('VITE_API_BASE_URL', baseURL)
    expect(getPosterUrl('/uploads/posters/movie.webp')).toBe(`${window.location.origin}${path}`)
  })

  it.each([
    { baseURL: 'http://localhost:3000', expected: 'http://localhost:3000/api/image-handler/posters/movie.webp' },
    { baseURL: 'http://localhost:3000/', expected: 'http://localhost:3000/api/image-handler/posters/movie.webp' },
    { baseURL: 'https://cinema.example/api', expected: 'https://cinema.example/api/image-handler/posters/movie.webp' },
    { baseURL: 'https://cinema.example/backend/api/', expected: 'https://cinema.example/backend/api/image-handler/posters/movie.webp' },
  ])('builds a movie URL using $baseURL', ({ baseURL, expected }) => {
    vi.stubEnv('VITE_API_BASE_URL', baseURL)
    expect(getPosterUrl('movie.webp')).toBe(expected)
  })

  it.each(['movie.webp', 'uploads/posters/movie.webp', '/uploads/posters/movie.webp'])(
    'extracts only the filename from %s', (stored) => {
      vi.stubEnv('VITE_API_BASE_URL', '/api')
      expect(getPosterUrl(stored)).toBe(`${window.location.origin}/api/image-handler/posters/movie.webp`)
    },
  )

  it('uses the legacy image endpoint when requested', () => {
    vi.stubEnv('VITE_API_BASE_URL', '/api')
    expect(getPosterUrl('/uploads/legacy/movie.webp', true))
      .toBe(`${window.location.origin}/api/image/movie.webp`)
  })

  it('adds /api for a legacy URL with a root-only backend base', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://cinema.example')
    expect(getPosterUrl('movie.webp', true)).toBe('https://cinema.example/api/image/movie.webp')
  })

  it('encodes special filename characters for modern and legacy endpoints', () => {
    vi.stubEnv('VITE_API_BASE_URL', '/api')
    const stored = '/uploads/posters/película verano #1.webp'
    const filename = encodeURIComponent('película verano #1.webp')
    expect(getPosterUrl(stored)).toBe(`${window.location.origin}/api/image-handler/posters/${filename}`)
    expect(getPosterUrl(stored, true)).toBe(`${window.location.origin}/api/image/${filename}`)
  })

  it('does not require the shared API client to generate a movie URL', () => {
    vi.stubEnv('VITE_API_BASE_URL', '/api')
    vi.mocked(getApi).mockImplementation(() => { throw new Error('Must not be called') })
    expect(getPosterUrl('movie.webp')).toBe(`${window.location.origin}/api/image-handler/posters/movie.webp`)
    expect(getApi).not.toHaveBeenCalled()
  })
})
