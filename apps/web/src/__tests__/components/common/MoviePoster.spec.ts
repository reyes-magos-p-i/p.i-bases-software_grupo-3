import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MoviePoster from '@/components/common/MoviePoster.vue'
import placeholder from '@/assets/images/placeholder.svg'

describe('MoviePoster', () => {
  beforeEach(() => vi.stubEnv('VITE_API_BASE_URL', 'https://cinema.example/api'))
  afterEach(() => vi.unstubAllEnvs())

  it('uses the uploaded poster, falls back to legacy storage, and stops retrying after the placeholder', async () => {
    const view = mount(MoviePoster, {
      props: { posterImage: '/uploads/posters/a b.jpg', title: 'Película' },
    })
    const image = view.get('img')
    expect(image.attributes('alt')).toBe('Póster de Película')
    expect(image.attributes('src')).toBe('https://cinema.example/uploads/posters/a%20b.jpg')
    await image.trigger('error')
    expect(image.attributes('src')).toBe('https://cinema.example/api/image/a%20b.jpg')
    await image.trigger('error')
    expect(image.attributes('src')).toBe(placeholder)
    await image.trigger('error')
    expect(image.attributes('src')).toBe(placeholder)
    await view.setProps({ posterImage: 'nuevo.jpg' })
    expect(image.attributes('src')).toBe('https://cinema.example/uploads/posters/nuevo.jpg')
    view.unmount()
  })

  it.each([undefined, null, ''])(
    'renders an accessible fallback for a missing poster: %s',
    (posterImage) => {
      const view = mount(MoviePoster, { props: { posterImage } })
      expect(view.get('img').attributes('src')).toBe(placeholder)
      expect(view.get('img').attributes('alt')).toBe('Póster no disponible')
      view.unmount()
    },
  )

  it('keeps the page usable when image configuration is unavailable', () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    const view = mount(MoviePoster, { props: { posterImage: 'a.jpg' } })
    expect(view.get('img').attributes('src')).toBe(placeholder)
    view.unmount()
  })
})
