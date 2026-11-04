import { onBeforeUnmount, readonly, ref, watch } from 'vue'
import { getPortalMovies } from '@/services/movieFunctions'
import {
  CLIENT_ACCESS_TOKEN_KEY,
  clientSession,
  clientSessionRevision,
} from '@/services/client-session.service'
import { authErrorMessage } from '@/utils/auth-errors'
import type { PortalMovie } from '@/types/movie'

export function usePortalMovies() {
  const movies = ref<PortalMovie[]>([])
  const loading = ref(true)
  const error = ref('')
  const warning = ref('')
  let generation = 0
  let controller: AbortController | undefined
  let disposed = false

  async function reload() {
    const request = ++generation
    controller?.abort()
    const abort = new AbortController()
    controller = abort
    const revision = clientSessionRevision()
    const token = localStorage.getItem(CLIENT_ACCESS_TOKEN_KEY)
    const personalized = Boolean(clientSession.user.value && token)
    const current = () =>
      !disposed &&
      request === generation &&
      (!personalized ||
        (revision === clientSessionRevision() &&
          token === localStorage.getItem(CLIENT_ACCESS_TOKEN_KEY)))
    movies.value = []
    error.value = ''
    warning.value = ''
    loading.value = true
    try {
      let result: PortalMovie[]
      try {
        result = await getPortalMovies(personalized, abort.signal)
      } catch (error_) {
        if (!current()) return
        if (!personalized) throw error_
        result = await getPortalMovies(false, abort.signal)
        if (current())
          warning.value = `${authErrorMessage(error_, 'No pudimos aplicar tus preferencias.')} Se muestra la cartelera general.`
      }
      if (current()) movies.value = result
    } catch (error_) {
      if (current())
        error.value = authErrorMessage(
          error_,
          'No fue posible cargar las películas. Intenta nuevamente.',
        )
    } finally {
      if (!disposed && request === generation) loading.value = false
    }
  }

  watch(
    () =>
      [
        clientSession.user.value?.id,
        clientSessionRevision(),
        localStorage.getItem(CLIENT_ACCESS_TOKEN_KEY),
      ].join(':'),
    () => {
      void reload()
    },
    { immediate: true },
  )
  onBeforeUnmount(() => {
    disposed = true
    controller?.abort()
  })
  return {
    movies: readonly(movies),
    loading: readonly(loading),
    error: readonly(error),
    warning: readonly(warning),
    reload,
    dismissWarning: () => {
      warning.value = ''
    },
  }
}
