<script setup lang="ts">
import { computed, nextTick, reactive, useId, useTemplateRef } from 'vue'
import type {
  CreateTheaterRequest,
  TheaterCinema,
  TheaterProjector,
  TheaterStatus,
  Theater,
} from '@/types/theater'

const props = withDefaults(
  defineProps<{
    theater?: Theater | null
    projectors?: readonly TheaterProjector[]
    cinemas?: readonly TheaterCinema[]
    optionsLoading?: boolean
    optionsError?: string
    submitting?: boolean
    submissionErrors?: readonly string[]
  }>(),
  {
    projectors: () => [],
    cinemas: () => [],
    optionsLoading: false,
    optionsError: '',
    submitting: false,
    submissionErrors: () => [],
  },
)
const emit = defineEmits<{
  retryOptions: []
  submit: [data: CreateTheaterRequest]
}>()

const id = useId()
const editing = computed(() => !!props.theater)
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const feedback = useTemplateRef<HTMLElement>('feedback')
const draft = reactive({
  numberOfSeats: '',
  dimensionX: '',
  dimensionY: '',
  projectorName: '',
  branchId: '',
  status: 'Disponible' as TheaterStatus,
})
const errors = reactive<Record<string, string>>({})
let opener: HTMLElement | null = null

function validate() {
  for (const key of Object.keys(errors)) delete errors[key]
  const seats = Number(draft.numberOfSeats)
  const dimensionX = Number(draft.dimensionX)
  const dimensionY = Number(draft.dimensionY)
  if (!Number.isInteger(seats) || seats < 1 || seats >= 5000)
    errors.numberOfSeats = 'Introduce un número entero entre 1 y 4999.'
  if (!Number.isInteger(dimensionX) || dimensionX < 1)
    errors.dimensionX = 'Introduce una dimensión válida.'
  if (!Number.isInteger(dimensionY) || dimensionY < 1)
    errors.dimensionY = 'Introduce una dimensión válida.'
  if (
    Number.isInteger(seats) &&
    Number.isInteger(dimensionX) &&
    Number.isInteger(dimensionY) &&
    seats >= 1 &&
    dimensionX >= 1 &&
    dimensionY >= 1 &&
    seats !== dimensionX * dimensionY
  )
    errors.numberOfSeats = 'El número de asientos debe ser igual a Dimensión X por Dimensión Y.'
  if (!props.projectors.some((item) => item.name === draft.projectorName))
    errors.projectorName = 'Selecciona un tipo de proyector.'
  if (!props.cinemas.some((item) => String(item.branchId) === String(draft.branchId)))
    errors.branchId = 'Selecciona una sucursal.'
  return Object.keys(errors).length === 0
}

