import { onBeforeUnmount, readonly, ref } from 'vue'
import { getPortalSection } from '@/services/movieFunctions'
import type { PortalSection, PortalSectionMovie } from '@/types/portal'

// SCRUM-437: each section loads on its own, so a failing one doesn't hide the others.
export function usePortalSection(section: PortalSection) {
  const movies = ref<PortalSectionMovie[]>([])
  const loading = ref(true)
  const failed = ref(false)
  let controller: AbortController | undefined

  async function reload() {
    controller?.abort()
    const request = new AbortController()
    controller = request
    loading.value = true
    failed.value = false
    try {
      const result = await getPortalSection(section, request.signal)
      if (!request.signal.aborted) movies.value = result
    } catch {
      if (request.signal.aborted) return
      movies.value = []
      failed.value = true
    } finally {
      if (controller === request) loading.value = false
    }
  }

  onBeforeUnmount(() => controller?.abort())
  void reload()

  return {
    movies: readonly(movies),
    loading: readonly(loading),
    failed: readonly(failed),
    reload,
  }
}
