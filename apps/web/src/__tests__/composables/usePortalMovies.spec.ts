import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { usePortalMovies } from '@/composables/usePortalMovies'
import { getPortalMovies } from '@/services/movieFunctions'
import {
  beginClientSessionChange,
  clearClientSession,
  clientSession,
  establishClientSession,
} from '@/services/client-session.service'
import type { PortalMovie } from '@/types/movie'

vi.mock('@/services/movieFunctions', () => ({ getPortalMovies: vi.fn() }))
vi.mock('@/facebook-auth', () => ({ fbAuth: { status: 'unknown' }, logoutFromFacebook: vi.fn() }))

describe('usePortalMovies', () => {
  let wrapper: VueWrapper | undefined
  let state: ReturnType<typeof usePortalMovies>
  const movies: PortalMovie[] = [
    { id: 6, title: 'Preferida', posterImage: '6.jpg' },
    { id: 1, title: 'General', posterImage: '1.jpg' },
  ]
  const login = (id = 7) =>
    establishClientSession(
      { id, firstName: 'Ana', lastName: '', email: 'a@example.com' },
      `token-${id}`,
    )
  function render() {
    wrapper = mount({
      setup() {
        state = usePortalMovies()
        return {}
      },
      template: '<div></div>',
    })
    return wrapper
  }
  beforeEach(() => {
    vi.resetAllMocks()
    clearClientSession()
    vi.mocked(getPortalMovies).mockResolvedValue(movies)
  })
  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    clearClientSession()
  })

  it('loads a public catalog for guests through a single shared request', async () => {
    render()
    expect(state.loading.value).toBe(true)
    await flushPromises()
    expect(getPortalMovies).toHaveBeenCalledExactlyOnceWith(false, expect.any(AbortSignal))
    expect(state.movies.value).toEqual(movies)
    expect(state.error.value).toBe('')
    expect(state.loading.value).toBe(false)
  })
  it('requests persisted personalization after login and restores the public order after logout', async () => {
    login()
    render()
    await flushPromises()
    expect(getPortalMovies).toHaveBeenLastCalledWith(true, expect.any(AbortSignal))
    clearClientSession()
    await flushPromises()
    expect(getPortalMovies).toHaveBeenLastCalledWith(false, expect.any(AbortSignal))
    login()
    await flushPromises()
    expect(getPortalMovies).toHaveBeenLastCalledWith(true, expect.any(AbortSignal))
    expect(getPortalMovies).toHaveBeenCalledTimes(3)
  })
  it('falls back to the complete general catalog after personalization fails', async () => {
    login()
    vi.mocked(getPortalMovies)
      .mockRejectedValueOnce({ isAxiosError: true, response: { status: 503 } })
      .mockResolvedValueOnce(movies)
    render()
    await flushPromises()
    expect(vi.mocked(getPortalMovies).mock.calls.map(([personalized]) => personalized)).toEqual([
      true,
      false,
    ])
    expect(state.movies.value).toEqual(movies)
    expect(state.warning.value).toContain('Error 503:')
    expect(state.warning.value).toContain('cartelera general')
    expect(state.error.value).toBe('')
    state.dismissWarning()
    expect(state.warning.value).toBe('')
  })
  it('reports public failures and supports retrying without hiding nonmatching movies', async () => {
    vi.mocked(getPortalMovies).mockRejectedValueOnce(new Error('offline'))
    render()
    await flushPromises()
    expect(state.error.value).toContain('No fue posible cargar')
    expect(state.movies.value).toEqual([])
    await state.reload()
    expect(state.movies.value).toEqual(movies)
    expect(state.error.value).toBe('')
  })
  it('reports a failed fallback without retaining old personal content', async () => {
    login()
    vi.mocked(getPortalMovies).mockRejectedValue(new Error('offline'))
    render()
    await flushPromises()
    expect(state.movies.value).toEqual([])
    expect(state.error.value).toContain('No fue posible cargar')
    expect(state.warning.value).toBe('')
  })
  it('ignores late results for an old account and aborts its request', async () => {
    let finish!: (result: PortalMovie[]) => void
    login()
    vi.mocked(getPortalMovies).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    render()
    const oldSignal = vi.mocked(getPortalMovies).mock.calls[0]![1]!
    login(8)
    await flushPromises()
    expect(oldSignal.aborted).toBe(true)
    expect(state.movies.value).toEqual(movies)
    finish([{ id: 99, title: 'Otra cuenta', posterImage: 'private.jpg' }])
    await flushPromises()
    expect(state.movies.value).toEqual(movies)
  })
  it('ignores failures belonging to a prior account without starting a fallback', async () => {
    let reject!: (error: Error) => void
    login()
    vi.mocked(getPortalMovies).mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail
        }),
    )
    render()
    login(8)
    await flushPromises()
    reject(new Error('old failure'))
    await flushPromises()
    expect(getPortalMovies).toHaveBeenCalledTimes(2)
    expect(state.warning.value).toBe('')
    expect(state.error.value).toBe('')
  })
  it('ignores a late fallback failure after a newer login', async () => {
    let reject!: (error: Error) => void
    login()
    vi.mocked(getPortalMovies)
      .mockRejectedValueOnce(new Error('personalization failed'))
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, fail) => {
            reject = fail
          }),
      )
    render()
    await flushPromises()
    login(8)
    await flushPromises()
    reject(new Error('old general failure'))
    await flushPromises()
    expect(state.error.value).toBe('')
    expect(state.movies.value).toEqual(movies)
  })
  it('aborts pending work on unmount without updating the view afterward', async () => {
    let finish!: (result: PortalMovie[]) => void
    vi.mocked(getPortalMovies).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    render()
    const signal = vi.mocked(getPortalMovies).mock.calls[0]![1]!
    wrapper!.unmount()
    wrapper = undefined
    expect(signal.aborted).toBe(true)
    finish(movies)
    await flushPromises()
    expect(state.movies.value).toEqual([])
  })
  it('does not reload an unchanged session just because its identity is restored again', async () => {
    login()
    render()
    await flushPromises()
    clientSession.user.value = { ...clientSession.user.value! }
    await flushPromises()
    expect(getPortalMovies).toHaveBeenCalledTimes(1)
  })
  it('keeps public movies when an anonymous session revision changes during loading', async () => {
    let finish!: (result: PortalMovie[]) => void
    vi.mocked(getPortalMovies).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    render()
    beginClientSessionChange()
    finish(movies)
    await flushPromises()
    expect(getPortalMovies).toHaveBeenCalledExactlyOnceWith(false, expect.any(AbortSignal))
    expect(state.movies.value).toEqual(movies)
    expect(state.error.value).toBe('')
    expect(state.loading.value).toBe(false)
  })
  it('reports a public failure even if an anonymous session reset happened during loading', async () => {
    let reject!: (error: Error) => void
    vi.mocked(getPortalMovies).mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail
        }),
    )
    render()
    clearClientSession()
    reject(new Error('offline'))
    await flushPromises()
    expect(state.error.value).toContain('No fue posible cargar')
    expect(state.loading.value).toBe(false)
  })
  it('never lets an older public response replace a newer personalized catalog', async () => {
    let finish!: (result: PortalMovie[]) => void
    vi.mocked(getPortalMovies).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    render()
    login()
    await flushPromises()
    finish([{ id: 99, title: 'Old public result', posterImage: 'old.jpg' }])
    await flushPromises()
    expect(state.movies.value).toEqual(movies)
    expect(getPortalMovies).toHaveBeenLastCalledWith(true, expect.any(AbortSignal))
  })
})
