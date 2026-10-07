<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, useId, watch } from 'vue'
import { isAxiosError } from 'axios'
import BaseModal from '@/components/common/BaseModal.vue'
import {
  characterCount,
  validText,
  validEmail,
  validMobile,
  normalizeMobile,
} from '@/utils/user-validation'
import {
  getUserDetail,
  getUserEditOptions,
  getEmployeeListOptions,
  updateUser,
} from '@/services/user.service'
import type {
  BranchOption,
  UpdatedUser,
  UpdateClientRequest,
  UpdateEmployeeRequest,
  UserDetail,
  UserDetailSelection,
  UserEditOptions,
  UserRole,
} from '@/types/user'

const props = defineProps<{ selection: UserDetailSelection | null }>()
const emit = defineEmits<{
  close: []
  updated: [selection: UserDetailSelection, user: UpdatedUser]
  'session-expired': []
  forbidden: []
}>()
const id = useId()
const user = ref<UserDetail | null>(null)
const catalogs = ref<UserEditOptions | null>(null)
const loading = ref(false)
const catalogsLoading = ref(false)
const catalogsError = ref('')
const branches = ref<BranchOption[]>([])
const branchesError = ref('')
const error = ref('')
const retryable = ref(false)
const saving = ref(false)
const blocked = ref(false)
const confirming = ref(false)
const errors = reactive<Record<string, string>>({})
const feedback = ref<HTMLElement | null>(null)
let request: AbortController | undefined
let catalogRequest: AbortController | undefined
let disposed = false
const draft = reactive({
  firstName: '',
  secondName: '',
  firstSurname: '',
  secondSurname: '',
  email: '',
  phoneNumber: '',
  role: 'CLIENT' as UserRole,
  branchId: 0,
  addressEnabled: false,
  provinceId: 0,
  cantonId: 0,
  districtId: 0,
  details: '',
})
const isClient = computed(() => props.selection?.section === 'clients')
const title = computed(() => `Modificar ${isClient.value ? 'cliente' : 'empleado'}`)
const roleNames = { EMPLOYEE: 'Empleado', ADMINISTRATOR: 'Administrador' }
type NameField = 'firstName' | 'secondName' | 'firstSurname' | 'secondSurname'
const nameFields = computed<{ name: NameField; label: string; required: boolean }[]>(() => [
  { name: 'firstName', label: 'Primer nombre', required: true },
  { name: 'secondName', label: 'Segundo nombre', required: false },
  { name: 'firstSurname', label: 'Primer apellido', required: !isClient.value },
  { name: 'secondSurname', label: 'Segundo apellido', required: !isClient.value },
])
const prefix = computed(() =>
  user.value?.role === 'CLIENT' ? 'CL' : user.value?.role === 'EMPLOYEE' ? 'EMP' : 'ADM',
)
const cantons = computed(
  () => catalogs.value?.cantons.filter((item) => item.provinceId === draft.provinceId) ?? [],
)
const districts = computed(
  () => catalogs.value?.districts.filter((item) => item.cantonId === draft.cantonId) ?? [],
)
const phone = normalizeMobile
function changes(): UpdateClientRequest | UpdateEmployeeRequest {
  const current = user.value
  if (!current) return {}
  const result: UpdateClientRequest & { role?: 'EMPLOYEE' | 'ADMINISTRATOR'; branchId?: number } =
    {}
  for (const { name } of nameFields.value) {
    const value = draft[name].trim()
    if (value !== (current[name] ?? '').trim()) {
      if (name === 'firstName') result.firstName = value
      else result[name] = value || null
    }
  }
  const email = draft.email.trim().toLowerCase()
  if (email !== current.email.trim().toLowerCase()) result.email = email
  const number = phone(draft.phoneNumber)
  if (number !== phone(current.phoneNumber ?? '')) result.phoneNumber = number || null
  if (!isClient.value && draft.role !== current.role && draft.role !== 'CLIENT')
    result.role = draft.role
  if (current.role !== 'CLIENT' && draft.branchId !== current.branchId)
    result.branchId = draft.branchId
  if (!draft.addressEnabled) {
    if (current.address) result.address = null
  } else if (
    !current.address ||
    draft.districtId !== current.address.districtId ||
    draft.details !== (current.address.details ?? '')
  ) {
    result.address = { districtId: draft.districtId, details: draft.details || null }
  }
  return result
}
const hasChanges = computed(() => Object.keys(changes()).length > 0)
const changedLabels = computed(() =>
  Object.keys(changes()).map(
    (field) =>
      ({
        firstName: 'Primer nombre',
        secondName: 'Segundo nombre',
        firstSurname: 'Primer apellido',
        secondSurname: 'Segundo apellido',
        email: 'Correo electrónico',
        phoneNumber: 'Número de celular',
        address: 'Dirección',
        role: 'Rol',
        branchId: 'Sucursal',
      })[field as NameField | 'email' | 'phoneNumber' | 'address' | 'role' | 'branchId'],
  ),
)
const readonlyFields = computed(() => {
  const current = user.value
  if (!current) return []
  const date = (value: string | null) =>
    value ? value.split('-').reverse().join('/') : 'Desconocida'
  return [
    { label: 'ID', value: `${prefix.value}${current.id}` },
    { label: 'Fecha de nacimiento', value: date(current.birthday) },
    {
      label: 'Fecha de registro',
      value: current.createdAt
        ? new Intl.DateTimeFormat('es-CR', { timeZone: 'America/Costa_Rica' }).format(
            new Date(current.createdAt),
          )
        : 'Desconocida',
    },
    ...(current.role === 'CLIENT'
      ? []
      : [{ label: 'Fecha de contratación', value: date(current.hireDate) }]),
  ]
})
function hydrate(current: UserDetail) {
  Object.assign(draft, {
    firstName: current.firstName,
    secondName: current.secondName ?? '',
    firstSurname: current.firstSurname ?? '',
    secondSurname: current.secondSurname ?? '',
    email: current.email,
    phoneNumber: current.phoneNumber ?? '',
    role: current.role,
    branchId: current.role === 'CLIENT' ? 0 : current.branchId,
    addressEnabled: current.role !== 'CLIENT' || !!current.address,
    provinceId: current.address?.provinceId ?? 0,
    cantonId: current.address?.cantonId ?? 0,
    districtId: current.address?.districtId ?? 0,
    details: current.address?.details ?? '',
  })
}
function changeProvince() {
  draft.cantonId = 0
  draft.districtId = 0
  delete errors.provinceId
}
function changeCanton() {
  draft.districtId = 0
  delete errors.cantonId
}
function status(failure: unknown) {
  return isAxiosError(failure) ? failure.response?.status : undefined
}
function authorization(failure: unknown) {
  if (status(failure) === 401) {
    error.value = 'La sesión ha expirado. Inicia sesión nuevamente.'
    blocked.value = true
    emit('session-expired')
    return true
  }
  if (status(failure) === 403) {
    error.value = 'No tienes permiso para modificar este usuario.'
    emit('forbidden')
    blocked.value = true
    return true
  }
  return false
}
async function load() {
  request?.abort()
  catalogRequest?.abort()
  user.value = null
  catalogs.value = null
  error.value = ''
  catalogsError.value = ''
  branches.value = []
  branchesError.value = ''
  catalogsLoading.value = false
  confirming.value = false
  blocked.value = false
  retryable.value = false
  for (const field of Object.keys(errors)) delete errors[field]
  const selection = props.selection
  if (!selection) {
    loading.value = false
    return
  }
  const current = new AbortController()
  request = current
  loading.value = true
  const [detail] = await Promise.allSettled([
    getUserDetail(selection, current.signal),
    fetchCatalogs(current.signal),
  ])
  if (current.signal.aborted) return
  if (detail.status === 'fulfilled') {
    user.value = detail.value
    hydrate(detail.value)
  } else if (!authorization(detail.reason)) {
    error.value =
      status(detail.reason) === 404
        ? 'El usuario seleccionado ya no existe.'
        : 'No se pudieron cargar los datos del usuario. Vuelve a intentarlo.'
    retryable.value = status(detail.reason) !== 404
  }
  loading.value = false
  request = undefined
}
async function fetchCatalogs(signal: AbortSignal) {
  const [options, branchOptions] = await Promise.allSettled([
    getUserEditOptions(signal),
    isClient.value ? Promise.resolve({ branches: [] }) : getEmployeeListOptions(signal),
  ])
  if (signal.aborted) return
  if (options.status === 'fulfilled') {
    catalogs.value = options.value
    catalogsError.value = ''
  } else if (!authorization(options.reason)) {
    catalogsError.value =
      'No se pudieron cargar las opciones de dirección. Puedes editar los demás campos.'
  }
  if (branchOptions.status === 'fulfilled') {
    branches.value = branchOptions.value.branches
    branchesError.value = ''
  } else if (!authorization(branchOptions.reason)) {
    branchesError.value = 'No se pudieron cargar las sucursales. Puedes editar los demás campos.'
  }
}
async function retryCatalogs() {
  catalogRequest?.abort()
  const current = new AbortController()
  catalogRequest = current
  catalogsLoading.value = true
  try {
    await fetchCatalogs(current.signal)
  } finally {
    if (catalogRequest === current) {
      catalogsLoading.value = false
      catalogRequest = undefined
    }
  }
}
function validate() {
  for (const field of Object.keys(errors)) delete errors[field]
  const payload = changes()
  for (const { name, label, required } of nameFields.value) {
    if (payload[name] === undefined) continue
    const value = draft[name].trim()
    if (required && !value) errors[name] = `${label}: este campo es obligatorio.`
    else if (!validText(value, 100)) {
      errors[name] = `${label}: ingresa texto válido de hasta 100 bytes en UTF-8.`
    }
  }
  if (payload.email !== undefined) {
    if (!payload.email) errors.email = 'El correo electrónico es obligatorio.'
    else if (!validEmail(payload.email)) errors.email = 'Ingresa un correo electrónico válido.'
  }
  if (payload.phoneNumber !== undefined) {
    if (!payload.phoneNumber && !isClient.value)
      errors.phoneNumber = 'El número de celular es obligatorio.'
    else if (payload.phoneNumber && !validMobile(payload.phoneNumber))
      errors.phoneNumber =
        'Ingresa un celular de Costa Rica de ocho dígitos que comience con 6, 7 u 8.'
  }
  if (payload.address !== undefined && payload.address !== null) {
    if (!catalogs.value || catalogsError.value)
      errors.address = 'Carga las opciones de dirección antes de modificarla.'
    if (!draft.provinceId) errors.provinceId = 'Selecciona una provincia.'
    if (!draft.cantonId || !cantons.value.some((item) => item.id === draft.cantonId))
      errors.cantonId = 'Selecciona un cantón válido.'
    if (!draft.districtId || !districts.value.some((item) => item.id === draft.districtId))
      errors.districtId = 'Selecciona un distrito válido.'
    if (!validText(draft.details, 255))
      errors.details = 'El detalle debe ser texto válido y no superar 255 bytes en UTF-8.'
  }
  if (
    'branchId' in payload &&
    payload.branchId !== undefined &&
    !branches.value.some((branch) => branch.id === payload.branchId)
  )
    errors.branchId = 'Selecciona una sucursal válida.'
  return Object.keys(errors).length === 0
}
async function prepare() {
  if (saving.value || blocked.value || !hasChanges.value) return
  error.value = ''
  if (validate()) confirming.value = true
  await nextTick()
  if (confirming.value) feedback.value?.focus()
  else document.querySelector<HTMLElement>(`.user-edit-content [aria-invalid="true"]`)?.focus()
}
async function save() {
  const selection = props.selection
  if (!selection || saving.value || blocked.value || !confirming.value || !validate()) return
  saving.value = true
  error.value = ''
  try {
    const result = await updateUser(selection, changes())
    if (!disposed) emit('updated', selection, result)
  } catch (failure) {
    if (disposed) return
    confirming.value = false
    if (!authorization(failure)) {
      const code = status(failure)
      if (code === 404) {
        error.value = 'El usuario seleccionado ya no existe.'
        blocked.value = true
      } else if (code === 409) {
        const message: unknown = isAxiosError(failure) ? failure.response?.data?.message : undefined
        if (
          message === 'El correo electrónico ya está registrado para otro cliente.' ||
          message === 'El correo electrónico ya está registrado para otro empleado.'
        ) {
          errors.email = 'El correo electrónico ya está registrado para otro usuario.'
          error.value = 'Revisa el correo electrónico antes de guardar.'
        } else {
          error.value =
            message === 'Debe permanecer al menos un administrador activo.'
              ? message
              : 'No se pudieron guardar los cambios porque entran en conflicto con el estado actual del usuario.'
        }
      } else if (code === 400 && isAxiosError(failure)) {
        const message: unknown = failure.response?.data?.message
        const messages = Array.isArray(message)
          ? message.filter((item): item is string => typeof item === 'string')
          : typeof message === 'string'
            ? [message]
            : []
        for (const value of messages) {
          const lower = value.toLowerCase()
          const nameField = nameFields.value.find(
            ({ name, label }) =>
              lower.includes(name.toLowerCase()) || lower.includes(label.toLowerCase()),
          )?.name
          const field =
            nameField ??
            (lower.includes('correo') || lower.includes('email')
              ? 'email'
              : lower.includes('celular') || lower.includes('phone')
                ? 'phoneNumber'
                : lower.includes('distrito') || lower.includes('district')
                  ? 'districtId'
                  : lower.includes('detalle') || lower.includes('details')
                    ? 'details'
                    : lower.includes('sucursal') || lower.includes('branch')
                      ? 'branchId'
                      : lower.includes('rol')
                        ? 'role'
                        : 'address')
          errors[field] = value
        }
        error.value = 'Revisa los campos indicados antes de guardar.'
      } else {
        error.value =
          'No se pudo confirmar si los cambios se guardaron. Cierra y vuelve a abrir el usuario para comprobar sus datos antes de intentar otra modificación.'
        blocked.value = true
      }
    }
    await nextTick()
    feedback.value?.focus()
  } finally {
    if (!disposed) saving.value = false
  }
}
function close() {
  if (saving.value) return
  request?.abort()
  catalogRequest?.abort()
  emit('close')
}
watch(
  () => props.selection,
  () => {
    void load()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  disposed = true
  request?.abort()
  catalogRequest?.abort()
})
</script>

