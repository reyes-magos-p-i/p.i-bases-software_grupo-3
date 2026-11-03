// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getApi } from '@/services/api'
import { getPosterUrl, uploadPoster } from '@/services/image-handler.service'

vi.mock('@/services/api', () => ({ getApi: vi.fn() }))

const post = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getApi).mockReturnValue({ post } as unknown as ReturnType<typeof getApi>)
  vi.stubEnv('VITE_API_BASE_URL', 'https://cinema.example.com/api')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('uploadPoster', () => {
  it('uploads the file under the image field and returns the response data', async () => {
    const file = new File(['poster'], 'poster.jpg', { type: 'image/jpeg' })
    const response = { filename: 'saved.jpg', path: '/uploads/posters/saved.jpg' }
    post.mockResolvedValue({ data: response })

    const result = await uploadPoster(file)

    expect(getApi).toHaveBeenCalledOnce()
    expect(post).toHaveBeenCalledExactlyOnceWith(
      '/image-handler/posters',
      expect.any(FormData),
    )
    const data = post.mock.calls[0]![1] as FormData
    expect(data.get('image')).toBe(file)
    expect(result).toEqual(response)
  })

  it('propagates API errors', async () => {
    const error = new Error('Upload failed')
    post.mockRejectedValue(error)

    await expect(uploadPoster(new File(['poster'], 'poster.jpg'))).rejects.toBe(error)
  })
})

describe('getPosterUrl', () => {
  it.each([undefined, null, '', '/uploads/posters/'])(
    'returns null for %s',
    (value) => {
      expect(getPosterUrl(value)).toBeNull()
    },
  )

  it.each(['poster.jpg', '/uploads/posters/poster.jpg'])(
    'builds a URL from %s',
    (value) => {
      expect(getPosterUrl(value)).toBe(
        'https://cinema.example.com/uploads/posters/poster.jpg',
      )
    },
  )

  it('encodes special characters in the filename', () => {
    expect(getPosterUrl('my poster #1.jpg')).toBe(
      'https://cinema.example.com/uploads/posters/my%20poster%20%231.jpg',
    )
  })

  it('trims whitespace from the configured API URL', () => {
    vi.stubEnv('VITE_API_BASE_URL', '  https://cinema.example.com/api  ')

    expect(getPosterUrl('poster.jpg')).toBe(
      'https://cinema.example.com/uploads/posters/poster.jpg',
    )
  })

  it.each([undefined, '', '   '])(
    'throws when the API URL is missing or blank (%s)',
    (value) => {
      vi.stubEnv('VITE_API_BASE_URL', value)

      expect(() => getPosterUrl('poster.jpg')).toThrow('Falta configurar VITE_API_BASE_URL.')
    },
  )

  it('returns null for an empty value even when the API URL is missing', () => {
    vi.stubEnv('VITE_API_BASE_URL', undefined)

    expect(getPosterUrl(null)).toBeNull()
  })

  it('uses the frontend origin when the API base URL is relative', () => {
    vi.stubEnv('VITE_API_BASE_URL', '/api')

    expect(getPosterUrl('poster.jpg')).toBe(
      `${window.location.origin}/uploads/posters/poster.jpg`,
    )
  })
})
