<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  reactive,
  ref,
  useId,
  useTemplateRef,
  watch,
} from 'vue'
import type { BranchOption, CreateEmployeeRequest, CreateUserRequest } from '@/types/user'
import type { CantonOption, DistrictOption, ProvinceOption } from '@/types/address'

const props = withDefaults(
  defineProps<{
    mode?: 'employee' | 'client'
    provinces?: readonly ProvinceOption[]
    cantons?: readonly CantonOption[]
    districts?: readonly DistrictOption[]
    branches?: readonly BranchOption[]
    catalogsLoading?: boolean
    catalogsError?: string
    submitting?: boolean
    submissionErrors?: readonly string[]
    submissionBlocked?: boolean
  }>(),
  {
    mode: 'employee',
    provinces: () => [],
    cantons: () => [],
    districts: () => [],
    branches: () => [],
    catalogsLoading: false,
    catalogsError: '',
    submitting: false,
    submissionErrors: () => [],
    submissionBlocked: false,
  },
)
const emit = defineEmits<{ retryCatalogs: []; submit: [data: CreateUserRequest] }>()
const isClient = computed(() => props.mode === 'client')
const addressEnabled = ref(false)
const needsAddress = computed(() => !isClient.value || addressEnabled.value)
const submitted = ref(false)
const sending = computed(() => props.submitting || submitted.value)
watch(
  () => props.submitting,
  (value) => {
    if (!value) submitted.value = false
  },
)
const catalogsUnavailable = computed(() => props.catalogsLoading || !!props.catalogsError)
const requiredCatalogsUnavailable = computed(
  () =>
    (needsAddress.value && (catalogsUnavailable.value || !props.provinces.length)) ||
    (!isClient.value && (catalogsUnavailable.value || !props.branches.length)),
)
const catalogPlaceholder = computed(() =>
  props.catalogsLoading
    ? 'Cargando opciones…'
    : props.catalogsError
      ? 'Opciones no disponibles'
      : '',
)

const id = useId()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const submissionFeedback = useTemplateRef<HTMLElement>('submission-feedback')
watch(
  () => props.submissionErrors,
  async (messages) => {
    if (messages.length) {
      await nextTick()
      submissionFeedback.value?.focus()
    }
  },
)
const draft = reactive<
  Omit<CreateEmployeeRequest, 'address' | 'branchId' | 'secondName'> & {
    secondName: string
    branchId: number | ''
    provinceId: number | ''
    cantonId: number | ''
    districtId: number | ''
    details: string
    language: string
  }
>({
  firstName: '',
  secondName: '',
  firstSurname: '',
  secondSurname: '',
  birthday: '',
  email: '',
  phoneNumber: '',
  role: 'EMPLOYEE',
  branchId: '',
  provinceId: '',
  cantonId: '',
  districtId: '',
  details: '',
  language: 'es',
})
type FieldName = keyof typeof draft
type TextField = Exclude<
  FieldName,
  'role' | 'branchId' | 'provinceId' | 'cantonId' | 'districtId' | 'language'
>
interface TextFieldDefinition {
  name: TextField
  label: string
  type: 'text' | 'date' | 'email' | 'tel'
  required: boolean
  maxBytes?: number
}

