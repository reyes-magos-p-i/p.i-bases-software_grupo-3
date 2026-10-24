<script setup lang="ts">
import { computed, reactive, ref, useId, watch } from 'vue'
import ConfirmationDialog from '@/components/common/ConfirmationDialog.vue'
import type {
  ClientAddressOptions,
  ClientProfile,
  ClientProfileUpdate,
} from '@/types/client-profile'
import {
  characterCount,
  normalizeMobile,
  validMobile,
  validName,
  validText,
} from '@/utils/user-validation'

const props = defineProps<{
  profile: ClientProfile
  options: ClientAddressOptions
  pending?: boolean
}>()
const emit = defineEmits<{
  save: [changes: ClientProfileUpdate]
  cancel: []
  dirty: [dirty: boolean]
}>()
const id = useId()
const names = [
  { key: 'firstName', label: 'Primer nombre' },
  { key: 'secondName', label: 'Segundo nombre' },
  { key: 'firstSurname', label: 'Primer apellido' },
  { key: 'secondSurname', label: 'Segundo apellido' },
] as const
const form = reactive({
  firstName: props.profile.firstName,
  secondName: props.profile.secondName ?? '',
  firstSurname: props.profile.firstSurname ?? '',
  secondSurname: props.profile.secondSurname ?? '',
  phoneNumber: props.profile.phoneNumber ?? '',
  gender: props.profile.gender ?? '',
  hasAddress: Boolean(props.profile.address),
  provinceId: props.profile.address?.provinceId ?? '',
  cantonId: props.profile.address?.cantonId ?? '',
  districtId: props.profile.address?.districtId ?? '',
  details: props.profile.address?.details ?? '',
})
const initial = JSON.stringify(form)
const dirty = computed(() => JSON.stringify(form) !== initial)
watch(dirty, (value) => emit('dirty', value), { immediate: true })
const errors = reactive<Record<string, string>>({})
const confirming = ref(false)
const pendingChanges = ref<ClientProfileUpdate>({})
const cantons = computed(() =>
  props.options.cantons.filter((item) => item.provinceId === Number(form.provinceId)),
)
const districts = computed(() =>
  props.options.districts.filter((item) => item.cantonId === Number(form.cantonId)),
)

function changedName(key: (typeof names)[number]['key']) {
  return form[key].trim() !== (props.profile[key] ?? '')
}
function validateName(key: (typeof names)[number]['key']) {
  delete errors[key]
  if (!changedName(key)) return
  const value = form[key].trim()
  if (key === 'firstName' && !value) errors[key] = 'Escribe tu primer nombre.'
  else if (value && !validName(value))
    errors[key] = 'Usa solo letras y espacios, sin números ni símbolos.'
  else if (!validText(value, 100))
    errors[key] = 'El nombre es demasiado largo. Usa una versión más corta.'
}
function validatePhone() {
  delete errors.phoneNumber
  if (
    form.phoneNumber.trim() &&
    !validMobile(form.phoneNumber) &&
    form.phoneNumber !== (props.profile.phoneNumber ?? '')
  )
    errors.phoneNumber =
      'Escribe un celular de Costa Rica de 8 dígitos que empiece con 6, 7 u 8. Puedes incluir +506.'
}
function validateDetails() {
  delete errors.details
  if (form.hasAddress && !validText(form.details, 255))
    errors.details = 'El detalle de la dirección es demasiado largo. Acórtalo.'
}
function clearError(key: string) {
  delete errors[key]
  delete errors.form
}
function changeProvince() {
  form.cantonId = ''
  changeCanton()
}
function changeCanton() {
  form.districtId = ''
  clearLocation()
}
function clearLocation() {
  delete errors.districtId
  delete errors.details
}
function validateAddress() {
  clearLocation()
  if (!form.hasAddress) return
  if (!districts.value.some((item) => item.id === Number(form.districtId)))
    errors.districtId = 'Selecciona una provincia, un cantón y un distrito válidos.'
  validateDetails()
}
function buildChanges(): ClientProfileUpdate {
  const changes: ClientProfileUpdate = {}
  for (const { key } of names) {
    if (changedName(key)) Object.assign(changes, { [key]: form[key].trim() || null })
  }
  const mobile = normalizeMobile(form.phoneNumber) || null
  if (mobile !== props.profile.phoneNumber) changes.phoneNumber = mobile
  if (form.gender !== (props.profile.gender ?? ''))
    changes.gender = (form.gender || null) as ClientProfileUpdate['gender']
  const address = form.hasAddress
    ? { districtId: Number(form.districtId), details: form.details.trim() || null }
    : null
  const oldAddress = props.profile.address
    ? { districtId: props.profile.address.districtId, details: props.profile.address.details }
    : null
  if (JSON.stringify(address) !== JSON.stringify(oldAddress)) changes.address = address
  return changes
}
function submit() {
  if (props.pending) return
  delete errors.form
  for (const { key } of names) validateName(key)
  validatePhone()
  validateAddress()
  delete errors.gender
  if (!['', 'M', 'F', 'O', 'N'].includes(form.gender))
    errors.gender = 'Selecciona una opción de género válida.'
  if (Object.keys(errors).length) return
  pendingChanges.value = buildChanges()
  if (!Object.keys(pendingChanges.value).length) {
    errors.form = 'No hay cambios para guardar.'
    return
  }
  delete errors.form
  confirming.value = true
}
function confirm() {
  if (props.pending) return
  confirming.value = false
  emit('save', pendingChanges.value)
}
</script>

