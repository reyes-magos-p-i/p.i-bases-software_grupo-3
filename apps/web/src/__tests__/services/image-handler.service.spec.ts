// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPosterUrl, uploadPoster } from '@/services/image-handler.service'

const { post } = vi.hoisted(() => ({
  post: vi.fn(),
}))

vi.mock('@/services/api', () => ({
  getApi: () => ({ post }),
}))

describe('image-handler.service', () => {
  beforeEach(() => {
    post.mockReset()
    vi.stubEnv('VITE_API_BASE_URL', '/api')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('uploadPoster', () => {
    it('uploads the file as image and returns the response data', async () => {
      const file = new File(['image content'], 'poster.png', {
        type: 'image/png',
      })
      const response = {
        filename: 'poster.webp',
        path: '/uploads/posters/poster.webp',
      }

      post.mockResolvedValue({ data: response })

      await expect(uploadPoster(file)).resolves.toEqual(response)

      expect(post).toHaveBeenCalledTimes(1)
      expect(post).toHaveBeenCalledWith(
        '/image-handler/posters',
        expect.any(FormData),
      )

      const data = post.mock.calls[0]![1] as FormData
      expect(data.get('image')).toBe(file)
    })

    it('propagates upload errors', async () => {
      const error = new Error('Upload failed')
      post.mockRejectedValue(error)

      await expect(
        uploadPoster(new File(['image'], 'poster.png')),
      ).rejects.toBe(error)
    })
  })

  describe('getPosterUrl', () => {
    it.each([undefined, null, '', '/uploads/posters/'])(
      'returns null for an empty value or filename: %s',
      (value) => {
        expect(getPosterUrl(value)).toBeNull()
      },
    )

    it.each([
      'poster.webp',
      '/uploads/posters/poster.webp',
      'uploads/poster.webp',
      'https://old.example.com/images/poster.webp',
    ])('extracts the filename from %s', (value) => {
      expect(getPosterUrl(value)).toBe(
        `${window.location.origin}/uploads/posters/poster.webp`,
      )
    })

    it('uses the origin of an absolute API URL', () => {
      vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/api')

      expect(getPosterUrl('poster.webp')).toBe(
        'https://api.example.com/uploads/posters/poster.webp',
      )
    })

    it('encodes special characters in the filename', () => {
      expect(getPosterUrl('uploads/my poster #1.webp')).toBe(
        `${window.location.origin}/uploads/posters/my%20poster%20%231.webp`,
      )
    })

    it.each(['/api', '/api/'])(
      'builds legacy URLs with the relative API base %s',
      (base) => {
        vi.stubEnv('VITE_API_BASE_URL', base)

        expect(getPosterUrl('/uploads/poster.jpg', true)).toBe(
          `${window.location.origin}/api/image/poster.jpg`,
        )
      },
    )

    it.each([
      'https://api.example.com/api',
      'https://api.example.com/api/',
    ])('builds legacy URLs with the absolute API base %s', (base) => {
      vi.stubEnv('VITE_API_BASE_URL', base)

      expect(getPosterUrl('poster.jpg', true)).toBe(
        'https://api.example.com/api/image/poster.jpg',
      )
    })

    it('encodes legacy filenames', () => {
      expect(getPosterUrl('uploads/my poster #1.jpg', true)).toBe(
        `${window.location.origin}/api/image/my%20poster%20%231.jpg`,
      )
    })

    it('trims whitespace around the API base URL', () => {
      vi.stubEnv('VITE_API_BASE_URL', '  https://api.example.com/api  ')

      expect(getPosterUrl('poster.webp')).toBe(
        'https://api.example.com/uploads/posters/poster.webp',
      )
    })

    it.each(['', '   '])(
      'throws when the API base URL is blank: %j',
      (base) => {
        vi.stubEnv('VITE_API_BASE_URL', base)

        expect(() => getPosterUrl('poster.webp')).toThrow(
          'Falta configurar VITE_API_BASE_URL.',
        )
      },
    )

    it('throws when the API base URL is undefined', () => {
      vi.stubEnv('VITE_API_BASE_URL', undefined)

      expect(() => getPosterUrl('poster.webp')).toThrow(
        'Falta configurar VITE_API_BASE_URL.',
      )
    })

    it('returns null for missing images even without an API base URL', () => {
      vi.stubEnv('VITE_API_BASE_URL', undefined)

      expect(getPosterUrl(null)).toBeNull()
      expect(getPosterUrl('/uploads/posters/')).toBeNull()
    })
  })
})