const groups = computed<{ label: string; fields: TextFieldDefinition[] }[]>(() => [
  {
    label: 'Datos personales',
    fields: [
      { name: 'firstName', label: 'Primer nombre', type: 'text', required: true, maxBytes: 100 },
      { name: 'secondName', label: 'Segundo nombre', type: 'text', required: false, maxBytes: 100 },
      {
        name: 'firstSurname',
        label: 'Primer apellido',
        type: 'text',
        required: !isClient.value,
        maxBytes: 100,
      },
      {
        name: 'secondSurname',
        label: 'Segundo apellido',
        type: 'text',
        required: !isClient.value,
        maxBytes: 100,
      },
      { name: 'birthday', label: 'Fecha de nacimiento', type: 'date', required: !isClient.value },
    ],
  },
  {
    label: 'Contacto',
    fields: [
      { name: 'email', label: 'Correo electrónico', type: 'email', required: true, maxBytes: 150 },
      {
        name: 'phoneNumber',
        label: 'Teléfono',
        type: 'tel',
        required: !isClient.value,
        maxBytes: 20,
      },
    ],
  },
])
const textFields = computed<TextFieldDefinition[]>(() => [
  ...groups.value.flatMap((group) => group.fields),
  { name: 'details', label: 'Detalle de dirección', type: 'text', required: false, maxBytes: 255 },
])
const dirty = reactive<Partial<Record<FieldName, boolean>>>({})
const touched = reactive<Partial<Record<FieldName, boolean>>>({})
const errors = reactive<Partial<Record<FieldName, string>>>({})
const encoder = new TextEncoder()
const title = computed(() =>
  isClient.value
    ? 'Crear cliente'
    : draft.role === 'ADMINISTRATOR'
      ? 'Crear administrador'
      : 'Crear empleado',
)
const availableCantons = computed(() =>
  props.cantons.filter((canton) => canton.provinceId === draft.provinceId),
)
const availableDistricts = computed(() =>
  props.districts.filter((district) => district.cantonId === draft.cantonId),
)
const cantonHelp = computed(() =>
  catalogsUnavailable.value
    ? ''
    : draft.provinceId === ''
      ? 'Selecciona primero una provincia.'
      : !availableCantons.value.length
        ? 'No hay cantones disponibles para esta provincia.'
        : '',
)
const districtHelp = computed(() =>
  catalogsUnavailable.value
    ? ''
    : draft.cantonId === ''
      ? 'Selecciona primero un cantón.'
      : !availableDistricts.value.length
        ? 'No hay distritos disponibles para este cantón.'
        : '',
)

function clearField(field: 'cantonId' | 'districtId') {
  draft[field] = ''
  delete errors[field]
  delete dirty[field]
  delete touched[field]
}

function retryCatalogs() {
  dialog.value?.querySelector<HTMLInputElement>('[name="firstName"]')?.focus()
  emit('retryCatalogs')
}

watch(
  () => draft.provinceId,
  () => {
    clearField('cantonId')
    clearField('districtId')
  },
)
watch(
  () => draft.cantonId,
  () => clearField('districtId'),
)

function description(field: FieldName, hasHelp = false) {
  const references = []
  if (hasHelp) references.push(id + '-' + field + '-help')
  if (errors[field]) references.push(id + '-' + field + '-error')
  return references.join(' ') || undefined
}

function validateField(
  field: FieldName,
  control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  includeDisabled = false,
) {
  if (control.disabled && !includeDisabled) return ''
  const definition = textFields.value.find((item) => item.name === field)
  if (definition) {
    const value = draft[definition.name]
    if (definition.type === 'date' && control.validity.badInput)
      return 'Introduce una fecha válida.'
    if (definition.required && !value.trim()) return 'Este campo es obligatorio.'
    if (!definition.required && !value) return ''
    if (/[\uD800-\uDFFF]/u.test(value)) return 'El texto contiene un carácter no válido.'
    if (definition.maxBytes && encoder.encode(value).length > definition.maxBytes) {
      return 'El texto es demasiado largo. Reduce su longitud.'
    }
    if (definition.type === 'email') {
      const localPart = value.split('@')[0] ?? ''
      const topLevelDomain = value.split('.').pop() ?? ''
      if (
        control.validity.typeMismatch ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value) ||
        !/^(?:[a-z]{2,}|xn--[a-z0-9-]+)$/iu.test(topLevelDomain) ||
        localPart.startsWith('.') ||
        localPart.endsWith('.') ||
        localPart.includes('..') ||
        encoder.encode(localPart).length > 64
      )
        return 'Introduce un correo electrónico válido, por ejemplo: nombre@ejemplo.com.'
    }
    if (definition.type === 'date') {
      const date = new Date(value + 'T00:00:00Z')
      if (
        !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
        Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value
      )
        return 'Introduce una fecha válida.'
    }
    return ''
  }

  const choices = {
    language: ['es', 'en'],
    role: ['EMPLOYEE', 'ADMINISTRATOR'],
    branchId: props.branches.map((branch) => branch.id),
    provinceId: props.provinces.map((province) => province.id),
    cantonId: availableCantons.value.map((canton) => canton.id),
    districtId: availableDistricts.value.map((district) => district.id),
  }
  const options: readonly (string | number)[] = choices[field as keyof typeof choices]
  return options.includes(draft[field]) ? '' : 'Selecciona una opción válida.'
}