<template>
  <form novalidate @submit.prevent="submit">
    <fieldset :disabled="pending">
      <legend>Editar mis datos</legend>
      <div class="profile-fields">
        <div v-for="field in names" :key="field.key" class="field">
          <label :for="`${id}-${field.key}`"
            >{{ field.label }}{{ field.key === 'firstName' ? ' *' : '' }}</label
          >
          <input
            :id="`${id}-${field.key}`"
            v-model="form[field.key]"
            :name="field.key"
            :autocomplete="
              field.key === 'firstName'
                ? 'given-name'
                : field.key === 'firstSurname'
                  ? 'family-name'
                  : 'off'
            "
            :aria-invalid="Boolean(errors[field.key])"
            :aria-describedby="`${id}-${field.key}-error`"
            @input="clearError(field.key)"
            @blur="validateName(field.key)"
          />
          <p :id="`${id}-${field.key}-error`" class="field-error" aria-live="polite">
            {{ errors[field.key] }}
          </p>
        </div>
        <div class="field">
          <label :for="`${id}-phone`">Celular</label>
          <input
            :id="`${id}-phone`"
            v-model="form.phoneNumber"
            name="phoneNumber"
            type="tel"
            autocomplete="tel"
            :aria-invalid="Boolean(errors.phoneNumber)"
            :aria-describedby="`${id}-phone-error`"
            @input="delete errors.phoneNumber"
            @blur="validatePhone"
          />
          <p :id="`${id}-phone-error`" class="field-error" aria-live="polite">
            {{ errors.phoneNumber }}
          </p>
        </div>
        <div class="field">
          <label :for="`${id}-gender`">Género (opcional)</label>
          <select
            :id="`${id}-gender`"
            v-model="form.gender"
            name="gender"
            @change="delete errors.gender"
          >
            <option value="">Sin especificar</option>
            <option value="F">Femenino</option>
            <option value="M">Masculino</option>
            <option value="O">Otro</option>
            <option value="N">Prefiero no decirlo</option>
          </select>
          <p v-if="errors.gender" class="field-error" role="alert">{{ errors.gender }}</p>
        </div>
      </div>
      <label class="address-toggle"
        ><input
          v-model="form.hasAddress"
          name="hasAddress"
          type="checkbox"
          @change="clearLocation"
        />
        Incluir dirección</label
      >
      <div v-if="form.hasAddress" class="profile-fields">
        <div class="field">
          <label :for="`${id}-province`">Provincia</label
          ><select
            :id="`${id}-province`"
            v-model="form.provinceId"
            name="provinceId"
            @change="changeProvince"
          >
            <option value="">Selecciona una provincia</option>
            <option v-for="option in options.provinces" :key="option.id" :value="option.id">
              {{ option.label }}
            </option>
          </select>
        </div>
        <div class="field">
          <label :for="`${id}-canton`">Cantón</label
          ><select
            :id="`${id}-canton`"
            v-model="form.cantonId"
            name="cantonId"
            :disabled="!form.provinceId"
            @change="changeCanton"
          >
            <option value="">Selecciona un cantón</option>
            <option v-for="option in cantons" :key="option.id" :value="option.id">
              {{ option.label }}
            </option>
          </select>
        </div>
        <div class="field">
          <label :for="`${id}-district`">Distrito</label
          ><select
            :id="`${id}-district`"
            v-model="form.districtId"
            name="districtId"
            :disabled="!form.cantonId"
            :aria-invalid="Boolean(errors.districtId)"
            :aria-describedby="`${id}-district-error`"
            @change="delete errors.districtId"
            @blur="validateAddress"
          >
            <option value="">Selecciona un distrito</option>
            <option v-for="option in districts" :key="option.id" :value="option.id">
              {{ option.label }}
            </option>
          </select>
          <p :id="`${id}-district-error`" class="field-error" aria-live="polite">
            {{ errors.districtId }}
          </p>
        </div>
        <div class="field details">
          <label :for="`${id}-details`">Detalle de la dirección</label
          ><textarea
            :id="`${id}-details`"
            v-model="form.details"
            name="details"
            rows="3"
            :aria-invalid="Boolean(errors.details)"
            :aria-describedby="`${id}-details-error`"
            @input="delete errors.details"
            @blur="validateDetails"
          ></textarea
          ><span class="counter">{{ characterCount(form.details) }}/255</span>
          <p :id="`${id}-details-error`" class="field-error" aria-live="polite">
            {{ errors.details }}
          </p>
        </div>
      </div>
      <p v-if="errors.form" class="field-error" role="alert">{{ errors.form }}</p>
      <div class="actions">
        <button type="button" @click="emit('cancel')">Cancelar</button
        ><button type="submit" class="primary" :disabled="!dirty || pending">
          {{ pending ? 'Guardando…' : 'Guardar cambios' }}
        </button>
      </div>
    </fieldset>
    <ConfirmationDialog
      :open="confirming"
      title="Confirmar cambios"
      message="¿Deseas guardar los cambios de tus datos personales?"
      confirm-label="Guardar cambios"
      :pending="pending"
      @cancel="confirming = false"
      @confirm="confirm"
    />
  </form>
