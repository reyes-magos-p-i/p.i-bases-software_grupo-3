import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HomeView from '@/views/HomeView.vue'
import { getPortalRecommendations } from '@/services/client-preferences.service'
import { clearClientSession, establishClientSession } from '@/services/client-session.service'
import { getPortalSection } from '@/services/movieFunctions'
import type { PortalRecommendations, RecommendedMovie } from '@/types/portal'

vi.mock('@/services/movieFunctions', () => ({ getPortalSection: vi.fn() }))
vi.mock('@/services/client-preferences.service', () => ({ getPortalRecommendations: vi.fn() }))

// SCRUM-439: "Recomendaciones para ti" (UT-046 to UT-051).
const odyssey: RecommendedMovie = {
  id: 42,
  title: 'The Odyssey',
  posterImage: 'odyssey.webp',
  synopsis: 'Ulises vuelve a casa.',
  classification: '+12',
  runningTime: 128,
  genres: ['Aventura'],
  releaseDate: null,
  presaleStart: null,
  section: 'cartelera',
  matchedGenre: 'Aventura',
}
const volcano: RecommendedMovie = {
  ...odyssey,
  id: 7,
  title: 'Ecos del Volcán',
  genres: ['Drama'],
  releaseDate: '2026-12-04',
  presaleStart: '2026-11-15',
  section: 'preventas',
  matchedGenre: 'Drama',
}
const PREFERENCES_LINK = { name: 'client-profile', query: { section: 'preferences' } }

const signIn = () =>
  establishClientSession(
    { id: 7, firstName: 'Ana', lastName: '', email: 'cliente.pruebas@cinetadel.shop' },
    'token',
  )
const answer = (value: PortalRecommendations) =>
  vi.mocked(getPortalRecommendations).mockResolvedValue(value)
const mounted: { unmount(): void }[] = []
const mountHome = async () => {
  const wrapper = mount(HomeView, {
    global: {
      stubs: {
        RouterLink: RouterLinkStub,
        MoviePoster: true,
        AppHeader: true,
        AppFooter: true,
        PortalHero: true,
      },
    },
  })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}
const section = (wrapper: Awaited<ReturnType<typeof mountHome>>) => wrapper.find('#recomendaciones')
const titles = (wrapper: Awaited<ReturnType<typeof mountHome>>) =>
  wrapper.findAll('#recomendaciones .card-title').map((title) => title.text())

