import placeholderImage from '@/assets/images/placeholder.svg'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import HeroCarousel from '@/components/landing/HeroCarousel.vue'
import type { PortalMovie } from '@/types/movie'

describe('HeroCarousel', () => {
  let wrapper: VueWrapper | undefined
  const movies: PortalMovie[] = Array.from({ length: 6 }, (_item, index) => ({
    id: index + 1,
    title: `Película ${index + 1}`,
    posterImage: `${index + 1}.jpg`,
  }))
  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.useRealTimers()
  })
  it('shows only the first four movies in the supplied priority order', async () => {
    wrapper = mount(HeroCarousel, { props: { movies: [movies[5]!, ...movies.slice(0, 5)] } })
    expect(wrapper.findAll('.indicator')).toHaveLength(4)
    expect(wrapper.get('img').attributes('alt')).toBe('Película 6')
    await wrapper.get('[aria-label="Siguiente película"]').trigger('click')
    expect(wrapper.get('img').attributes('alt')).toBe('Película 1')
    await wrapper.get('[aria-label="Película anterior"]').trigger('click')
    expect(wrapper.get('img').attributes('alt')).toBe('Película 6')
    await wrapper.get('[aria-label="Mostrar película 4"]').trigger('click')
    expect(wrapper.get('img').attributes('alt')).toBe('Película 3')
  })
  it('rotates automatically and clears its timer on unmount', async () => {
    vi.useFakeTimers()
    wrapper = mount(HeroCarousel, { props: { movies } })
    await vi.advanceTimersByTimeAsync(5000)
    expect(wrapper.get('img').attributes('alt')).toBe('Película 2')
    wrapper.unmount()
    wrapper = undefined
    expect(vi.getTimerCount()).toBe(0)
  })
  it('falls back to the default slide and resets the position when the catalog changes', async () => {
    wrapper = mount(HeroCarousel, { props: { movies } })
    await wrapper.get('[aria-label="Película anterior"]').trigger('click')
    expect(wrapper.get('img').attributes('alt')).toBe('Película 4')
    await wrapper.setProps({ movies: [] })
    expect(wrapper.get('img').attributes('alt')).toBe('Cinetadel')
    await wrapper.get('img').trigger('error')
    expect(wrapper.get('img').attributes('src')).toBe(placeholderImage)
    await wrapper.setProps({ movies: [movies[4]!] })
    expect(wrapper.get('img').attributes('alt')).toBe('Película 5')
    await wrapper.get('img').trigger('error')
    expect(wrapper.get('img').attributes('src')).toBe(placeholderImage)
  })
})