function submit() {
  if (props.submitting || props.optionsLoading) return
  if (!validate()) {
    void nextTick(() => dialog.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
    return
  }
  emit('submit', {
    numberOfSeats: Number(draft.numberOfSeats),
    dimensionX: Number(draft.dimensionX),
    dimensionY: Number(draft.dimensionY),
    projectorName: draft.projectorName,
    branchId: Number(draft.branchId),
    status: draft.status,
  })
}

function reset() {
  Object.assign(draft, {
    numberOfSeats: '',
    dimensionX: '',
    dimensionY: '',
    projectorName: '',
    branchId: '',
    status: 'Disponible',
  })
  for (const key of Object.keys(errors)) delete errors[key]
}

function populate() {
  if (!props.theater) {
    reset()
    return
  }
  Object.assign(draft, {
    numberOfSeats: String(props.theater.numberOfSeats),
    dimensionX: String(props.theater.dimensionX),
    dimensionY: String(props.theater.dimensionY),
    projectorName: props.theater.projectorName,
    branchId: String(props.theater.branchId),
    status: props.theater.status,
  })
  for (const key of Object.keys(errors)) delete errors[key]
}

function open() {
  if (!dialog.value || dialog.value.open) return
  populate()
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  dialog.value.showModal()
  dialog.value.querySelector<HTMLInputElement>('[name="numberOfSeats"]')?.focus()
}

function close() {
  if (props.submitting) return
  dialog.value?.close()
  if (opener?.isConnected) opener.focus()
  opener = null
}

function complete() {
  reset()
  dialog.value?.close()
  if (opener?.isConnected) opener.focus()
  opener = null
}

function firstError(field: string) {
  return errors[field] ? `${id}-${field}-error` : undefined
}

defineExpose({ open, complete })
</script>

<template>
  <dialog ref="dialog" class="theater-dialog" :aria-labelledby="id + '-title'" @cancel.prevent="close">
    <header class="dialog-heading">
      <h2 :id="id + '-title'">{{ editing ? 'Modificar sala' : 'Crear sala' }}</h2>
      <button type="button" class="close-button" aria-label="Cerrar formulario" :disabled="submitting" @click="close">
        <i class="bi bi-x-lg" aria-hidden="true"></i>
      </button>
    </header>
    <form novalidate :aria-busy="submitting" @submit.prevent="submit">
      <p class="required-note">Los campos con <span class="required-marker">*</span> son obligatorios.</p>
      <p v-if="optionsLoading" role="status">Cargando proyectores y sucursales…</p>
      <p v-if="optionsError" class="form-error" role="alert">{{ optionsError }} <button type="button" @click="emit('retryOptions')">Reintentar</button></p>
      <p v-if="submissionErrors.length" ref="feedback" class="form-error" role="alert" tabindex="-1">{{ submissionErrors.join(' ') }}</p>

      <label :for="id + '-seats'">Número de asientos <span class="required-marker">*</span></label>
      <input :id="id + '-seats'" v-model="draft.numberOfSeats" name="numberOfSeats" type="number" min="1" max="4999" step="1" required :aria-invalid="!!errors.numberOfSeats" :aria-describedby="firstError('numberOfSeats')" />
      <small v-if="errors.numberOfSeats" :id="id + '-numberOfSeats-error'" class="field-error">{{ errors.numberOfSeats }}</small>

      <label :for="id + '-projector'">Tipo de proyector <span class="required-marker">*</span></label>
      <select :id="id + '-projector'" v-model="draft.projectorName" name="projectorName" required :aria-invalid="!!errors.projectorName">
        <option value="">Selecciona un proyector</option>
        <option v-for="projector in projectors" :key="projector.projectorId" :value="projector.name">{{ projector.name }}</option>
      </select>
      <small v-if="errors.projectorName" class="field-error">{{ errors.projectorName }}</small>

      <label :for="id + '-branch'">Sucursal <span class="required-marker">*</span></label>
      <select :id="id + '-branch'" v-model="draft.branchId" name="branchId" required :aria-invalid="!!errors.branchId">
        <option value="">Selecciona una sucursal</option>
        <option v-for="cinema in cinemas" :key="cinema.branchId" :value="cinema.branchId">{{ cinema.name }}</option>
      </select>
      <small v-if="errors.branchId" class="field-error">{{ errors.branchId }}</small>

      <div class="dimension-grid">
        <div>
          <label :for="id + '-dimension-x'">Dimensión X <span class="required-marker">*</span></label>
          <input :id="id + '-dimension-x'" v-model="draft.dimensionX" name="dimensionX" type="number" min="1" step="1" required :aria-invalid="!!errors.dimensionX" />
          <small v-if="errors.dimensionX" class="field-error">{{ errors.dimensionX }}</small>
        </div>
        <div>
          <label :for="id + '-dimension-y'">Dimensión Y <span class="required-marker">*</span></label>
          <input :id="id + '-dimension-y'" v-model="draft.dimensionY" name="dimensionY" type="number" min="1" step="1" required :aria-invalid="!!errors.dimensionY" />
          <small v-if="errors.dimensionY" class="field-error">{{ errors.dimensionY }}</small>
        </div>
      </div>

      <label :for="id + '-status'">Estado</label>
      <select :id="id + '-status'" v-model="draft.status" name="status">
        <option value="Disponible">Disponible</option>
        <option value="En función">En función</option>
      </select>

      <footer class="dialog-actions">
        <button type="button" class="secondary-button" :disabled="submitting" @click="close">Cancelar</button>
        <button type="submit" class="create-button" :disabled="submitting || optionsLoading">{{ submitting ? 'Creando…' : 'Crear sala' }}</button>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
.theater-dialog { position: fixed; top: 50%; left: 50%; width: min(calc(100% - 32px), 620px); max-height: min(90dvh, 760px); margin: 0; padding: 0; border: 0; border-radius: var(--radius-medium); color: var(--color-dark); background: var(--color-white); transform: translate(-50%, -50%); }
.theater-dialog::backdrop { background: color-mix(in srgb, var(--color-black) 55%, transparent); }
.dialog-heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 20px 24px; color: var(--color-white); background: var(--color-primary); }
.dialog-heading h2 { margin: 0; font-size: 1.25rem; }
.close-button { display: grid; place-items: center; width: 40px; height: 40px; border: 0; border-radius: var(--radius-small); color: inherit; background: transparent; }
form { display: grid; gap: 8px; padding: 24px; overflow-y: auto; }
.required-note { margin: 0 0 4px; font-size: .9rem; }
.required-marker { color: #b42318; font-weight: 700; }
input, select { min-height: 42px; padding: 8px 10px; border: 1px solid #a9adb5; border-radius: var(--radius-small); font: inherit; background: var(--color-white); }
input:focus, select:focus { outline: 2px solid var(--color-primary); outline-offset: 1px; }
.field-error, .form-error { color: #b42318; }
.field-error { margin-bottom: 4px; }
.form-error { margin: 0; }
.form-error button { border: 0; color: var(--color-primary); background: transparent; text-decoration: underline; }
.dimension-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 8px; }
.dimension-grid > div { display: grid; gap: 8px; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 16px; }
.secondary-button, .create-button { min-height: 42px; padding: 9px 16px; border: 1px solid var(--color-primary); border-radius: var(--radius-small); font: inherit; }
.secondary-button { color: var(--color-primary); background: var(--color-white); }
.create-button { color: var(--color-white); background: var(--color-primary); }
@media (max-width: 520px) { .dimension-grid { grid-template-columns: 1fr; } form { padding: 20px 16px; } }
</style>