function fieldControl(event: Event) {
  const control = event.target
  if (
    !(
      control instanceof HTMLInputElement ||
      control instanceof HTMLSelectElement ||
      control instanceof HTMLTextAreaElement
    ) ||
    !Object.prototype.hasOwnProperty.call(draft, control.name)
  )
    return
  return { control, field: control.name as FieldName }
}

function onEdit(event: Event) {
  const target = fieldControl(event)
  if (!target) return
  dirty[target.field] = true
  if (touched[target.field]) errors[target.field] = validateField(target.field, target.control)
}

function onBlur(event: FocusEvent) {
  const target = fieldControl(event)
  if (!target || !dirty[target.field]) return
  touched[target.field] = true
  errors[target.field] = validateField(target.field, target.control)
}

async function submit() {
  if (sending.value || props.submissionBlocked || requiredCatalogsUnavailable.value) return
  const controls = dialog.value?.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >('[name]')
  if (!controls) return
  let firstInvalid: HTMLElement | undefined
  for (const control of controls) {
    const field = control.name as FieldName
    touched[field] = true
    errors[field] = validateField(field, control, true)
    if (errors[field] && !firstInvalid) firstInvalid = control
  }
  if (firstInvalid) {
    await nextTick()
    firstInvalid.focus()
    return
  }
  if (needsAddress.value && draft.districtId === '') return
  const base = {
    email: draft.email,
    firstName: draft.firstName,
    ...(draft.secondName ? { secondName: draft.secondName } : {}),
  }
  const address =
    draft.districtId === ''
      ? undefined
      : {
          districtId: draft.districtId,
          ...(draft.details ? { details: draft.details } : {}),
        }
  if (isClient.value) {
    submitted.value = true
    emit('submit', {
      ...base,
      role: 'CLIENT',
      ...(draft.firstSurname ? { firstSurname: draft.firstSurname } : {}),
      ...(draft.secondSurname ? { secondSurname: draft.secondSurname } : {}),
      ...(draft.birthday ? { birthday: draft.birthday } : {}),
      ...(draft.phoneNumber ? { phoneNumber: draft.phoneNumber } : {}),
      ...(addressEnabled.value ? { address } : {}),
      language: draft.language,
    })
    return
  }
  if (draft.branchId === '' || !address) return
  submitted.value = true
  emit('submit', {
    ...base,
    role: draft.role,
    firstSurname: draft.firstSurname,
    secondSurname: draft.secondSurname,
    birthday: draft.birthday,
    phoneNumber: draft.phoneNumber,
    branchId: draft.branchId,
    address,
  })
}

function complete() {
  submitted.value = false
  addressEnabled.value = false
  Object.assign(draft, {
    firstName: '',
    secondName: '',
    firstSurname: '',
    secondSurname: '',
    birthday: '',
    email: '',
    phoneNumber: '',
    role: 'EMPLOYEE',
    branchId: '',
    provinceId: '',
    cantonId: '',
    districtId: '',
    details: '',
    language: 'es',
  })
  for (const field of Object.keys(draft) as FieldName[]) {
    delete errors[field]
    delete dirty[field]
    delete touched[field]
  }
  dialog.value?.close()
  onClosed()
}

let opener: HTMLElement | null = null
let releasePageScroll: (() => void) | undefined

