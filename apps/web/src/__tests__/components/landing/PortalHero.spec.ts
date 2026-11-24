import { mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PortalHero from '@/components/landing/PortalHero.vue'
import type { PortalSectionMovie } from '@/types/portal'
import { posterEdgeColors } from '@/utils/poster-edge-colors'

vi.mock('@/utils/poster-edge-colors', () => ({ posterEdgeColors: vi.fn() }))

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
  // The copy of the featured movie (every movie is rendered, only the current one is visible).
  const copy = (wrapper: ReturnType<typeof mountHero>) =>
    wrapper.find('.hero-copy.current').exists()
      ? wrapper.get('.hero-copy.current')
      : wrapper.get('.hero-copy')
  const title = (wrapper: ReturnType<typeof mountHero>) => copy(wrapper).get('.hero-title').text()

  it('features the first Cartelera movie with its details and purchase link', () => {
    const wrapper = mountHero()

    expect(copy(wrapper).get('.eyebrow').text()).toBe('En cartelera · Destacada')
    expect(title(wrapper)).toBe('Película 1')
    expect(copy(wrapper).get('.meta').text()).toContain('+12')
    expect(copy(wrapper).get('.meta').text()).toContain('2 h 8 min')
    expect(copy(wrapper).get('.meta').text()).toContain('Acción, Aventura')
    expect(copy(wrapper).get('.synopsis').text()).toBe('Sinopsis de Película 1.')
    const [buy, cartelera] = copy(wrapper).findAllComponents(RouterLinkStub)
    expect(buy!.props('to')).toEqual({ name: 'buy-tickets', query: { movieId: 1 } })
    expect(buy!.attributes('aria-label')).toBe('Comprar boletos para Película 1')
    expect(cartelera!.props('to')).toEqual({ path: '/', hash: '#cartelera' })
    const dots = wrapper.findAll('.dot')
    expect(dots).toHaveLength(5)
    expect(dots[0]!.attributes('aria-label')).toBe('Película 1')
    expect(wrapper.find('.thumb').exists()).toBe(false)
  })

  // Review of #148: the hero is as tall as its tallest movie, so rotating never moves the page.
  it('lays out every featured movie in the same place and shows only the current one', async () => {
    const wrapper = mountHero()

    expect(wrapper.findAll('.hero-slides > .hero-copy')).toHaveLength(5)
    expect(wrapper.findAll('.hero-copy.current')).toHaveLength(1)
    await wrapper.get('[aria-label="Siguiente película"]').trigger('click')
    expect(wrapper.findAll('.hero-slides > .hero-copy')).toHaveLength(5)
    expect(wrapper.findAll('.hero-copy')[1]!.classes()).toContain('current')
  })

  it('paints the background with the edge colors of the current poster', async () => {
    const edges = { top: 'rgb(1 2 3)', right: 'rgb(4 5 6)', bottom: 'rgb(7 8 9)', left: 'rgb(10 11 12)' }
    vi.mocked(posterEdgeColors).mockReturnValueOnce(edges).mockReturnValueOnce(null)
    const wrapper = mountHero()
    const ambient = () => wrapper.get('.hero-ambient').attributes('style') ?? ''
    expect(ambient()).toBe('')

    await wrapper.get('.hero-poster movie-poster-stub').trigger('load')
    expect(ambient()).toContain('--edge-top: rgb(1 2 3)')
    expect(ambient()).toContain('--edge-left: rgb(10 11 12)')

    // A poster whose pixels cannot be read keeps the previous colors.
    await wrapper.get('[aria-label="Siguiente película"]').trigger('click')
    await wrapper.get('.hero-poster movie-poster-stub').trigger('load')
    expect(ambient()).toContain('--edge-bottom: rgb(7 8 9)')
  })

  it('changes the featured movie from the dots and the arrows', async () => {
    const wrapper = mountHero()

    await wrapper.findAll('.dot')[2]!.trigger('click')
    expect(title(wrapper)).toBe('Película 3')
    expect(wrapper.findAll('.dot')[2]!.attributes('aria-current')).toBe('true')

    await wrapper.get('[aria-label="Siguiente película"]').trigger('click')
    expect(title(wrapper)).toBe('Película 4')
    await wrapper.findAll('.dot')[0]!.trigger('click')
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

  it('stays paused while the keyboard focus remains after the pointer leaves', async () => {
    const wrapper = mountHero()

    await wrapper.trigger('mouseenter')
    await wrapper.trigger('focusin')
    await wrapper.trigger('mouseleave')
    vi.advanceTimersByTime(7000)
    await wrapper.vm.$nextTick()
    expect(title(wrapper)).toBe('Película 1')

    await wrapper.trigger('focusout', { relatedTarget: null })
    vi.advanceTimersByTime(7000)
    await wrapper.vm.$nextTick()
    expect(title(wrapper)).toBe('Película 2')
  })

  it('keeps rotating only while the focus stays outside', async () => {
    const wrapper = mountHero()
    const dot = wrapper.findAll('.dot')[1]!.element

    await wrapper.trigger('focusin')
    await wrapper.trigger('focusout', { relatedTarget: dot })
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
    await wrapper.findAll('.dot')[3]!.trigger('click')

    await wrapper.setProps({ movies: [movie(9, 'Nueva'), movie(10, 'Otra')] })

    expect(title(wrapper)).toBe('Nueva')
  })

  it('shows a single movie without the controls', () => {
    const wrapper = mountHero([{ ...movie(1, 'Sola'), classification: null, genres: [] }])

    expect(wrapper.find('.controls').exists()).toBe(false)
    expect(wrapper.find('.separator').exists()).toBe(false)
    expect(copy(wrapper).get('.meta').text()).toBe('2 h 8 min')
  })

  it('presents Cinetadel while Cartelera is empty', () => {
    const wrapper = mountHero([])

    expect(title(wrapper)).toBe('Cartelera, preventas y estrenos')
    expect(wrapper.find('.hero-poster').exists()).toBe(false)
    expect(wrapper.findComponent(RouterLinkStub).exists()).toBe(false)
  })
})
