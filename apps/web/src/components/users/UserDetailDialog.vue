<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { isAxiosError } from 'axios'
import BaseModal from '@/components/common/BaseModal.vue'
import { getUserDetail } from '@/services/user.service'
import type { UserDetail, UserDetailSelection } from '@/types/user'

const props = defineProps<{ selection: UserDetailSelection | null }>()
const emit = defineEmits<{ close: []; 'session-expired': []; forbidden: [] }>()
const user = ref<UserDetail | null>(null)
const loading = ref(false)
const error = ref('')
const retryable = ref(false)
let request: AbortController | undefined

const roleNames = { CLIENT: 'Cliente', EMPLOYEE: 'Empleado', ADMINISTRATOR: 'Administrador' }
const title = computed(() =>
  user.value
    ? `Detalle de ${roleNames[user.value.role].toLowerCase()}`
    : props.selection?.section === 'clients'
      ? 'Detalle de cliente'
      : 'Detalle de empleado',
)
const registrationFormat = new Intl.DateTimeFormat('es-CR', {
  timeZone: 'America/Costa_Rica',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})
function date(value: string | null) {
  return value ? value.split('-').reverse().join('/') : 'Desconocida'
}
function text(value: string | null) {
  return value?.trim() ? value : 'Sin registrar'
}
const groups = computed(() => {
  const detail = user.value
  if (!detail) return []
  const address = detail.address
  const prefix = detail.role === 'CLIENT' ? 'CL' : detail.role === 'EMPLOYEE' ? 'EMP' : 'ADM'
  return [
    {
      label: 'Identificación',
      fields: [
        { label: 'ID', value: `${prefix}${detail.id}` },
        ...(detail.role === 'CLIENT' ? [] : [{ label: 'Rol', value: roleNames[detail.role] }]),
      ],
    },
    {
      label: 'Datos personales',
      fields: [
        { label: 'Primer nombre', value: detail.firstName },
        { label: 'Segundo nombre', value: text(detail.secondName) },
        { label: 'Primer apellido', value: text(detail.firstSurname) },
        { label: 'Segundo apellido', value: text(detail.secondSurname) },
        { label: 'Fecha de nacimiento', value: date(detail.birthday) },
        ...(detail.role === 'CLIENT'
          ? [
              {
                label: 'Género',
                value:
                  (
                    {
                      M: 'Masculino',
                      F: 'Femenino',
                      O: 'Otro',
                      N: 'Prefiero no decirlo',
                    } as Record<string, string>
                  )[detail.gender ?? ''] ?? 'Sin registrar',
              },
            ]
          : []),
      ],
    },
    {
      label: 'Contacto',
      fields: [
        { label: 'Correo electrónico', value: detail.email },
        { label: 'Número de celular', value: text(detail.phoneNumber) },
      ],
    },
    {
      label: 'Dirección',
      fields: address
        ? [
            { label: 'Provincia', value: address.provinceName },
            { label: 'Cantón', value: address.cantonName },
            { label: 'Distrito', value: address.districtName },
            { label: 'Detalle de dirección', value: text(address.details) },
          ]
        : [{ label: 'Dirección', value: 'Sin registrar' }],
    },
    {
      label: detail.role === 'CLIENT' ? 'Información' : 'Datos laborales',
      fields: [
        {
          label: 'Fecha de registro',
          value: detail.createdAt
            ? registrationFormat.format(new Date(detail.createdAt))
            : 'Desconocida',
        },
        ...(detail.role === 'CLIENT'
          ? [
              {
                label: 'Idioma',
                value:
                  ({ es: 'Español', en: 'Inglés' } as Record<string, string>)[detail.language] ??
                  text(detail.language),
              },
            ]
          : [
              { label: 'Sucursal', value: detail.branchName },
              { label: 'Fecha de contratación', value: date(detail.hireDate) },
            ]),
      ],
    },
  ]
})

