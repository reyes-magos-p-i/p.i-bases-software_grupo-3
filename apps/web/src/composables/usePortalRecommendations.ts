import { computed, onBeforeUnmount, readonly, ref, shallowRef, watch } from 'vue'
import { getPortalRecommendations } from '@/services/client-preferences.service'
import { clientSession } from '@/services/client-session.service'
import type { RecommendedMovie } from '@/types/portal'

// SCRUM-439: only a signed-in client asks for recommendations. They load again on every visit to
// the portal and when the session changes, so new preferences show up without reloading the page.
export function usePortalRecommendations() {
  const genres = shallowRef<readonly string[]>([])
  const languages = shallowRef<readonly string[]>([])
  const movies = shallowRef<readonly RecommendedMovie[]>([])
  const loading = ref(false)
  const failed = ref(false)
  const enabled = computed(() => clientSession.user.value !== null)
  let controller: AbortController | undefined

  function clear() {
    controller?.abort()
    controller = undefined
    genres.value = []
    languages.value = []
    movies.value = []
    loading.value = false
    failed.value = false
  }

  async function reload() {
    controller?.abort()
    const request = new AbortController()
    controller = request
    loading.value = true
    failed.value = false
    try {
      const result = await getPortalRecommendations(request.signal)
      if (request.signal.aborted) return
      genres.value = result.genres
      languages.value = result.languages
      movies.value = result.movies
    } catch {
      if (request.signal.aborted) return
      genres.value = []
      languages.value = []
      movies.value = []
      failed.value = true
    } finally {
      if (controller === request) loading.value = false
    }
  }

  watch(
    () => clientSession.user.value?.id,
    (id) => (id === undefined ? clear() : void reload()),
    { immediate: true },
  )
  onBeforeUnmount(() => controller?.abort())

  return {
    enabled,
    genres,
    languages,
    movies,
    loading: readonly(loading),
    failed: readonly(failed),
    reload,
  }
}