function lockPageScroll() {
  const { scrollX, scrollY } = window
  const root = document.documentElement.style
  const body = document.body.style
  const changes: [CSSStyleDeclaration, string, string][] = [
    [root, 'scrollbar-gutter', 'stable'],
    [root, 'overflow-x', 'hidden'],
    [root, 'overflow-y', 'hidden'],
    [body, 'position', 'fixed'],
    [body, 'top', -scrollY + 'px'],
    [body, 'left', -scrollX + 'px'],
    [body, 'right', '0'],
    [body, 'overflow-x', 'hidden'],
    [body, 'overflow-y', 'hidden'],
  ]
  const previousStyles = changes.map(([style, property]) => ({
    style,
    property,
    value: style.getPropertyValue(property),
    priority: style.getPropertyPriority(property),
  }))
  for (const [style, property, value] of changes) style.setProperty(property, value)

  releasePageScroll = () => {
    for (const { style, property, value, priority } of previousStyles) {
      if (value) style.setProperty(property, value, priority)
      else style.removeProperty(property)
    }
    // Ignore the page's smooth scrolling when restoring its position after unlocking.
    if (window.scrollX !== scrollX || window.scrollY !== scrollY) {
      window.scrollTo({ left: scrollX, top: scrollY, behavior: 'instant' })
    }
    releasePageScroll = undefined
  }
}

function open() {
  if (!dialog.value || dialog.value.open) return
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  lockPageScroll()
  try {
    dialog.value.showModal()
  } catch (error) {
    releasePageScroll?.()
    opener = null
    throw error
  }
  dialog.value.querySelector<HTMLInputElement>('[name="firstName"]')?.focus()
  dialog.value.scrollTop = 0
}

function onClosed() {
  if (dialog.value?.open) return
  releasePageScroll?.()
  if (opener?.isConnected) opener.focus({ preventScroll: true })
  opener = null
}

function close() {
  if (sending.value) return
  dialog.value?.close()
  onClosed()
}