async function load() {
  request?.abort()
  user.value = null
  error.value = ''
  retryable.value = false
  const selection = props.selection
  if (!selection) {
    loading.value = false
    return
  }
  const current = new AbortController()
  request = current
  loading.value = true
  try {
    const detail = await getUserDetail(selection, current.signal)
    if (!current.signal.aborted) user.value = detail
  } catch (failure) {
    if (current.signal.aborted) return
    const status = isAxiosError(failure) ? failure.response?.status : undefined
    if (status === 401) {
      error.value = 'La sesión ha expirado. Inicia sesión nuevamente.'
      emit('session-expired')
    } else if (status === 403) {
      error.value = 'No tienes permiso para ver este usuario.'
      emit('forbidden')
    } else if (status === 404) {
      error.value = 'El usuario seleccionado ya no existe.'
    } else {
      error.value = 'No se pudo mostrar el usuario. Comprueba la conexión y vuelve a intentarlo.'
      retryable.value = true
    }
  } finally {
    if (request === current) {
      loading.value = false
      request = undefined
    }
  }
}
function close() {
  request?.abort()
  user.value = null
  emit('close')
}
watch(
  () => props.selection,
  () => {
    void load()
  },
  { immediate: true },
)
onBeforeUnmount(() => request?.abort())
</script>

<template>
  <BaseModal :open="!!selection" :title="title" @close="close">
    <div class="user-detail-content" :aria-busy="loading">
      <p v-if="loading" class="detail-feedback" role="status">Cargando datos del usuario…</p>
      <div v-else-if="error" class="detail-feedback detail-error" role="alert">
        <p>{{ error }}</p>
        <button v-if="retryable" type="button" class="detail-button" @click="load">
          Reintentar
        </button>
      </div>
      <template v-else-if="user">
        <section
          v-for="group in groups"
          :key="group.label"
          class="detail-group"
          :aria-label="group.label"
        >
          <h3>{{ group.label }}</h3>
          <dl class="detail-grid">
            <div v-for="field in group.fields" :key="field.label" class="detail-field">
              <dt>{{ field.label }}</dt>
              <dd>{{ field.value }}</dd>
            </div>
          </dl>
        </section>
      </template>
      <footer class="detail-footer">
        <button type="button" class="detail-button" @click="close">Cerrar</button>
      </footer>
    </div>
  </BaseModal>
</template>

<style scoped>
:global(.app-modal-backdrop:has(.user-detail-content)::backdrop) {
  background: var(--overlay-background);
}
:global(.app-modal-card:has(.user-detail-content)) {
  width: min(880px, 100%);
  max-width: 880px;
  padding: 0;
  border-radius: var(--radius-medium);
  background: var(--dialog-background);
  color: var(--text-primary);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
:global(.app-modal-card:has(.user-detail-content) .app-modal-title) {
  flex-shrink: 0;
  margin: 0;
  padding: 24px 80px 24px 24px;
  background: var(--primary-color);
  color: var(--content-background);
  text-align: left;
  font-style: normal;
  font-size: 1.25rem;
}
:global(.app-modal-card:has(.user-detail-content) .app-modal-close) {
  top: 14px;
  right: 24px;
  color: var(--content-background);
  border-radius: var(--radius-small);
}
:global(.app-modal-card:has(.user-detail-content) .app-modal-close:hover) {
  background: var(--surface-on-dark-hover);
}
:global(.app-modal-card:has(.user-detail-content) .app-modal-close:focus-visible) {
  outline-color: var(--focus-on-dark);
}
.user-detail-content {
  min-height: 0;
  padding: 24px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.detail-group {
  margin-bottom: 24px;
}
.detail-group h3 {
  margin: 0 0 16px;
  font-size: 1rem;
  font-weight: 700;
}
.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 20px;
  margin: 0;
}
.detail-field {
  min-width: 0;
}
dt {
  margin-bottom: 6px;
  font-weight: 500;
}
dd {
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.detail-feedback {
  padding: 16px;
  border-left: 3px solid var(--primary-color);
  background: var(--content-background);
}
.detail-error {
  border-color: var(--error-color);
  color: var(--error-color);
}
.detail-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 24px;
}
.detail-button {
  min-height: 44px;
  padding: 10px 20px;
  border: 1px solid var(--primary-color);
  border-radius: var(--radius-small);
  background: var(--content-background);
  color: var(--button-secondary-text);
}
.detail-button:hover {
  background: var(--surface-hover);
}
.detail-button:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
@media (max-width: 575px) {
  .user-detail-content {
    padding: 20px 16px;
  }
  .detail-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  :global(.app-modal-card:has(.user-detail-content) .app-modal-title) {
    padding-left: 16px;
  }
  :global(.app-modal-card:has(.user-detail-content) .app-modal-close) {
    right: 16px;
  }
}
</style>
