<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import SectionNavigation from '@/components/common/SectionNavigation.vue'
import ConfirmationDialog from '@/components/common/ConfirmationDialog.vue'
import NotificationPopup from '@/components/common/NotificationPopup.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import ClientProfileForm from '@/components/clients/ClientProfileForm.vue'
import ClientEmailChangeDialog from '@/components/clients/ClientEmailChangeDialog.vue'
import ClientPreferencesForm from '@/components/clients/ClientPreferencesForm.vue'
import {
  getClientPreferenceSettings,
  saveClientPreferences,
} from '@/services/client-preferences.service'
import type {
  ClientPreferenceSelection,
  ClientPreferenceSettings,
} from '@/types/client-preferences'
import ChangePasswordView from './ChangePasswordView.vue'
import avatar from '@/assets/profile/profile-circle-svgrepo-com.svg'
import {
  clientProfileError,
  deactivateClientProfile,
  getClientAddressOptions,
  getClientProfile,
  requestClientEmailChange,
  updateClientProfile,
} from '@/services/client-profile.service'
import {
  CLIENT_ACCESS_TOKEN_KEY,
  clearClientAuth,
  clearClientSession,
  clientSessionRevision,
  establishClientSession,
} from '@/services/client-session.service'
import { authErrorStatus } from '@/utils/auth-errors'
import type {
  ClientAddressOptions,
  ClientProfile,
  ClientProfileUpdate,
} from '@/types/client-profile'

const router = useRouter()
const sections = [
  { id: 'personal', label: 'Mis datos', icon: 'bi-person' },
  { id: 'security', label: 'Seguridad', icon: 'bi-shield-lock' },
  { id: 'preferences', label: 'Preferencias', icon: 'bi-sliders' },
  { id: 'deactivation', label: 'Desactivar cuenta', icon: 'bi-person-dash' },
]
const preferenceSettings = ref<ClientPreferenceSettings | null>(null)
const preferencesLoading = ref(false)
const preferencesError = ref('')
const preferencesFormKey = ref(0)
let preferencesGeneration = 0
let preferencesAbort: AbortController | undefined
const selected = ref('personal')
const profile = ref<ClientProfile | null>(null)
const options = ref<ClientAddressOptions | null>(null)
const loading = ref(true)
const loadError = ref('')
const editing = ref(false)
const dirty = ref(false)
const busy = ref(false)
const emailOpen = ref(false)
const emailError = ref('')
const deactivating = ref(false)
const deactivated = ref(false)
const discarding = ref(false)
const notification = ref<{ type: 'success' | 'error'; message: string } | null>(null)
const fullName = computed(() =>
  profile.value
    ? [
        profile.value.firstName,
        profile.value.secondName,
        profile.value.firstSurname,
        profile.value.secondSurname,
      ]
        .filter(Boolean)
        .join(' ')
    : '',
)
const genderLabels: Record<string, string> = {
  M: 'Masculino',
  F: 'Femenino',
  O: 'Otro',
  N: 'Prefiero no decirlo',
}
let disposed = false
let discardAction: (() => void) | undefined
let leaveResolve: ((allow: boolean) => void) | undefined
const abort = new AbortController()

