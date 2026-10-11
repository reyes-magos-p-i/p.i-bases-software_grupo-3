<script setup lang="ts">
import { nextTick, useTemplateRef } from 'vue'
import FormField from './FormField.vue'
import { MAX_SEATS, useTheaterForm } from '@/composables/useTheaterForm'
import type {
  CreateTheaterRequest,
  TheaterCinema,
  TheaterProjector,
} from '@/types/theater'

const props = withDefaults(
  defineProps<{
    submitLabel: string
    submittingLabel: string
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
  cancel: []
  submit: [data: CreateTheaterRequest]
}>()

const form = useTheaterForm()
const { draft, errors } = form
const element = useTemplateRef<HTMLFormElement>('form')

function submit() {
  if (props.submitting || props.optionsLoading) return
  if (!form.validate(props.projectors, props.cinemas)) {
    void nextTick(() => element.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
    return
  }
  emit('submit', form.toRequest())
}

defineExpose({ reset: form.reset, fill: form.fill })
</script>

<template>
  <form ref="form" novalidate :aria-busy="submitting" @submit.prevent="submit">
    <p class="required-note">Los campos con <span class="required-marker">*</span> son obligatorios.</p>
    <p v-if="optionsLoading" role="status">Cargando proyectores y sucursales…</p>
    <p v-if="optionsError" class="form-error" role="alert">{{ optionsError }} <button type="button" @click="emit('retryOptions')">Reintentar</button></p>
    <p v-if="submissionErrors.length" class="form-error" role="alert" tabindex="-1">{{ submissionErrors.join(' ') }}</p>

    <FormField v-slot="{ id, invalid, describedby }" label="Número de asientos" required :error="errors.numberOfSeats">
      <input :id="id" v-model="draft.numberOfSeats" name="numberOfSeats" type="number" min="1" :max="MAX_SEATS" step="1" required :aria-invalid="invalid" :aria-describedby="describedby" />
    </FormField>

    <FormField v-slot="{ id, invalid, describedby }" label="Tipo de proyector" required :error="errors.projectorName">
      <select :id="id" v-model="draft.projectorName" name="projectorName" required :aria-invalid="invalid" :aria-describedby="describedby">
        <option value="">Selecciona un proyector</option>
        <option v-for="projector in projectors" :key="projector.projectorId" :value="projector.name">{{ projector.name }}</option>
      </select>
    </FormField>

    <FormField v-slot="{ id, invalid, describedby }" label="Sucursal" required :error="errors.cinema">
      <select :id="id" v-model="draft.cinema" name="cinema" required :aria-invalid="invalid" :aria-describedby="describedby">
        <option value="">Selecciona una sucursal</option>
        <option v-for="cinema in cinemas" :key="cinema.branchId" :value="cinema.name">{{ cinema.name }}</option>
      </select>
    </FormField>

    <div class="dimension-grid">
      <FormField v-slot="{ id, invalid, describedby }" label="Filas" required :error="errors.dimensionX">
        <input :id="id" v-model="draft.dimensionX" name="dimensionX" type="number" min="1" step="1" required :aria-invalid="invalid" :aria-describedby="describedby" />
      </FormField>
      <FormField v-slot="{ id, invalid, describedby }" label="Columnas" required :error="errors.dimensionY">
        <input :id="id" v-model="draft.dimensionY" name="dimensionY" type="number" min="1" step="1" required :aria-invalid="invalid" :aria-describedby="describedby" />
      </FormField>
    </div>

    <FormField v-slot="{ id, invalid, describedby }" label="Estado" :error="errors.status">
      <select :id="id" v-model="draft.status" name="status" :aria-invalid="invalid" :aria-describedby="describedby">
        <option value="Disponible">Disponible</option>
        <option value="En función">En función</option>
      </select>
    </FormField>

    <footer class="dialog-actions">
      <button type="button" class="secondary-button" :disabled="submitting" @click="emit('cancel')">Cancelar</button>
      <button type="submit" class="create-button" :disabled="submitting || optionsLoading">{{ submitting ? submittingLabel : submitLabel }}</button>
    </footer>
  </form>
</template>

<style scoped>
form { display: grid; gap: 8px; padding: 24px; overflow-y: auto; }
.required-note { margin: 0 0 4px; font-size: .9rem; }
.required-marker { color: var(--color-error); font-weight: 700; }
input, select { min-height: 42px; padding: 8px 10px; border: 1px solid #a9adb5; border-radius: var(--radius-small); font: inherit; background: var(--color-white); }
input[type='number'] { color-scheme: light; }
input[type='number']::-webkit-inner-spin-button,
input[type='number']::-webkit-outer-spin-button { filter: invert(0.55); }
input:focus, select:focus { outline: 2px solid var(--color-primary); outline-offset: 1px; }
.form-error { margin: 0; color: var(--color-error); }
.form-error button { border: 0; color: var(--color-primary); background: transparent; text-decoration: underline; }
.dimension-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 8px; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 16px; }
.secondary-button, .create-button { min-height: 42px; padding: 9px 16px; border: 1px solid var(--color-primary); border-radius: var(--radius-small); font: inherit; }
.secondary-button { color: var(--color-primary); background: var(--color-white); }
.create-button { color: var(--color-white); background: var(--color-primary); }
@media (max-width: 520px) { .dimension-grid { grid-template-columns: 1fr; } form { padding: 20px 16px; } }
</style>
