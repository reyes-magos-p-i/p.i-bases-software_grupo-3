import { onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import {
  invalidateEmployeeSession,
  restoreEmployeeSession,
} from '@/services/employee-session.service'

/** Handles 401/403 answers of dashboard sections: leave on expiry, re-check permissions on denial. */
export function useEmployeeSessionRecovery() {
  const router = useRouter()
  const state = { disposed: false }
  onBeforeUnmount(() => {
    state.disposed = true
  })

  function sessionExpired() {
    invalidateEmployeeSession()
    void router.replace({ path: '/', query: { login: 'employee', reason: 'expired' } })
  }

  async function refreshPermissions() {
    try {
      const current = await restoreEmployeeSession(true)
      if (!state.disposed && !current) sessionExpired()
    } catch {
      if (!state.disposed)
        void router.replace({ path: '/', query: { login: 'employee', reason: 'unavailable' } })
    }
  }

  return { state, sessionExpired, refreshPermissions }
}
