<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { isAxiosError } from 'axios'
import CreateUserDialog from '@/components/users/CreateUserDialog.vue'
import TheatersSection from '@/components/theaters/TheatersSection.vue'
import DashboardLayout from '@/components/layout/DashboardLayout.vue'
import type { UserCreationOptions, CreateUserRequest, UserApiError } from '@/types/user'
import type { UserDetailSelection } from '@/types/user'
import { createUser, getUserCreationOptions } from '@/services/user.service'
import {
  closeEmployeeSession,
  employeeSession,
  invalidateEmployeeSession,
  restoreEmployeeSession,
} from '@/services/employee-session.service'
import { clearClientAuth } from '@/services/client-session.service'

const router = useRouter()
const identity = employeeSession.user
const role = computed(() => identity.value?.role ?? 'EMPLOYEE')
const activeSection = ref<'employees' | 'clients' | 'theaters'>(
  role.value === 'ADMINISTRATOR' ? 'employees' : 'clients',
)
const loggingOut = ref(false)
const logoutError = ref('')
const userDialog = useTemplateRef<InstanceType<typeof CreateUserDialog>>('user-dialog')
const userList = useTemplateRef<InstanceType<typeof UserListPanel>>('user-list')
const catalogs = ref<UserCreationOptions | null>(null)
const catalogsLoading = ref(false)
const catalogsError = ref('')
let catalogRequest: AbortController | undefined
const submitting = ref(false)
const theaterBusy = ref(false)
const submissionErrors = ref<string[]>([])
const submissionBlocked = ref(false)
const creationResult = ref('')
const resultIsWarning = ref(false)
const resultNotice = useTemplateRef<HTMLElement>('result-notice')
let disposed = false

function sessionExpired() {
  invalidateEmployeeSession()
  void router.replace({ path: '/', query: { login: 'employee', reason: 'expired' } })
}

async function refreshPermissions() {
  try {
    const current = await restoreEmployeeSession(true)
    if (!disposed && !current) sessionExpired()
  } catch {
    if (!disposed)
      void router.replace({ path: '/', query: { login: 'employee', reason: 'unavailable' } })
  }
}

function userUpdated(selection: UserDetailSelection) {
  if (selection.section === 'employees' && selection.id === identity.value?.id) {
    void refreshPermissions()
  }
}

async function logout() {
  if (submitting.value || loggingOut.value) return
  loggingOut.value = true
  logoutError.value = ''
  try {
    await closeEmployeeSession()
    await clearClientAuth()
    if (!disposed) await router.replace('/')
  } catch {
    if (!disposed)
      logoutError.value = 'No se pudo confirmar el cierre de sesión. Vuelve a intentarlo.'
  } finally {
    if (!disposed) loggingOut.value = false
  }
}

async function submitUser(data: CreateUserRequest) {
  if (
    submitting.value ||
    loggingOut.value ||
    submissionBlocked.value ||
    role.value !== 'ADMINISTRATOR'
  )
    return
  if ((activeSection.value === 'clients') !== (data.role === 'CLIENT')) return
  const submittingDialog = userDialog.value
  submitting.value = true
  submissionErrors.value = []
  creationResult.value = ''
  let completed = false
  try {
    const user = await createUser(data)
    if (disposed) return
    creationResult.value = `Cuenta creada para ${user.email}. El servidor de correo aceptó el envío de sus credenciales.`
    resultIsWarning.value = false
    completed = true
  } catch (error) {
    if (disposed) return
    const status = isAxiosError<UserApiError>(error) ? error.response?.status : undefined
    if (
      status === 502 &&
      isAxiosError<UserApiError>(error) &&
      error.response?.data?.statusCode === 502 &&
      error.response.data.message ===
        'El usuario fue creado, pero no se pudo enviar el correo con sus credenciales.'
    ) {
      creationResult.value = `La cuenta de ${data.email} fue creada, pero no se pudo confirmar el envío del correo. No repitas la creación.`
      resultIsWarning.value = true
      completed = true
    } else if (status === 401) {
      sessionExpired()
    } else if (status === 400) {
      const message: unknown = isAxiosError<UserApiError>(error)
        ? error.response?.data?.message
        : undefined
      const messages = Array.isArray(message)
        ? message.filter((item): item is string => typeof item === 'string' && !!item.trim())
        : typeof message === 'string' && message.trim()
          ? [message]
          : []
      submissionErrors.value = messages.length
        ? messages
        : ['Revisa los datos del formulario e inténtalo nuevamente.']
    } else if (status === 403) {
      submissionErrors.value = [
        'No tienes permiso para crear usuarios. Comprueba los permisos antes de volver a enviar.',
      ]
      void refreshPermissions()
    } else if (status === 409) {
      submissionErrors.value = [
        'Ya existe una cuenta con ese correo. Revisa el correo introducido.',
      ]
    } else {
      submissionBlocked.value = true
      submissionErrors.value = [
        'No se pudo confirmar si la cuenta fue creada. Comprueba el resultado antes de intentar otra creación; repetirla podría duplicar la cuenta.',
      ]
    }
  } finally {
    if (!disposed) {
      submitting.value = false
      if (completed) {
        submittingDialog?.complete()
        userList.value?.refresh()
        await nextTick()
        resultNotice.value?.focus()
      }
    }
  }
}