describe('Portal recommendations', () => {
  beforeEach(() => {
    vi.mocked(getPortalSection).mockResolvedValue([])
  })
  afterEach(() => {
    mounted.splice(0).forEach((wrapper) => wrapper.unmount())
    clearClientSession()
    vi.clearAllMocks()
  })

  it('recommends the movies of the favorite genres first, with the reason (UT-046)', async () => {
    signIn()
    answer({ genres: ['Aventura'], languages: [], movies: [odyssey] })

    const wrapper = await mountHome()

    expect(section(wrapper).get('h2').text()).toBe('Recomendaciones para ti')
    expect(section(wrapper).text()).toContain('Según tus preferencias (Aventura) y tus compras')
    expect(titles(wrapper)).toEqual(['The Odyssey'])
    expect(section(wrapper).get('.reason').text()).toBe('Te gusta Aventura')
    expect(wrapper.find('section').attributes('id')).toBe('recomendaciones')
    const edit = section(wrapper).findAllComponents(RouterLinkStub).at(0)!
    expect(edit.text()).toBe('Editar preferencias')
    expect(edit.props('to')).toEqual(PREFERENCES_LINK)
    expect(section(wrapper).find('.see-all[aria-expanded]').exists()).toBe(false)
  })

  it('sells a recommended presale with its badge', async () => {
    signIn()
    answer({ genres: ['Drama'], languages: [], movies: [volcano] })

    const wrapper = await mountHome()

    expect(section(wrapper).get('.badge-presale').text()).toBe('Preventa')
    expect(section(wrapper).text()).toContain('Estreno el 4 dic')
    expect(section(wrapper).text()).toContain('Comprar boletos')
  })

  it('invites a client without preferences to set them in Mi perfil (UT-047)', async () => {
    signIn()
    answer({ genres: [], languages: [], movies: [] })

    const wrapper = await mountHome()

    expect(section(wrapper).get('[role="status"]').text()).toContain(
      'Configura tus preferencias en Mi perfil para recibir recomendaciones.',
    )
    const link = section(wrapper).getComponent(RouterLinkStub)
    expect(link.text()).toBe('Configurar preferencias')
    expect(link.props('to')).toEqual(PREFERENCES_LINK)
  })

  // The SCRUM-417 system also recommends by favorite language and by purchases.
  it('recommends by language or purchases without a genre tag', async () => {
    signIn()
    answer({
      genres: [],
      languages: ['Español'],
      movies: [{ ...odyssey, matchedGenre: null }],
    })

    const wrapper = await mountHome()

    expect(section(wrapper).text()).toContain('Según tus preferencias (Español) y tus compras')
    expect(titles(wrapper)).toEqual(['The Odyssey'])
    expect(section(wrapper).find('.reason').exists()).toBe(false)
  })

  it('does not ask a client with favorite languages to set preferences', async () => {
    signIn()
    answer({ genres: [], languages: ['Español'], movies: [] })

    const wrapper = await mountHome()

    expect(section(wrapper).get('[role="status"]').text()).toBe(
      'No hay recomendaciones para ti por ahora.',
    )
    expect(section(wrapper).findComponent(RouterLinkStub).exists()).toBe(false)
  })

  it('hides the section from a visitor and does not ask for it (UT-048)', async () => {
    vi.mocked(getPortalSection).mockResolvedValue([odyssey])

    const wrapper = await mountHome()

    expect(section(wrapper).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Recomendaciones para ti')
    expect(wrapper.findAll('.section-title').map((title) => title.text())).toEqual([
      'Cartelera',
      'Preventas',
      'Estrenos',
    ])
    expect(getPortalRecommendations).not.toHaveBeenCalled()
  })

  it('removes the section when the client signs out (UT-049)', async () => {
    signIn()
    answer({ genres: ['Aventura'], languages: [], movies: [odyssey] })
    const wrapper = await mountHome()
    expect(titles(wrapper)).toEqual(['The Odyssey'])

    clearClientSession()
    await flushPromises()

    expect(section(wrapper).exists()).toBe(false)
  })

  it('says there are no recommendations when nothing matches (UT-050)', async () => {
    signIn()
    answer({ genres: ['Terror'], languages: [], movies: [] })

    const wrapper = await mountHome()

    expect(section(wrapper).get('h2').text()).toBe('Recomendaciones para ti')
    expect(section(wrapper).get('[role="status"]').text()).toBe(
      'No hay recomendaciones para ti por ahora.',
    )
    expect(section(wrapper).findComponent(RouterLinkStub).exists()).toBe(false)
    expect(titles(wrapper)).toEqual([])
  })

  it('asks again on every visit, so changed preferences show up (UT-051)', async () => {
    signIn()
    answer({ genres: ['Aventura'], languages: [], movies: [odyssey] })
    const first = await mountHome()
    expect(titles(first)).toEqual(['The Odyssey'])
    mounted.pop()!.unmount()

    answer({ genres: ['Drama'], languages: [], movies: [volcano] })
    const back = await mountHome()

    expect(titles(back)).toEqual(['Ecos del Volcán'])
    expect(getPortalRecommendations).toHaveBeenCalledTimes(2)
  })

  it('shows its own error and retries only the recommendations', async () => {
    signIn()
    vi.mocked(getPortalRecommendations).mockRejectedValueOnce(new Error('offline'))
    answer({ genres: ['Aventura'], languages: [], movies: [odyssey] })
    const wrapper = await mountHome()

    expect(section(wrapper).get('[role="alert"]').text()).toContain(
      'No se pudieron cargar tus recomendaciones.',
    )
    await section(wrapper).get('.retry-button').trigger('click')
    await flushPromises()

    expect(titles(wrapper)).toEqual(['The Odyssey'])
    expect(getPortalSection).toHaveBeenCalledTimes(3)
  })

  it('ignores an answer that arrives after the client signed out', async () => {
    signIn()
    let finish!: (value: PortalRecommendations) => void
    vi.mocked(getPortalRecommendations).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const wrapper = await mountHome()

    clearClientSession()
    finish({ genres: ['Aventura'], languages: [], movies: [odyssey] })
    await flushPromises()
    signIn()
    vi.mocked(getPortalRecommendations).mockRejectedValue(new Error('offline'))
    await flushPromises()

    expect(titles(wrapper)).toEqual([])
    expect(section(wrapper).find('[role="alert"]').exists()).toBe(true)
  })
})
