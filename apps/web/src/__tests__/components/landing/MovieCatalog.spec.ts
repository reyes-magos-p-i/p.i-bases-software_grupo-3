import placeholderImage from '@/assets/images/placeholder.svg'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import MovieCatalog from '@/components/landing/MovieCatalog.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import type { PortalMovie } from '@/types/movie'

beforeEach(() => vi.stubEnv('VITE_API_BASE_URL', '/api'))
afterEach(() => vi.unstubAllEnvs())

describe('MovieCatalog', () => {
  const movies: PortalMovie[] = Array.from({ length: 6 }, (_item, index) => ({
    id: index + 1,
    title: 'Mismo título',
    posterImage: `${index + 1}.jpg`,
  }))
  const render = (props: { movies: readonly PortalMovie[]; loading?: boolean; error?: string }) =>
    mount(MovieCatalog, {
      props,
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
  it('renders the complete supplied catalog in order, including movies sharing a title', async () => {
    const wrapper = render({ movies })
    expect(wrapper.findAll('.movie-card')).toHaveLength(6)
    expect(wrapper.findAllComponents(RouterLinkStub)[0]!.props('to')).toEqual({
      name: 'buy-tickets',
      query: { movieId: 1 },
    })
    expect(
      wrapper.findAll('img').map((image) => image.attributes('src')?.split('/').slice(-1)[0]),
    ).toEqual(['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg', '6.jpg'])
    await wrapper.setProps({ movies: [...movies].reverse() })
    expect(wrapper.findAll('img')[0]!.attributes('src')).toContain('/6.jpg')
    wrapper.unmount()
  })
  it('uses the shared loading component and gives actionable retry feedback', async () => {
    const wrapper = render({ movies: [], loading: true })
    expect(wrapper.text()).toContain('Cargando películas')
    expect(wrapper.getComponent(LoadingState).props('surface')).toBe('dark')
    await wrapper.setProps({ loading: false, error: 'Sin conexión' })
    expect(wrapper.get('[role="alert"]').text()).toContain('Sin conexión')
    await wrapper.get('.retry-button').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
    await wrapper.setProps({ error: '' })
    expect(wrapper.text()).toContain('No hay películas disponibles')
    wrapper.unmount()
  })
  it('uses a placeholder after a poster failure without retrying the same missing image', async () => {
    const wrapper = render({ movies: [movies[0]!] })
    const image = wrapper.get('img')
    await image.trigger('error')
    const placeholder = image.attributes('src')
    expect(placeholder).toBe(placeholderImage)
    await image.trigger('error')
    expect(image.attributes('src')).toBe(placeholder)
    wrapper.unmount()
  })
  it('shows uploaded posters from their path and the placeholder when a movie has none', () => {
    const wrapper = render({
      movies: [
        { id: 1, title: 'Subida', posterImage: '/uploads/posters/a1b2.webp' },
        { id: 2, title: 'Sin póster', posterImage: '' },
      ],
    })
    const [uploaded, missing] = wrapper.findAll('img')
    expect(uploaded!.attributes('src')).toBe(`${window.location.origin}/uploads/posters/a1b2.webp`)
    expect(missing!.attributes('src')).toBe(placeholderImage)
  })
})
