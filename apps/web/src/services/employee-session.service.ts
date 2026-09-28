import { readonly, ref, shallowRef } from 'vue'
import { EmployeeAuthError, getEmployeeSession, loginEmployee, logoutEmployee } from './authService'
import type {
  EmployeeIdentity,
  EmployeeLoginRequest,
  EmployeeSessionStatus,
} from '@/types/employee-auth'

const user = shallowRef<EmployeeIdentity | null>(null)
const status = ref<EmployeeSessionStatus>('unknown')
const error = ref('')
let revision = 0
let restoration: Promise<EmployeeIdentity | null> | undefined
let mutation: Promise<EmployeeIdentity | null> | undefined

export const employeeSession = {
  user: readonly(user),
  status: readonly(status),
  error: readonly(error),
}

function setIdentity(identity: EmployeeIdentity | null) {
  user.value = identity
  status.value = identity ? 'authenticated' : 'anonymous'
  error.value = ''
}

export function invalidateEmployeeSession() {
  revision++
  restoration = undefined
  setIdentity(null)
}

export function restoreEmployeeSession(force = false): Promise<EmployeeIdentity | null> {
  if (mutation) return mutation
  if (restoration) return restoration
  if (!force && (status.value === 'authenticated' || status.value === 'anonymous')) {
    return Promise.resolve(user.value)
  }
  const current = revision
  status.value = 'loading'
  const pending = getEmployeeSession()
    .then((identity) => {
      if (current !== revision) return mutation ?? user.value
      setIdentity(identity)
      return identity
    })
    .catch((failure: unknown) => {
      if (current !== revision) return mutation ?? user.value
      user.value = null
      status.value = 'error'
      error.value = failure instanceof Error ? failure.message : 'No se pudo recuperar la sesión.'
      throw failure
    })
    .finally(() => {
      if (restoration === pending) restoration = undefined
    })
  restoration = pending
  return pending
}

function changeSession(work: () => Promise<EmployeeIdentity | null>, preserveOnFailure: boolean) {
  if (mutation)
    return Promise.reject(new EmployeeAuthError('Espera a que termine la solicitud actual.'))
  const current = ++revision
  restoration = undefined
  const previous = user.value
  status.value = 'loading'
  error.value = ''
  const pending = work()
    .then((identity) => {
      if (current !== revision) return user.value
      setIdentity(identity)
      return identity
    })
    .catch((failure: unknown) => {
      if (current === revision) {
        setIdentity(preserveOnFailure ? previous : null)
        error.value =
          failure instanceof Error ? failure.message : 'No se pudo completar la solicitud.'
      }
      throw failure
    })
    .finally(() => {
      if (mutation === pending) mutation = undefined
    })
  mutation = pending
  return pending
}

export function authenticateEmployee(credentials: EmployeeLoginRequest) {
  return changeSession(() => loginEmployee(credentials), false)
}

export function closeEmployeeSession() {
  return changeSession(async () => {
    await logoutEmployee()
    return null
  }, true)
}
