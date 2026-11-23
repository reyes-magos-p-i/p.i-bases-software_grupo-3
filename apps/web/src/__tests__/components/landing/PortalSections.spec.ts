import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PortalMovieCard from '@/components/landing/PortalMovieCard.vue'
import PortalSection from '@/components/landing/PortalSection.vue'
import HomeView from '@/views/HomeView.vue'
import { getPortalSection } from '@/services/movieFunctions'
import type { PortalSection as PortalSectionKey, PortalSectionMovie } from '@/types/portal'
import { formatRunningTime, formatShortDate } from '@/utils/portal-format'

vi.mock('@/services/movieFunctions', () => ({ getPortalSection: vi.fn() }))

// SCRUM-437: portal sections (UT-040 to UT-045).
const odyssey: PortalSectionMovie = {
  id: 42,
  title: 'The Odyssey',
  posterImage: 'odyssey.webp',
  synopsis: 'Ulises vuelve a casa.',
  classification: '+12',
  runningTime: 128,
  genres: ['Acción', 'Aventura'],
  releaseDate: null,
  presaleStart: null,
}
const presale: PortalSectionMovie = {
  ...odyssey,
  id: 7,
  title: 'Ecos del Volcán',
  releaseDate: '2026-12-04',
  presaleStart: '2026-11-15',
}
const upcoming: PortalSectionMovie = {
  ...odyssey,
  id: 9,
  title: 'Marea Alta',
  releaseDate: '2026-12-18',
  presaleStart: '2026-12-01',
}
const stubs = { RouterLink: RouterLinkStub, MoviePoster: true }

describe('portal format', () => {
  it.each([
    [128, '2 h 8 min'],
    [120, '2 h'],
    [52, '52 min'],
    [0, ''],
  ])('formats %i minutes as %p', (minutes, text) => {
    expect(formatRunningTime(minutes)).toBe(text)
  })

  it.each([
    ['2026-11-20', '20 nov'],
    ['2026-01-04', '4 ene'],
    ['2026-13-01', ''],
    [null, ''],
  ])('formats %p as %p', (date, text) => {
    expect(formatShortDate(date)).toBe(text)
  })
})

describe('PortalMovieCard', () => {
  const mountCard = (movie: PortalSectionMovie, section: PortalSectionKey) =>
    mount(PortalMovieCard, { props: { movie, section }, global: { stubs } })

  it('sells tickets in Cartelera, without a presale badge', () => {
    const card = mountCard(odyssey, 'cartelera')

    expect(card.text()).toContain('The Odyssey')
    expect(card.text()).toContain('+12')
    expect(card.text()).toContain('2 h 8 min')
    expect(card.text()).toContain('Acción · Aventura')
    expect(card.find('.badge-presale').exists()).toBe(false)
    expect(card.getComponent(RouterLinkStub).props('to')).toEqual({
      name: 'buy-tickets',
      query: { movieId: 42 },
    })
  })

  it('sells tickets in Preventas with the badge and the release date', () => {
    const card = mountCard(presale, 'preventas')

    expect(card.get('.badge-presale').text()).toBe('Preventa')
    expect(card.text()).toContain('Estreno el 4 dic')
    expect(card.getComponent(RouterLinkStub).attributes('aria-label')).toBe(
      'Comprar boletos para Ecos del Volcán',
    )
  })

  it('announces Estrenos without a buy button', () => {
    const card = mountCard(upcoming, 'estrenos')

    expect(card.findComponent(RouterLinkStub).exists()).toBe(false)
    expect(card.get('.release-box').text()).toBe('Estreno · 18 dic')
    expect(card.text()).toContain('Preventa desde el 1 dic')
  })

  it('omits the presale note of an upcoming movie without a presale', () => {
    const card = mountCard({ ...upcoming, presaleStart: null }, 'estrenos')

    expect(card.text()).not.toContain('Preventa desde')
  })
})

describe('PortalSection', () => {
  const props = {
    section: 'preventas' as const,
    title: 'Preventas',
    subtitle: 'Asegura tu butaca antes del estreno',
    emptyMessage: 'No hay películas en preventa por ahora.',
    errorMessage: 'No se pudieron cargar las preventas.',
    movies: [] as PortalSectionMovie[],
    loading: false,
    failed: false,
  }
  const mountSection = (overrides: Partial<typeof props> = {}) =>
    mount(PortalSection, { props: { ...props, ...overrides }, global: { stubs } })

  it('keeps its title while loading', () => {
    const section = mountSection({ loading: true })

    expect(section.get('h2').text()).toBe('Preventas')
    expect(section.attributes('aria-busy')).toBe('true')
    expect(section.findAll('.skeleton-card')).toHaveLength(5)
  })

  it('shows its own empty message (UT-044)', () => {
    const section = mountSection()

    expect(section.get('[role="status"]').text()).toBe('No hay películas en preventa por ahora.')
    expect(section.find('.see-all').exists()).toBe(false)
  })

  it('shows its own error with a retry button (UT-045)', async () => {
    const section = mountSection({ failed: true })

    expect(section.get('[role="alert"]').text()).toContain('No se pudieron cargar las preventas.')
    await section.get('.retry-button').trigger('click')
    expect(section.emitted('retry')).toHaveLength(1)
  })

  it('lists its movies in a row that expands with "Ver todas"', async () => {
    const section = mountSection({ movies: [presale, { ...presale, id: 8, title: 'Otra' }] })
    const seeAll = section.get('.see-all')

    expect(section.findAllComponents(PortalMovieCard)).toHaveLength(2)
    expect(seeAll.text()).toBe('Ver todas (2)')
    expect(seeAll.attributes('aria-expanded')).toBe('false')

    await seeAll.trigger('click')

    expect(seeAll.text()).toBe('Ver menos')
    expect(seeAll.attributes('aria-expanded')).toBe('true')
    expect(section.get('.movie-row').classes()).toContain('expanded')
    expect(section.find('.circle-button').exists()).toBe(false)
  })

  it('scrolls the row with the arrows', async () => {
    const section = mountSection({ movies: [presale] })
    const row = section.get('.movie-row').element as HTMLElement
    row.scrollBy = vi.fn()

    const [previous, next] = section.findAll('.circle-button')
    await next!.trigger('click')
    await previous!.trigger('click')

    expect(row.scrollBy).toHaveBeenCalledTimes(2)
    expect(vi.mocked(row.scrollBy).mock.calls[1]![0]).toMatchObject({ behavior: 'smooth' })
  })
})

