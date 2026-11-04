import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import placeholderPoster from '@/assets/images/placeholder.svg'

describe('ProjectionPoster', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_API_BASE_URL', '/api')
  })
  afterEach(() => vi.unstubAllEnvs())

  async function render(posterImage?: string) {
    const { default: ProjectionPoster } = await import(
      '@/components/projections/ProjectionPoster.vue'
    )
    return mount(ProjectionPoster, { props: { posterImage, title: 'Interstellar' } })
  }

  it('shows the placeholder when the movie has no poster', async () => {
    const wrapper = await render()
    expect(wrapper.get('img').attributes('src')).toBe(placeholderPoster)
  })

  it('serves a poster stored as a file name from the image route', async () => {
    const wrapper = await render('interstellar.jpg')
    expect(wrapper.get('img').attributes('src')).toBe('/api/image/interstellar.jpg')
  })

  it('serves an uploaded poster from its stored path', async () => {
    const wrapper = await render('/uploads/posters/a1b2.webp')
    expect(wrapper.get('img').attributes('src')).toBe(
      `${window.location.origin}/uploads/posters/a1b2.webp`,
    )
  })

  it('falls back to the placeholder when the poster fails and retries with the next one', async () => {
    const wrapper = await render('/uploads/posters/missing.webp')
    await wrapper.get('img').trigger('error')
    expect(wrapper.get('img').attributes('src')).toBe(placeholderPoster)
    await wrapper.setProps({ posterImage: 'interstellar.jpg' })
    expect(wrapper.get('img').attributes('src')).toBe('/api/image/interstellar.jpg')
  })
})