function keepFocus(event: KeyboardEvent) {
  const controls = dialog.value?.querySelectorAll<HTMLElement>(
    ':is(button, input, select, textarea):not(:disabled)',
  )
  const first = controls?.[0]
  const last = controls?.[controls.length - 1]
  if (!first || !last) return

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

onBeforeUnmount(() => {
  dialog.value?.close()
  releasePageScroll?.()
})
defineExpose({ open, complete })
</script>

<template>
  <dialog
    ref="dialog"
    class="user-dialog"
    :aria-labelledby="id + '-title'"
    @cancel.prevent="close"
    @close="onClosed"
    @keydown.tab="keepFocus"
  >
    <header class="dialog-heading">
      <h2 :id="id + '-title'">{{ title }}</h2>
      <button
        type="button"
        class="close-button"
        aria-label="Cerrar formulario"
        :disabled="sending"
        @click="close"
      >
        <i class="bi bi-x-lg" aria-hidden="true"></i>
      </button>
    </header>

    <form
      autocomplete="off"
      novalidate
      :aria-busy="sending"
      @submit.prevent.stop="submit"
      @input="onEdit"
      @change="onEdit"
      @focusout="onBlur"
    >
      <p class="required-note">
        Los campos con <span class="required-marker">*</span> son obligatorios.
      </p>

      <p v-if="needsAddress && catalogsLoading" class="catalog-notice" role="status">
        {{
          isClient
            ? 'Cargando opciones de dirección…'
            : 'Cargando sucursales y opciones de dirección…'
        }}
        Puedes completar los demás campos.
      </p>
      <div v-else-if="needsAddress && catalogsError" class="catalog-notice">
        <p role="alert">{{ catalogsError }}</p>
        <button type="button" class="cancel-button" @click="retryCatalogs">Reintentar</button>
      </div>

      <div
        v-if="submissionErrors.length"
        ref="submission-feedback"
        class="catalog-notice"
        role="alert"
        tabindex="-1"
      >
        <p v-for="message in submissionErrors" :key="message">{{ message }}</p>
      </div>

      <fieldset v-for="group in groups" :key="group.label" :disabled="sending">
        <legend>{{ group.label }}</legend>
        <div class="field-grid">
          <div v-for="field in group.fields" :key="field.name" class="field">
            <label :for="id + '-' + field.name">
              {{ field.label }}
              <span v-if="field.required" class="required-marker" aria-hidden="true">*</span>
              <span v-else>(opcional)</span>
            </label>
            <input
              :id="id + '-' + field.name"
              v-model="draft[field.name]"
              :name="field.name"
              :type="field.type"
              class="form-control"
              :required="field.required"
              :aria-invalid="!!errors[field.name]"
              :aria-describedby="description(field.name)"
            />
            <p
              v-if="errors[field.name]"
              :id="id + '-' + field.name + '-error'"
              class="field-error"
              aria-live="polite"
            >
              {{ errors[field.name] }}
            </p>
          </div>
        </div>
      </fieldset>

      <fieldset v-if="!isClient" :disabled="sending">
        <legend>Rol y sucursal</legend>
        <div class="field-grid">
          <div class="field">
            <label :for="id + '-role'"
              >Rol <span class="required-marker" aria-hidden="true">*</span></label
            >
            <select
              :id="id + '-role'"
              v-model="draft.role"
              name="role"
              class="form-select"
              required
              :aria-invalid="!!errors.role"
              :aria-describedby="description('role')"
            >
              <option value="EMPLOYEE">Empleado</option>
              <option value="ADMINISTRATOR">Administrador</option>
            </select>
            <p v-if="errors.role" :id="id + '-role-error'" class="field-error" aria-live="polite">
              {{ errors.role }}
            </p>
          </div>
          <div class="field">
            <label :for="id + '-branchId'"
              >Sucursal <span class="required-marker" aria-hidden="true">*</span></label
            >
            <select
              :id="id + '-branchId'"
              v-model="draft.branchId"
              name="branchId"
              class="form-select"
              required
              :disabled="catalogsUnavailable || !branches.length"
              :aria-invalid="!!errors.branchId"
              :aria-describedby="description('branchId', !catalogsUnavailable && !branches.length)"
            >
              <option value="" disabled>
                {{
                  catalogPlaceholder ||
                  (branches.length ? 'Seleccione una sucursal' : 'Sin sucursales disponibles')
                }}
              </option>
              <option v-for="branch in branches" :key="branch.id" :value="branch.id">
                {{ branch.label }}
              </option>
            </select>
            <p
              v-if="!catalogsUnavailable && !branches.length"
              :id="id + '-branchId-help'"
              class="field-help"
            >
              Todavía no hay sucursales disponibles para seleccionar en esta vista.
            </p>
            <p
              v-if="errors.branchId"
              :id="id + '-branchId-error'"
              class="field-error"
              aria-live="polite"
            >
              {{ errors.branchId }}
            </p>
          </div>
        </div>
      </fieldset>

      <fieldset v-if="isClient" :disabled="sending">
        <legend>Preferencias</legend>
        <div class="field-grid">
          <div class="field">
            <label :for="id + '-language'">Idioma</label>
            <select
              :id="id + '-language'"
              v-model="draft.language"
              name="language"
              class="form-select"
              :aria-invalid="!!errors.language"
              :aria-describedby="description('language')"
            >
              <option value="es">Español</option>
              <option value="en">Inglés</option>
            </select>
            <p
              v-if="errors.language"
              :id="id + '-language-error'"
              class="field-error"
              aria-live="polite"
            >
              {{ errors.language }}
            </p>
          </div>
        </div>
      </fieldset>

      <label v-if="isClient" class="address-toggle" :for="id + '-address-enabled'">
        <input
          :id="id + '-address-enabled'"
          v-model="addressEnabled"
          type="checkbox"
          :disabled="sending"
        />
        Añadir dirección (opcional)
      </label>

      <fieldset v-if="needsAddress" :disabled="sending">
        <legend>Dirección</legend>
        <div class="field-grid">
          <div class="field">
            <label :for="id + '-provinceId'"
              >Provincia <span class="required-marker" aria-hidden="true">*</span></label
            >
            <select
              :id="id + '-provinceId'"
              v-model="draft.provinceId"
              name="provinceId"
              class="form-select"
              required
              :disabled="catalogsUnavailable || !provinces.length"
              :aria-invalid="!!errors.provinceId"
              :aria-describedby="
                description('provinceId', !catalogsUnavailable && !provinces.length)
              "
            >
              <option value="" disabled>
                {{
                  catalogPlaceholder ||
                  (provinces.length ? 'Seleccione una provincia' : 'Sin provincias disponibles')
                }}
              </option>
              <option v-for="province in provinces" :key="province.id" :value="province.id">
                {{ province.label }}
              </option>
            </select>
            <p
              v-if="!catalogsUnavailable && !provinces.length"
              :id="id + '-provinceId-help'"
              class="field-help"
            >
              Todavía no hay provincias disponibles para seleccionar en esta vista.
            </p>
            <p
              v-if="errors.provinceId"
              :id="id + '-provinceId-error'"
              class="field-error"
              aria-live="polite"
            >
              {{ errors.provinceId }}
            </p>
          </div>
          <div class="field">
            <label :for="id + '-cantonId'"
              >Cantón <span class="required-marker" aria-hidden="true">*</span></label
            >
            <select
              :id="id + '-cantonId'"
              v-model="draft.cantonId"
              name="cantonId"
              class="form-select"
              required
              :disabled="catalogsUnavailable || draft.provinceId === '' || !availableCantons.length"
              :aria-invalid="!!errors.cantonId"
              :aria-describedby="description('cantonId', !!cantonHelp)"
            >
              <option value="" disabled>{{ catalogPlaceholder || 'Seleccione un cantón' }}</option>
              <option v-for="canton in availableCantons" :key="canton.id" :value="canton.id">
                {{ canton.label }}
              </option>
            </select>
            <p v-if="cantonHelp" :id="id + '-cantonId-help'" class="field-help">{{ cantonHelp }}</p>
            <p
              v-if="errors.cantonId"
              :id="id + '-cantonId-error'"
              class="field-error"
              aria-live="polite"
            >
              {{ errors.cantonId }}
            </p>
          </div>
          <div class="field">
            <label :for="id + '-districtId'"
              >Distrito <span class="required-marker" aria-hidden="true">*</span></label
            >
            <select
              :id="id + '-districtId'"
              v-model="draft.districtId"
              name="districtId"
              class="form-select"
              required
              :disabled="catalogsUnavailable || draft.cantonId === '' || !availableDistricts.length"
              :aria-invalid="!!errors.districtId"
              :aria-describedby="description('districtId', !!districtHelp)"
            >
              <option value="" disabled>
                {{ catalogPlaceholder || 'Seleccione un distrito' }}
              </option>
              <option
                v-for="district in availableDistricts"
                :key="district.id"
                :value="district.id"
              >
                {{ district.label }}
              </option>
            </select>
            <p v-if="districtHelp" :id="id + '-districtId-help'" class="field-help">
              {{ districtHelp }}
            </p>
            <p
              v-if="errors.districtId"
              :id="id + '-districtId-error'"
              class="field-error"
              aria-live="polite"
            >
              {{ errors.districtId }}
            </p>
          </div>
          <div class="field full-width">
            <label :for="id + '-details'">Detalle de dirección (opcional)</label>
            <textarea
              :id="id + '-details'"
              v-model="draft.details"
              name="details"
              class="form-control"
              rows="3"
              :aria-invalid="!!errors.details"
              :aria-describedby="description('details', true)"
            ></textarea>
            <p :id="id + '-details-help'" class="field-help">
              Escribe las señas u otras referencias de la dirección.
            </p>
            <p
              v-if="errors.details"
              :id="id + '-details-error'"
              class="field-error"
              aria-live="polite"
            >
              {{ errors.details }}
            </p>
          </div>
        </div>
      </fieldset>

      <p class="password-note">
        El sistema generará la contraseña inicial y la enviará por correo al crear la cuenta.
      </p>
      <p v-if="sending" role="status">
        Creando la cuenta y solicitando el envío del correo. Espera el resultado antes de salir.
      </p>
      <footer class="form-actions">
        <button type="button" class="cancel-button" :disabled="sending" @click="close">
          {{ submissionBlocked ? 'Cerrar' : 'Cancelar' }}
        </button>
        <button
          type="submit"
          class="create-button"
          :disabled="sending || submissionBlocked || requiredCatalogsUnavailable"
        >
          {{ sending ? 'Creando usuario…' : isClient ? 'Crear cliente' : 'Crear usuario' }}
        </button>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
.user-dialog {
  width: min(880px, calc(100% - 32px));
  max-width: none;
  max-height: calc(100dvh - 32px);
  padding: 0;
  border: 0;
  border-radius: var(--radius-medium);
  color: var(--color-dark);
  background: var(--color-background);
  overflow: hidden;
}

.user-dialog[open] {
  display: flex;
  flex-direction: column;
}

.user-dialog::backdrop {
  background: color-mix(in srgb, var(--color-black) 55%, transparent);
}

.dialog-heading {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 24px;
  color: var(--color-white);
  background: var(--color-primary);
}

.dialog-heading h2 {
  margin: 0;
  font-size: 1.25rem;
}

.close-button {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: var(--radius-small);
  color: inherit;
  background: transparent;
}

.close-button:hover {
  background: color-mix(in srgb, var(--color-white) 15%, transparent);
}

.close-button:focus-visible {
  outline: 2px solid var(--color-cream);
  outline-offset: 2px;
}

form {
  min-height: 0;
  padding: 24px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.required-note,
.field-help,
.password-note,
.preview-note {
  font-size: 0.875rem;
}

fieldset {
  min-width: 0;
  margin-bottom: 24px;
}

legend {
  margin-bottom: 16px;
  font-size: 1rem;
  font-weight: 700;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 20px;
}

.field {
  min-width: 0;
}

.full-width {
  grid-column: 1 / -1;
}

label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
}

.address-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  margin-bottom: 24px;
}