function sessionSnapshot() {
  const revision = clientSessionRevision()
  const token = localStorage.getItem(CLIENT_ACCESS_TOKEN_KEY)
  return {
    token,
    current: () =>
      !disposed &&
      revision === clientSessionRevision() &&
      token === localStorage.getItem(CLIENT_ACCESS_TOKEN_KEY),
  }
}
function dateLabel(value: string | null, timestamp = false) {
  if (!value) return 'Sin registrar'
  const date = new Date(timestamp ? value : `${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? 'Sin registrar' : date.toLocaleDateString('es-CR')
}
function notify(type: 'success' | 'error', message: string) {
  notification.value = { type, message }
}
async function handleError(error: unknown, fallback: string, options: { notify?: boolean } = {}) {
  if (options.notify !== false) notify('error', clientProfileError(error, fallback))
  if (authErrorStatus(error) === 401) {
    dirty.value = false
    busy.value = false
    emailOpen.value = false
    deactivating.value = false
    profile.value = null
    clearClientSession()
    await router.replace({ path: '/', query: { login: 'client', reason: 'expired' } })
  }
}
async function load() {
  const session = sessionSnapshot()
  loading.value = true
  loadError.value = ''
  try {
    const result = await getClientProfile(abort.signal)
    if (!session.current()) return
    profile.value = result
    if (session.token)
      establishClientSession(
        {
          id: result.id,
          email: result.email,
          firstName: result.firstName,
          lastName: result.firstSurname ?? '',
        },
        session.token,
      )
  } catch (error) {
    if (!session.current()) return
    loadError.value = clientProfileError(
      error,
      'No se pudieron cargar tus datos. Intenta nuevamente.',
    )
    if (authErrorStatus(error) === 401) await handleError(error, loadError.value)
  } finally {
    if (!disposed) loading.value = false
  }
}
async function startEditing() {
  if (busy.value) return
  const session = sessionSnapshot()
  busy.value = true
  try {
    options.value = await getClientAddressOptions(abort.signal)
    if (session.current()) editing.value = true
  } catch (error) {
    if (session.current())
      await handleError(
        error,
        'No se pudieron cargar las opciones de dirección. Intenta nuevamente.',
      )
  } finally {
    if (!disposed) busy.value = false
  }
}
function requestDiscard(action: () => void) {
  if (busy.value) return
  if (!dirty.value) {
    action()
    return
  }
  discardAction = action
  discarding.value = true
}
function resolveDiscard(allow: boolean) {
  discarding.value = false
  if (allow) {
    dirty.value = false
    discardAction?.()
  }
  discardAction = undefined
  leaveResolve?.(allow)
  leaveResolve = undefined
}
function changeSection(section: string) {
  requestDiscard(() => {
    editing.value = false
    selected.value = section
    if (section === 'preferences') void loadPreferences()
    else {
      preferencesAbort?.abort()
      preferencesGeneration++
      preferencesLoading.value = false
    }
  })
}

async function loadPreferences() {
  const session = sessionSnapshot()
  const request = ++preferencesGeneration
  preferencesAbort?.abort()
  const controller = new AbortController()
  preferencesAbort = controller
  preferencesLoading.value = true
  preferencesError.value = ''
  const current = () =>
    session.current() && request === preferencesGeneration && selected.value === 'preferences'
  try {
    const settings = await getClientPreferenceSettings(controller.signal)
    if (!current()) return
    preferenceSettings.value = settings
    preferencesFormKey.value++
  } catch (error) {
    if (!current()) return
    preferencesError.value = clientProfileError(
      error,
      'No se pudieron cargar tus preferencias. Intenta nuevamente.',
    )
    if (authErrorStatus(error) === 401) await handleError(error, preferencesError.value)
  } finally {
    if (!disposed && request === preferencesGeneration) preferencesLoading.value = false
  }
}
async function savePreferences(selection: ClientPreferenceSelection) {
  if (busy.value) return
  const session = sessionSnapshot()
  busy.value = true
  try {
    await saveClientPreferences(selection)
    if (!session.current()) return
    dirty.value = false
    notify(
      'success',
      'Tus preferencias se guardaron correctamente. El portal mostrará primero las películas que coincidan con ellas.',
    )
    await loadPreferences()
  } catch (error) {
    if (session.current())
      await handleError(error, 'No se pudieron guardar tus preferencias. Intenta nuevamente.')
  } finally {
    if (!disposed) busy.value = false
  }
}
function cancelPreferences() {
  requestDiscard(() => {
    dirty.value = false
    preferencesFormKey.value++
  })
}
async function save(changes: ClientProfileUpdate) {
  if (busy.value) return
  const session = sessionSnapshot()
  busy.value = true
  try {
    await updateClientProfile(changes)
    if (!session.current()) return
    dirty.value = false
    editing.value = false
    notify('success', 'Tus datos se actualizaron correctamente.')
    await load()
  } catch (error) {
    if (session.current())
      await handleError(error, 'No se pudieron guardar tus datos. Intenta nuevamente.')
  } finally {
    if (!disposed) busy.value = false
  }
}
function openEmailDialog() {
  emailError.value = ''
  emailOpen.value = true
}
async function sendEmail(email: string) {
  if (busy.value) return
  const session = sessionSnapshot()
  busy.value = true
  emailError.value = ''
  try {
    await requestClientEmailChange(email)
    if (!session.current()) return
    emailOpen.value = false
    notify(
      'success',
      'Enviamos un enlace al nuevo correo. Confírmalo en los próximos 30 minutos. Tu correo actual todavía no ha cambiado.',
    )
  } catch (error) {
    if (!session.current()) return
    emailError.value = clientProfileError(
      error,
      'No se pudo enviar la confirmación. Tu correo actual se mantiene. Intenta nuevamente.',
    )
    await handleError(error, emailError.value, { notify: false })
  } finally {
    if (!disposed) busy.value = false
  }
}
async function deactivate() {
  if (busy.value) return
  const session = sessionSnapshot()
  busy.value = true
  try {
    await deactivateClientProfile()
    if (!session.current()) return
    deactivating.value = false
    deactivated.value = true
    dirty.value = false
    // Local logout must succeed even when the provider SDK is unavailable.
    await clearClientAuth().catch(() => undefined)
    notify('success', 'Tu cuenta fue desactivada y se cerraron tus sesiones.')
  } catch (error) {
    if (session.current())
      await handleError(error, 'No se pudo desactivar tu cuenta. Intenta nuevamente.')
  } finally {
    if (!disposed) busy.value = false
  }
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value || busy.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onBeforeRouteLeave(() => {
  if (busy.value) return false
  if (!dirty.value) return true
  discarding.value = true
  return new Promise<boolean>((resolve) => {
    leaveResolve = resolve
  })
})
onMounted(() => {
  void load()
  window.addEventListener('beforeunload', beforeUnload)
})
onBeforeUnmount(() => {
  disposed = true
  abort.abort()
  preferencesAbort?.abort()
  window.removeEventListener('beforeunload', beforeUnload)
  leaveResolve?.(false)
})
</script>

<template>
  <AppHeader />
  <main class="profile-page">
    <header class="page-heading">
      <p>MI CUENTA</p>
      <h1>Mi perfil</h1>
      <p>Consulta y administra tus datos personales y la seguridad de tu cuenta.</p>
    </header>
    <NotificationPopup
      v-if="notification"
      :type="notification.type"
      :message="notification.message"
      placement="bottom-right"
      @close="notification = null"
    />
    <section v-if="deactivated" class="profile-card completed">
      <h2>Cuenta desactivada</h2>
      <p>
        Tu cuenta ya no está disponible para iniciar sesión. Si necesitas reactivarla, contacta con
        asistencia.
      </p>
      <RouterLink to="/">Volver al portal</RouterLink>
    </section>
    <LoadingState v-else-if="loading" message="Cargando perfil..." surface="dark" />
    <section v-else-if="loadError" class="profile-card">
      <p role="alert">{{ loadError }}</p>
      <button type="button" @click="load">Reintentar</button>
    </section>
    <div v-else-if="profile" class="profile-layout">
      <aside>
        <div class="profile-identity">
          <img :src="avatar" alt="Avatar predeterminado" /><strong>{{ fullName }}</strong
          ><span>{{ profile.email }}</span>
        </div>
        <SectionNavigation
          :items="sections"
          :selected="selected"
          :disabled="busy"
          label="Secciones de mi perfil"
          @select="changeSection"
        />
      </aside>
      <section class="profile-card" :aria-busy="busy">
        <template v-if="selected === 'personal'">
          <ClientProfileForm
            v-if="editing && options"
            :profile="profile"
            :options="options"
            :pending="busy"
            @save="save"
            @dirty="dirty = $event"
            @cancel="
              requestDiscard(() => {
                editing = false
              })
            "
          />
          <template v-else>
            <div class="section-heading">
              <div>
                <h2>Mis datos</h2>
                <p>La información registrada en tu cuenta.</p>
              </div>
              <button type="button" class="primary" :disabled="busy" @click="startEditing">
                {{ busy ? 'Preparando…' : 'Editar datos' }}
              </button>
            </div>
            <dl class="personal-data">
              <div
                v-for="field in [
                  { key: 'firstName', label: 'Primer nombre' },
                  { key: 'secondName', label: 'Segundo nombre' },
                  { key: 'firstSurname', label: 'Primer apellido' },
                  { key: 'secondSurname', label: 'Segundo apellido' },
                ] as const"
                :key="field.key"
              >
                <dt>{{ field.label }}</dt>
                <dd>{{ profile[field.key] || 'Sin registrar' }}</dd>
              </div>
              <div>
                <dt>Correo electrónico</dt>
                <dd>{{ profile.email }}</dd>
              </div>
              <div>
                <dt>Celular</dt>
                <dd>{{ profile.phoneNumber || 'Sin registrar' }}</dd>
              </div>
              <div>
                <dt>Fecha de nacimiento</dt>
                <dd>{{ dateLabel(profile.birthday) }}</dd>
              </div>
              <div>
                <dt>Género</dt>
                <dd>{{ genderLabels[profile.gender || ''] || 'Sin especificar' }}</dd>
              </div>
              <div>
                <dt>Fecha de registro</dt>
                <dd>{{ dateLabel(profile.createdAt, true) }}</dd>
              </div>
              <div>
                <dt>Estado</dt>
                <dd>Activo</dd>
              </div>
              <div class="address-data">
                <dt>Dirección</dt>
                <dd v-if="profile.address">
                  {{
                    [
                      profile.address.provinceName,
                      profile.address.cantonName,
                      profile.address.districtName,
                      profile.address.details,
                    ]
                      .filter(Boolean)
                      .join(', ')
                  }}
                </dd>
                <dd v-else>Sin registrar</dd>
              </div>
            </dl>
          </template>
        </template>
        <template v-else-if="selected === 'security'">
          <h2>Seguridad</h2>
          <p>Controla cómo accedes a tu cuenta.</p>
          <div class="email-security">
            <div>
              <h3>Correo electrónico</h3>
              <p>{{ profile.email }}</p>
            </div>
            <button type="button" :disabled="busy" @click="openEmailDialog">Cambiar correo</button>
          </div>
          <ChangePasswordView
            embedded
            account-type="client"
            @submission-state="busy = $event"
            @return-to-profile="changeSection('personal')"
          />
        </template>
        <template v-else-if="selected === 'preferences'"
          ><h2 v-if="!preferenceSettings || preferencesLoading || preferencesError">
            Preferencias
          </h2>
          <dl>
            <dt>Idioma registrado</dt>
            <dd>
              {{
                profile.language === 'es'
                  ? 'Español'
                  : profile.language === 'en'
                    ? 'Inglés'
                    : profile.language
              }}
            </dd>
          </dl>
          <LoadingState v-if="preferencesLoading" message="Cargando preferencias..." />
          <div v-else-if="preferencesError" role="alert">
            <p>{{ preferencesError }}</p>
            <button type="button" @click="loadPreferences">Reintentar</button>
          </div>
          <ClientPreferencesForm
            v-else-if="preferenceSettings"
            :key="preferencesFormKey"
            :settings="preferenceSettings"
            :pending="busy"
            @save="savePreferences"
            @dirty="dirty = $event"
            @cancel="cancelPreferences"
          />
        </template>
        <template v-else
          ><h2>Desactivar cuenta</h2>
          <p>
            Al desactivar tu cuenta se cerrarán tus sesiones y no podrás iniciar sesión ni usar las
            funciones de tu cuenta. Tus registros se conservarán.
          </p>
          <p>Para volver a usarla, deberás solicitar la reactivación a asistencia.</p>
          <button type="button" class="danger" :disabled="busy" @click="deactivating = true">
            Desactivar mi cuenta
          </button></template
        >
      </section>
    </div>
    <ClientEmailChangeDialog
      v-if="profile"
      :open="emailOpen"
      :current-email="profile.email"
      :pending="busy"
      :error="emailError"
      @request="sendEmail"
      @close="emailOpen = false"
    />
    <ConfirmationDialog
      :open="deactivating"
      title="¿Desactivar tu cuenta?"
      message="Se cerrarán todas tus sesiones y perderás el acceso a tu cuenta. Tus datos se conservarán. Para reactivarla necesitarás contactar con asistencia. ¿Deseas continuar?"
      confirm-label="Desactivar cuenta"
      danger
      :pending="busy"
      @cancel="deactivating = false"
      @confirm="deactivate"
    />
    <ConfirmationDialog
      :open="discarding"
      title="Cambios sin guardar"
      message="Tienes cambios sin guardar. Si continúas, se descartarán. ¿Deseas salir de la edición?"
      confirm-label="Descartar cambios"
      @cancel="resolveDiscard(false)"
      @confirm="resolveDiscard(true)"
    />
  </main>
  <AppFooter />
</template>

<style scoped>
.profile-page {
  max-width: 1240px;
  margin: 0 auto;
  padding: 2rem 1.5rem 4rem;
  min-height: 70vh;
}
.page-heading {
  color: var(--text-on-dark);
  margin-bottom: 2rem;
}
.page-heading > p:first-child {
  color: var(--accent-color);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.12em;
}
.page-heading h1 {
  font-weight: 750;
}
.page-heading > p:last-child {
  color: var(--text-on-dark-secondary);
}
.profile-layout {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 1.5rem;
  align-items: start;
}
.profile-identity {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.65rem;
  padding: 1.5rem 1rem;
  margin-bottom: 0.75rem;
  border-radius: var(--radius-medium);
  background: var(--surface-background);
  color: var(--text-on-dark);
  text-align: center;
  overflow-wrap: anywhere;
}
.profile-identity img {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: var(--primary-color);
  border: 2px solid var(--accent-color);
}
.profile-identity span {
  font-size: 0.85rem;
  color: var(--text-on-dark-secondary);
}
.profile-card {
  min-width: 0;
  border-radius: var(--radius-medium);
  padding: clamp(1.25rem, 3vw, 2rem);
  background: var(--content-background);
  color: var(--text-primary);
  box-shadow: 0 8px 24px var(--shadow-color);
}
h2 {
  font-size: 1.5rem;
  font-weight: 700;
}
h3 {
  font-size: 1.1rem;
  font-weight: 650;
}
p {
  line-height: 1.6;
}
.profile-card p {
  color: var(--text-secondary);
}
.section-heading,
.email-security {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.email-security {
  border-block: 1px solid var(--border-color);
  padding-block: 1.5rem;
  margin-top: 1.5rem;
}
.email-security p {
  margin: 0;
  overflow-wrap: anywhere;
}
.personal-data {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.5rem;
  margin: 0;
}
dt {
  color: var(--text-secondary);
  font-size: 0.85rem;
  font-weight: 500;
  margin-bottom: 0.4rem;
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.address-data {
  grid-column: 1 / -1;
}
button,
.completed a {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  min-height: 44px;
  padding: 0.65rem 1rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-small);
  background: var(--button-secondary-background);
  color: var(--button-secondary-text);
  font-weight: 600;
  text-decoration: none;
}
.primary,
.completed a {
  background: var(--button-background);
  color: var(--button-text);
  border-color: transparent;
}
.danger {
  background: var(--error-color);
  color: var(--text-on-dark);
  border-color: transparent;
}

:disabled {
  opacity: 0.65;
}
button:focus-visible,
a:focus-visible {
  outline: 2px solid var(--focus-color);
  outline-offset: 2px;
}
@media (max-width: 760px) {
  .profile-layout {
    grid-template-columns: 1fr;
  }
  .profile-identity {
    display: none;
  }
}
@media (max-width: 480px) {
  .profile-page {
    padding-inline: 1rem;
  }
  .personal-data {
    grid-template-columns: 1fr;
  }
}
</style>
