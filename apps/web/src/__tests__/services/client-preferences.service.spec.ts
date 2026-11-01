import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getClientPreferenceSettings,
  saveClientPreferences,
} from '@/services/client-preferences.service'

const { get, put } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }))
vi.mock('@/services/api', () => ({ getApi: () => ({ get, put }) }))
vi.mock('@/services/authService', () => ({
  clientRequestOptions: () => ({
    headers: { Authorization: 'Bearer client-token' },
    adapter: 'fetch',
    withCredentials: false,
    timeout: 10000,
  }),
}))

describe('Client preference API', () => {
  const options = {
    headers: { Authorization: 'Bearer client-token' },
    adapter: 'fetch',
    withCredentials: false,
    timeout: 10000,
  }
  beforeEach(() => vi.resetAllMocks())
  it('fetches current catalogs and selections with the existing client transport', async () => {
    const data = {
      genres: [],
      languages: [],
      selected: { genreIds: [], languageIds: [] },
      maxSelections: 1000,
    }
    get.mockResolvedValue({ data })
    const signal = new AbortController().signal
    await expect(getClientPreferenceSettings(signal)).resolves.toEqual(data)
    expect(get).toHaveBeenCalledExactlyOnceWith('/clients/me/preferences', { ...options, signal })
  })
  it('replaces both selections including empty collections without accepting an account ID', async () => {
    const selected = { genreIds: [1, 2], languageIds: [] }
    put.mockResolvedValue({ data: selected })
    await expect(saveClientPreferences(selected)).resolves.toEqual(selected)
    expect(put).toHaveBeenCalledExactlyOnceWith('/clients/me/preferences', selected, options)
  })
  it('propagates HTTP errors for the shared profile feedback handler', async () => {
    put.mockRejectedValue(new Error('offline'))
    await expect(saveClientPreferences({ genreIds: [], languageIds: [] })).rejects.toThrow(
      'offline',
    )
  })
})