.address-toggle input {
  width: 20px;
  height: 20px;
  accent-color: var(--color-primary);
}

.form-control,
.form-select {
  min-width: 0;
  min-height: 44px;
}

.field-help,
.field-error {
  margin: 8px 0 0;
  overflow-wrap: anywhere;
}

.required-marker {
  color: var(--bs-danger, #dc3545);
  font-weight: 700;
}

.field-error {
  color: var(--bs-danger-text-emphasis, #b02a37);
  font-size: 0.875rem;
}

.form-control[aria-invalid='true'],
.form-select[aria-invalid='true'] {
  border-color: var(--bs-danger, #dc3545);
}

textarea {
  resize: vertical;
}

.form-control:focus,
.form-select:focus {
  border-color: var(--color-primary);
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  box-shadow: none;
}

.preview-note,
.catalog-notice {
  padding: 12px;
  border-left: 3px solid var(--color-primary);
  background: var(--color-white);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

.cancel-button,
.create-button {
  min-height: 44px;
  padding: 10px 20px;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-small);
}

.cancel-button {
  color: var(--color-primary);
  background: var(--color-white);
}

.cancel-button:hover {
  background: var(--color-light_gray);
}

.cancel-button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.create-button:disabled {
  border-color: var(--color-light_gray);
  color: var(--color-dark);
  background: var(--color-light_gray);
  cursor: not-allowed;
}

@media (max-width: 575px) {
  .dialog-heading {
    padding: 12px 16px;
  }

  form {
    padding: 20px 16px;
  }

  .field-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .form-actions {
    flex-direction: column-reverse;
  }
}
</style>