describe('HomeView sections', () => {
  afterEach(() => vi.clearAllMocks())

  const mountHome = () =>
    mount(HomeView, {
      global: { stubs: { ...stubs, AppHeader: true, AppFooter: true, PortalHero: true } },
    })
  const titlesOf = (wrapper: ReturnType<typeof mountHome>, section: PortalSectionKey) =>
    wrapper.findAll(`#${section} .card-title`).map((title) => title.text())

  it('loads each section with its own request and features the Cartelera movies', async () => {
    const data = { cartelera: [odyssey], preventas: [presale], estrenos: [upcoming] }
    vi.mocked(getPortalSection).mockImplementation((section) => Promise.resolve(data[section]))

    const wrapper = mountHome()
    await flushPromises()

    expect(vi.mocked(getPortalSection).mock.calls.map(([section]) => section)).toEqual([
      'cartelera',
      'preventas',
      'estrenos',
    ])
    expect(titlesOf(wrapper, 'cartelera')).toEqual(['The Odyssey'])
    expect(titlesOf(wrapper, 'preventas')).toEqual(['Ecos del Volcán'])
    expect(titlesOf(wrapper, 'estrenos')).toEqual(['Marea Alta'])
    expect(wrapper.getComponent({ name: 'PortalHero' }).props('movies')).toEqual([odyssey])
  })

  it('keeps the other sections when Preventas fails, and retries only Preventas (UT-045)', async () => {
    let preventasFails = true
    vi.mocked(getPortalSection).mockImplementation((section) => {
      if (section === 'preventas' && preventasFails) return Promise.reject(new Error('blocked'))
      return Promise.resolve({ cartelera: [odyssey], preventas: [presale], estrenos: [upcoming] }[section])
    })

    const wrapper = mountHome()
    await flushPromises()

    expect(wrapper.get('#preventas [role="alert"]').text()).toContain(
      'No se pudieron cargar las preventas.',
    )
    expect(titlesOf(wrapper, 'cartelera')).toEqual(['The Odyssey'])
    expect(titlesOf(wrapper, 'estrenos')).toEqual(['Marea Alta'])

    preventasFails = false
    await wrapper.get('#preventas .retry-button').trigger('click')
    await flushPromises()

    expect(titlesOf(wrapper, 'preventas')).toEqual(['Ecos del Volcán'])
    expect(vi.mocked(getPortalSection).mock.calls.map(([section]) => section)).toEqual([
      'cartelera',
      'preventas',
      'estrenos',
      'preventas',
    ])
  })

  it('shows the empty message of Preventas and the other sections normally (UT-044)', async () => {
    vi.mocked(getPortalSection).mockImplementation((section) =>
      Promise.resolve({ cartelera: [odyssey], preventas: [], estrenos: [upcoming] }[section]),
    )

    const wrapper = mountHome()
    await flushPromises()

    expect(wrapper.get('#preventas').text()).toContain('No hay películas en preventa por ahora.')
    expect(titlesOf(wrapper, 'cartelera')).toEqual(['The Odyssey'])
    expect(titlesOf(wrapper, 'estrenos')).toEqual(['Marea Alta'])
  })

  it('ignores a section answer that a retry already replaced', async () => {
    let finishFirst!: (movies: PortalSectionMovie[]) => void
    vi.mocked(getPortalSection).mockImplementation((section) => {
      if (section !== 'preventas') return Promise.resolve([])
      if (!finishFirst)
        return new Promise((resolve) => {
          finishFirst = resolve
        })
      return Promise.reject(new Error('second fails'))
    })

    const wrapper = mountHome()
    await flushPromises()
    // A retry replaces the pending request; the late first answer must not show.
    await wrapper.findAllComponents(PortalSection)[1]!.vm.$emit('retry')
    await flushPromises()
    finishFirst([presale])
    await flushPromises()

    expect(titlesOf(wrapper, 'preventas')).toEqual([])
    expect(wrapper.find('#preventas [role="alert"]').exists()).toBe(true)
  })
})