</template>

<style scoped>
fieldset {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
legend {
  font-size: 1.4rem;
  font-weight: 700;
  margin-bottom: 1.5rem;
}
.profile-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem 1.5rem;
}
.field {
  min-width: 0;
}
label {
  display: block;
  margin-bottom: 0.4rem;
  font-weight: 600;
}
input:not([type='checkbox']),
select,
textarea {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-small);
  background: var(--input-background);
  color: var(--text-primary);
  padding: 0.65rem 0.75rem;
}
textarea {
  resize: vertical;
}
[aria-invalid='true'] {
  border-color: var(--error-color);
}
.field-error {
  margin: 0.35rem 0 0;
  color: var(--error-color);
  font-size: 0.875rem;
}
.address-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 1.5rem 0 1rem;
  min-height: 44px;
}
input[type='checkbox'] {
  accent-color: var(--primary-color);
  width: 18px;
  height: 18px;
}
.counter {
  display: block;
  text-align: right;
  color: var(--text-secondary);
  font-size: 0.85rem;
}
.details {
  grid-column: 1 / -1;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.5rem;
}
button {
  min-height: 44px;
  padding: 0.65rem 1rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-small);
  color: var(--button-secondary-text);
  background: var(--button-secondary-background);
}
.primary {
  background: var(--button-confirm-background);
  color: var(--button-confirm-text);
  border-color: transparent;
}
:disabled {
  opacity: 0.65;
}
:focus-visible {
  outline: 2px solid var(--focus-color);
  outline-offset: 2px;
}
@media (max-width: 520px) {
  .profile-fields {
    grid-template-columns: 1fr;
  }
}
</style>