<template>
  <BaseModal :open="!!selection" :title="title" :close-disabled="saving" @close="close">
    <div class="user-edit-content" :aria-busy="loading || saving">
      <p v-if="loading" role="status">Cargando datos del usuario…</p>
      <div v-if="error" ref="feedback" class="edit-feedback edit-error" role="alert" tabindex="-1">
        <p>{{ error }}</p>
        <button v-if="retryable" class="secondary" type="button" @click="load">Reintentar</button>
      </div>
      <template v-if="user && !loading">
        <section aria-label="Información del usuario">
          <h3>Información del usuario</h3>
          <dl class="edit-grid readonly-grid">
            <div v-for="field in readonlyFields" :key="field.label">
              <dt>{{ field.label }}</dt>
              <dd>{{ field.value }}</dd>
            </div>
          </dl>
        </section>
        <div v-if="confirming" ref="feedback" class="edit-feedback" role="alert" tabindex="-1">
          <h3>Confirmar modificación</h3>
          <p>Vas a modificar los siguientes datos de {{ prefix }}{{ user.id }}:</p>
          <ul>
            <li v-for="label in changedLabels" :key="label">{{ label }}</li>
          </ul>
          <p>
            Los cambios reemplazarán los datos actuales. Cambiar el correo afectará el acceso con
            correo electrónico<span v-if="!isClient"
              >; cambiar el rol modificará los permisos del usuario</span
            >.
          </p>
          <p>¿Deseas guardar estos cambios?</p>
          <footer>
            <button type="button" class="secondary" :disabled="saving" @click="close">
              Cancelar
            </button>
            <button type="button" class="secondary" :disabled="saving" @click="confirming = false">
              Volver a editar
            </button>
            <button type="button" class="primary" :disabled="saving" @click="save">
              {{ saving ? 'Guardando…' : 'Confirmar cambios' }}
            </button>
          </footer>
        </div>
        <form v-else novalidate @submit.prevent="prepare">
          <fieldset :disabled="saving || blocked">
            <legend>Datos editables</legend>
            <div class="edit-grid">
              <div v-for="field in nameFields" :key="field.name" class="edit-field">
                <label :for="`${id}-${field.name}`"
                  >{{ field.label }}{{ field.required ? ' *' : ' (opcional)' }}</label
                >
                <input
                  :id="`${id}-${field.name}`"
                  v-model="draft[field.name]"
                  :name="field.name"
                  type="text"
                  autocomplete="off"
                  :required="field.required"
                  :aria-invalid="!!errors[field.name]"
                  :aria-describedby="errors[field.name] ? `${id}-${field.name}-error` : undefined"
                  @input="delete errors[field.name]"
                />
                <p v-if="errors[field.name]" :id="`${id}-${field.name}-error`" class="field-error">
                  {{ errors[field.name] }}
                </p>
              </div>
              <div class="edit-field">
                <label :for="`${id}-email`">Correo electrónico *</label>
                <input
                  :id="`${id}-email`"
                  v-model="draft.email"
                  name="email"
                  type="email"
                  autocomplete="off"
                  required
                  :aria-invalid="!!errors.email"
                  :aria-describedby="errors.email ? `${id}-email-error` : undefined"
                  @input="delete errors.email"
                />
                <p v-if="errors.email" :id="`${id}-email-error`" class="field-error">
                  {{ errors.email }}
                </p>
              </div>
              <div class="edit-field">
                <label :for="`${id}-phone`"
                  >Número de celular{{ isClient ? ' (opcional)' : ' *' }}</label
                >
                <input
                  :id="`${id}-phone`"
                  v-model="draft.phoneNumber"
                  name="phoneNumber"
                  type="tel"
                  autocomplete="off"
                  placeholder="8888-8888"
                  :required="!isClient"
                  :aria-invalid="!!errors.phoneNumber"
                  :aria-describedby="errors.phoneNumber ? `${id}-phone-error` : undefined"
                  @input="delete errors.phoneNumber"
                />
                <p v-if="errors.phoneNumber" :id="`${id}-phone-error`" class="field-error">
                  {{ errors.phoneNumber }}
                </p>
              </div>
              <div v-if="!isClient" class="edit-field">
                <label :for="`${id}-role`">Rol *</label>
                <select
                  :id="`${id}-role`"
                  v-model="draft.role"
                  name="role"
                  :aria-invalid="!!errors.role"
                  :aria-describedby="errors.role ? `${id}-role-error` : undefined"
                  @change="delete errors.role"
                >
                  <option value="EMPLOYEE">{{ roleNames.EMPLOYEE }}</option>
                  <option value="ADMINISTRATOR">{{ roleNames.ADMINISTRATOR }}</option>
                </select>
                <p v-if="errors.role" :id="`${id}-role-error`" class="field-error">
                  {{ errors.role }}
                </p>
              </div>
            </div>
            <div v-if="!isClient" class="edit-field">
              <label :for="`${id}-branch`">Sucursal *</label>
              <select
                :id="`${id}-branch`"
                v-model="draft.branchId"
                name="branchId"
                :disabled="!!branchesError || catalogsLoading || !branches.length"
                :aria-invalid="!!errors.branchId"
                :aria-describedby="errors.branchId ? `${id}-branch-error` : undefined"
                @change="delete errors.branchId"
              >
                <option
                  v-if="
                    user.role !== 'CLIENT' &&
                    !branches.some((branch) => branch.id === draft.branchId)
                  "
                  :value="user.branchId"
                >
                  {{ user.branchName }}
                </option>
                <option v-for="branch in branches" :key="branch.id" :value="branch.id">
                  {{ branch.label }}
                </option>
              </select>
              <p v-if="errors.branchId" :id="`${id}-branch-error`" class="field-error">
                {{ errors.branchId }}
              </p>
              <p v-if="branchesError" class="edit-feedback" role="alert">
                {{ branchesError }}
                <button
                  type="button"
                  class="secondary"
                  :disabled="catalogsLoading"
                  @click="retryCatalogs"
                >
                  Reintentar sucursales
                </button>
              </p>
            </div>
            <h3>Dirección{{ isClient ? ' (opcional)' : ' *' }}</h3>
            <p v-if="catalogsError" class="edit-feedback" role="alert">
              {{ catalogsError }}
              <button
                type="button"
                class="secondary"
                :disabled="catalogsLoading"
                @click="retryCatalogs"
              >
                {{ catalogsLoading ? 'Cargando…' : 'Reintentar opciones' }}
              </button>
            </p>
            <label v-if="isClient" class="checkbox-label"
              ><input
                v-model="draft.addressEnabled"
                name="addressEnabled"
                type="checkbox"
                :disabled="!catalogs || catalogsLoading"
              />Registrar dirección</label
            >
            <p v-if="errors.address" class="field-error">{{ errors.address }}</p>
            <div v-if="draft.addressEnabled" class="edit-grid">
              <div class="edit-field">
                <label :for="`${id}-province`">Provincia *</label>
                <select
                  :id="`${id}-province`"
                  v-model="draft.provinceId"
                  name="provinceId"
                  :disabled="!catalogs || catalogsLoading"
                  :aria-invalid="!!errors.provinceId"
                  :aria-describedby="errors.provinceId ? `${id}-province-error` : undefined"
                  @change="changeProvince"
                >
                  <option :value="0">Selecciona una provincia</option>
                  <option v-for="item in catalogs?.provinces" :key="item.id" :value="item.id">
                    {{ item.label }}
                  </option>
                  <option v-if="!catalogs && user.address" :value="user.address.provinceId">
                    {{ user.address.provinceName }}
                  </option>
                </select>
                <p v-if="errors.provinceId" :id="`${id}-province-error`" class="field-error">
                  {{ errors.provinceId }}
                </p>
              </div>
              <div class="edit-field">
                <label :for="`${id}-canton`">Cantón *</label>
                <select
                  :id="`${id}-canton`"
                  v-model="draft.cantonId"
                  name="cantonId"
                  :disabled="!catalogs || !draft.provinceId || catalogsLoading"
                  :aria-invalid="!!errors.cantonId"
                  :aria-describedby="errors.cantonId ? `${id}-canton-error` : undefined"
                  @change="changeCanton"
                >
                  <option :value="0">Selecciona un cantón</option>
                  <option v-for="item in cantons" :key="item.id" :value="item.id">
                    {{ item.label }}
                  </option>
                  <option v-if="!catalogs && user.address" :value="user.address.cantonId">
                    {{ user.address.cantonName }}
                  </option>
                </select>
                <p v-if="errors.cantonId" :id="`${id}-canton-error`" class="field-error">
                  {{ errors.cantonId }}
                </p>
              </div>
              <div class="edit-field">
                <label :for="`${id}-district`">Distrito *</label>
                <select
                  :id="`${id}-district`"
                  v-model="draft.districtId"
                  name="districtId"
                  :disabled="!catalogs || !draft.cantonId || catalogsLoading"
                  :aria-invalid="!!errors.districtId"
                  :aria-describedby="errors.districtId ? `${id}-district-error` : undefined"
                  @change="delete errors.districtId"
                >
                  <option :value="0">Selecciona un distrito</option>
                  <option v-for="item in districts" :key="item.id" :value="item.id">
                    {{ item.label }}
                  </option>
                  <option v-if="!catalogs && user.address" :value="user.address.districtId">
                    {{ user.address.districtName }}
                  </option>
                </select>
                <p v-if="errors.districtId" :id="`${id}-district-error`" class="field-error">
                  {{ errors.districtId }}
                </p>
              </div>
              <div class="edit-field address-details">
                <label :for="`${id}-details`">Detalle de dirección (opcional)</label>
                <textarea
                  :id="`${id}-details`"
                  v-model="draft.details"
                  name="details"
                  rows="3"
                  :disabled="!catalogs || catalogsLoading"
                  :aria-invalid="!!errors.details"
                  :aria-describedby="`${id}-details-hint${errors.details ? ` ${id}-details-error` : ''}`"
                  @input="delete errors.details"
                ></textarea>
                <p :id="`${id}-details-hint`" class="field-hint">
                  {{ characterCount(draft.details) }}/255
                </p>
                <p v-if="errors.details" :id="`${id}-details-error`" class="field-error">
                  {{ errors.details }}
                </p>
              </div>
            </div>
          </fieldset>
          <footer>
            <button type="button" class="secondary" @click="close">Cancelar</button>
            <button type="submit" class="primary" :disabled="blocked || !hasChanges">
              Guardar cambios
            </button>
          </footer>
        </form>
      </template>
      <footer v-if="!user && !loading">
        <button type="button" class="secondary" @click="close">Cerrar</button>
      </footer>
    </div>
  </BaseModal>
