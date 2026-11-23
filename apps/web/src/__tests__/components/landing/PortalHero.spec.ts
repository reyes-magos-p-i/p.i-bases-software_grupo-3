import { mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PortalHero from '@/components/landing/PortalHero.vue'
import type { PortalSectionMovie } from '@/types/portal'

// SCRUM-438: featured movies of Cartelera ("Destacada" in the prototype).
const movie = (id: number, title: string): PortalSectionMovie => ({
  id,
  title,
  posterImage: `${id}.webp`,
  synopsis: `Sinopsis de ${title}.`,
  classification: '+12',
  runningTime: 128,
  genres: ['Acción', 'Aventura'],
  releaseDate: null,
  presaleStart: null,
})
const movies = Array.from({ length: 6 }, (_item, index) =>
  movie(index + 1, `Película ${index + 1}`),
)

describe('PortalHero', () => {
  let reduceMotion = false
  beforeEach(() => {
    vi.useFakeTimers()
    reduceMotion = false
    vi.stubGlobal('matchMedia', () => ({ matches: reduceMotion }))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const mountHero = (list: PortalSectionMovie[] = movies) =>
    mount(PortalHero, {
      props: { movies: list },
      global: { stubs: { RouterLink: RouterLinkStub, MoviePoster: true } },
    })
  const title = (wrapper: ReturnType<typeof mountHero>) => wrapper.get('.hero-title').text()

  it('features the first Cartelera movie with its details and purchase link', () => {
    const wrapper = mountHero()

    expect(wrapper.get('.eyebrow').text()).toBe('En cartelera · Destacada')
    expect(title(wrapper)).toBe('Película 1')
    expect(wrapper.get('.meta').text()).toContain('+12')
    expect(wrapper.get('.meta').text()).toContain('2 h 8 min')
    expect(wrapper.get('.meta').text()).toContain('Acción, Aventura')
    expect(wrapper.get('.synopsis').text()).toBe('Sinopsis de Película 1.')
    const [buy, cartelera] = wrapper.findAllComponents(RouterLinkStub)
    expect(buy!.props('to')).toEqual({ name: 'buy-tickets', query: { movieId: 1 } })
    expect(buy!.attributes('aria-label')).toBe('Comprar boletos para Película 1')
    expect(cartelera!.props('to')).toEqual({ path: '/', hash: '#cartelera' })
    expect(wrapper.findAll('.thumb')).toHaveLength(5)
  })

  it('changes the featured movie from the thumbnails and the arrows', async () => {
    const wrapper = mountHero()

    await wrapper.findAll('.thumb')[2]!.trigger('click')
    expect(title(wrapper)).toBe('Película 3')
    expect(wrapper.findAll('.thumb')[2]!.attributes('aria-current')).toBe('true')

    await wrapper.get('[aria-label="Siguiente película"]').trigger('click')
    expect(title(wrapper)).toBe('Película 4')
    await wrapper.findAll('.thumb')[0]!.trigger('click')
    await wrapper.get('[aria-label="Película anterior"]').trigger('click')
    expect(title(wrapper)).toBe('Película 5')
  })

  it('rotates on its own until it is paused or the visitor points at it', async () => {
    const wrapper = mountHero()

    vi.advanceTimersByTime(7000)
    await wrapper.vm.$nextTick()
    expect(title(wrapper)).toBe('Película 2')

    await wrapper.trigger('mouseenter')
    vi.advanceTimersByTime(7000)
    await wrapper.vm.$nextTick()
    expect(title(wrapper)).toBe('Película 2')
    await wrapper.trigger('mouseleave')

    const pause = wrapper.get('[aria-label="Pausar rotación"]')
    await pause.trigger('click')
    expect(pause.attributes('aria-pressed')).toBe('true')
    expect(pause.attributes('aria-label')).toBe('Reanudar rotación')
    vi.advanceTimersByTime(14000)
    await wrapper.vm.$nextTick()
    expect(title(wrapper)).toBe('Película 2')
    wrapper.unmount()
  })

  it('keeps rotating only while the focus stays outside', async () => {
    const wrapper = mountHero()
    const thumb = wrapper.findAll('.thumb')[1]!.element

    await wrapper.trigger('focusin')
    await wrapper.trigger('focusout', { relatedTarget: thumb })
    vi.advanceTimersByTime(7000)
    await wrapper.vm.$nextTick()
    expect(title(wrapper)).toBe('Película 1')

    await wrapper.trigger('focusout', { relatedTarget: null })
    vi.advanceTimersByTime(7000)
    await wrapper.vm.$nextTick()
    expect(title(wrapper)).toBe('Película 2')
  })

  it('starts paused when the visitor prefers reduced motion', async () => {
    reduceMotion = true
    const wrapper = mountHero()

    vi.advanceTimersByTime(14000)
    await wrapper.vm.$nextTick()
    expect(title(wrapper)).toBe('Película 1')
    expect(wrapper.find('[aria-label="Reanudar rotación"]').exists()).toBe(true)
  })

  it('goes back to the first movie when Cartelera changes', async () => {
    const wrapper = mountHero()
    await wrapper.findAll('.thumb')[3]!.trigger('click')

    await wrapper.setProps({ movies: [movie(9, 'Nueva'), movie(10, 'Otra')] })

    expect(title(wrapper)).toBe('Nueva')
  })

  it('shows a single movie without the thumbnail bar', () => {
    const wrapper = mountHero([{ ...movie(1, 'Sola'), classification: null, genres: [] }])

    expect(wrapper.find('.thumbs-bar').exists()).toBe(false)
    expect(wrapper.find('.separator').exists()).toBe(false)
    expect(wrapper.get('.meta').text()).toBe('2 h 8 min')
  })

  it('presents Cinetadel while Cartelera is empty', () => {
    const wrapper = mountHero([])

    expect(title(wrapper)).toBe('Cartelera, preventas y estrenos')
    expect(wrapper.find('.hero-poster').exists()).toBe(false)
    expect(wrapper.findComponent(RouterLinkStub).exists()).toBe(false)
  })
})