function cancelCatalogRequest() {
  catalogRequest?.abort()
  catalogRequest = undefined
  catalogsLoading.value = false
}

async function loadCatalogs() {
  if (catalogsLoading.value || catalogs.value) return
  const request = new AbortController()
  catalogRequest = request
  catalogsLoading.value = true
  catalogsError.value = ''
  try {
    const options = await getUserCreationOptions(request.signal)
    if (!request.signal.aborted) catalogs.value = options
  } catch (error) {
    if (request.signal.aborted) return
    if (isAxiosError(error) && error.response?.status === 401) {
      sessionExpired()
    } else if (isAxiosError(error) && error.response?.status === 403) {
      catalogsError.value = 'No tienes permiso para cargar las opciones del formulario.'
      void refreshPermissions()
    } else if (
      isAxiosError(error) &&
      (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT')
    ) {
      catalogsError.value = 'La carga está tardando demasiado. Puedes volver a intentarlo.'
    } else {
      catalogsError.value =
        'No se pudieron cargar las opciones. Comprueba la conexión y vuelve a intentarlo.'
    }
  } finally {
    if (catalogRequest === request) {
      catalogsLoading.value = false
      catalogRequest = undefined
    }
  }
}

function openUserDialog() {
  if (loggingOut.value || role.value !== 'ADMINISTRATOR' || activeSection.value === 'theaters') return
  userDialog.value?.open()
  void loadCatalogs()
}

watch([role, activeSection], () => {
  cancelCatalogRequest()
  catalogs.value = null
  catalogsError.value = ''
  if (!submissionBlocked.value) submissionErrors.value = []
  creationResult.value = ''
})
onBeforeUnmount(() => {
  disposed = true
  cancelCatalogRequest()
})
const availableSections = computed(() =>
  role.value === 'ADMINISTRATOR' ? ['employees', 'clients', 'theaters'] : ['clients'],
)
const sectionTitle = computed(() =>
  activeSection.value === 'employees'
    ? 'Empleados'
    : activeSection.value === 'theaters'
      ? 'Salas'
      : 'Clientes',
)

watch(role, () => {
  if (
    role.value === 'EMPLOYEE' &&
    (activeSection.value === 'employees' || activeSection.value === 'theaters')
  ) {
    activeSection.value = 'clients'
  }
})

function navigate(section: string) {
  if (submitting.value || loggingOut.value) return
  if (
    (section === 'employees' || section === 'clients' || section === 'theaters') &&
    availableSections.value.includes(section)
  ) {
    activeSection.value = section
  }
}
</script>

<template>
  <DashboardLayout
    v-if="identity"
    :role="role"
    :user-name="identity.firstName"
    :active-section="activeSection"
    :available-sections="availableSections"
    :can-logout="!submitting && !theaterBusy && !loggingOut"
    @navigate="navigate"
    @logout="logout"
  >
    <p v-if="loggingOut" role="status">Cerrando sesión…</p>
    <p v-if="logoutError" role="alert">{{ logoutError }}</p>

    <p
      v-if="creationResult && activeSection !== 'theaters'"
      ref="result-notice"
      class="creation-result"
      :role="resultIsWarning ? 'alert' : 'status'"
      tabindex="-1"
    >
      {{ creationResult }}
    </p>

    <TheatersSection
      v-if="activeSection === 'theaters'"
      :disabled="loggingOut"
      @busy="theaterBusy = $event"
    />
    <section v-else class="preview-content" aria-live="polite" aria-atomic="true">
      <div class="section-heading">
        <h1>{{ sectionTitle }}</h1>
        <button
          v-if="role === 'ADMINISTRATOR'"
          type="button"
          class="add-user-button"
          :disabled="loggingOut"
          aria-haspopup="dialog"
          @click="openUserDialog"
        >
          <i class="bi bi-plus-lg" aria-hidden="true"></i>
          {{ activeSection === 'clients' ? 'Añadir cliente' : 'Añadir empleado' }}
        </button>
      </div>
      <UserListPanel
        :key="activeSection"
        ref="user-list"
        :section="activeSection"
        :role="role"
        :current-user-id="identity?.id"
        @session-expired="sessionExpired"
        @forbidden="refreshPermissions"
        @user-updated="userUpdated"
      />
    </section>
    <CreateUserDialog
      v-if="role === 'ADMINISTRATOR'"
      :key="activeSection"
      ref="user-dialog"
      :mode="activeSection === 'clients' ? 'client' : 'employee'"
      :provinces="catalogs?.provinces"
      :cantons="catalogs?.cantons"
      :districts="catalogs?.districts"
      :branches="catalogs?.branches"
      :catalogs-loading="catalogsLoading"
      :catalogs-error="catalogsError"
      :submitting="submitting"
      :submission-errors="submissionErrors"
      :submission-blocked="submissionBlocked"
      @retry-catalogs="loadCatalogs"
      @submit="submitUser"
    />
  </DashboardLayout>
  <p v-else class="session-unavailable" role="alert">
    No hay una sesión verificada.
    <RouterLink to="/?login=employee">Volver al inicio de sesión</RouterLink>
  </p>
</template>