</template>

<style scoped>
:global(.app-modal-backdrop:has(.user-edit-content)::backdrop) {
  background: color-mix(in srgb, var(--color-black) 55%, transparent);
}
:global(.app-modal-card:has(.user-edit-content)) {
  width: min(880px, 100%);
  max-width: 880px;
  padding: 0;
  border-radius: var(--radius-medium);
  background: var(--color-background);
  color: var(--color-dark);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
:global(.app-modal-card:has(.user-edit-content) .app-modal-title) {
  flex-shrink: 0;
  margin: 0;
  padding: 24px 80px 24px 24px;
  background: var(--color-primary);
  color: var(--color-white);
  text-align: left;
  font-style: normal;
  font-size: 1.25rem;
}
:global(.app-modal-card:has(.user-edit-content) .app-modal-close) {
  top: 14px;
  right: 24px;
  color: var(--color-white);
  border-radius: var(--radius-small);
}
:global(.app-modal-card:has(.user-edit-content) .app-modal-close:focus-visible) {
  outline-color: var(--color-cream);
}
.user-edit-content {
  min-height: 0;
  padding: 24px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
section {
  margin-bottom: 24px;
}
h3,
legend {
  margin: 0 0 16px;
  font-size: 1rem;
  font-weight: 700;
}
fieldset {
  padding: 0;
  border: 0;
  margin: 0;
  min-width: 0;
}
fieldset h3 {
  margin-top: 24px;
}
.edit-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 20px;
}
.readonly-grid {
  margin: 0;
}
.edit-field,
.readonly-grid > div {
  min-width: 0;
}
label,
dt {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
}
input,
select,
textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--color-light_gray);
  border-radius: var(--radius-small);
  background: var(--color-white);
  color: var(--color-dark);
  font: inherit;
}
dd {
  margin: 0;
  color: var(--color-dark);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
textarea {
  resize: vertical;
}
.address-details {
  grid-column: 1 / -1;
}
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
}
.checkbox-label input {
  width: 18px;
  height: 18px;
  min-height: 18px;
  accent-color: var(--color-primary);
}
.field-error {
  color: var(--color-error);
  margin: 6px 0 0;
  font-size: 0.875rem;
}
.field-hint {
  color: var(--color-gray);
  margin: 6px 0 0;
  font-size: 0.875rem;
}
[aria-invalid='true'] {
  border-color: var(--color-error);
}
.edit-feedback {
  padding: 16px;
  margin-bottom: 20px;
  border-left: 3px solid var(--color-primary);
  background: var(--color-white);
}
.edit-error {
  color: var(--color-error);
  border-color: var(--color-error);
}
footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 24px;
}
button {
  min-height: 44px;
  padding: 10px 20px;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-small);
  font: inherit;
  cursor: pointer;
}
.primary {
  background: var(--color-primary);
  color: var(--color-white);
}
.secondary {
  background: var(--color-white);
  color: var(--color-primary);
}
.secondary:hover {
  background: var(--color-light_gray);
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
input:focus-visible,
select:focus-visible,
textarea:focus-visible,
button:focus-visible,
[tabindex='-1']:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
@media (max-width: 575px) {
  .user-edit-content {
    padding: 20px 16px;
  }
  .edit-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  footer button {
    flex: 1;
  }
}
</style>
