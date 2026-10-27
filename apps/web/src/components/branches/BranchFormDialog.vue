<script setup lang="ts">
import { computed, nextTick, reactive, ref, useTemplateRef, watch } from 'vue'
import TheaterDialogShell from '@/components/theaters/TheaterDialogShell.vue'
import FormField from '@/components/theaters/FormField.vue'
import {
  normalizeBranchName,
  validateBranchForm,
  type BranchFormErrors,
} from '@/utils/branch-validation'
import type { BranchRequest, CompanyOption } from '@/types/branch'

const props = withDefaults(
  defineProps<{
    companies?: readonly CompanyOption[]
    companiesLoading?: boolean
    companiesError?: boolean
    submitting?: boolean
    /** Message of a failed save; the form keeps what was typed. */
    submissionError?: string
    /** Field messages returned by the API for a rejected save. */
    submissionFieldErrors?: BranchFormErrors
  }>(),
  {
    companies: () => [],
    companiesLoading: false,
    companiesError: false,
    submitting: false,
    submissionError: '',
    submissionFieldErrors: () => ({}),
  },
)
const emit = defineEmits<{ close: []; retryCompanies: []; submit: [data: BranchRequest] }>()

const shell = useTemplateRef('shell')
const form = useTemplateRef<HTMLFormElement>('form')
const draft = reactive<{ name: string; companyId: number | '' }>({ name: '', companyId: '' })
const errors = ref<BranchFormErrors>({})
// A company without a name cannot be told apart, so it is not offered.
const companyOptions = computed(() =>
  props.companies.filter((company): company is CompanyOption & { name: string } => !!company.name),
)

watch(
  () => props.submissionFieldErrors,
  (fieldErrors) => {
    if (fieldErrors.name || fieldErrors.companyId) errors.value = { ...fieldErrors }
  },
)
watch(
  () => draft.name,
  () => (errors.value = { ...errors.value, name: undefined }),
)
watch(
  () => draft.companyId,
  () => (errors.value = { ...errors.value, companyId: undefined }),
)

function reset() {
  draft.name = ''
  draft.companyId = ''
  errors.value = {}
}

function open() {
  reset()
  shell.value?.open()
}

function close() {
  if (props.submitting) return
  shell.value?.close()
  emit('close')
}

function complete() {
  reset()
  shell.value?.close()
}

function submit() {
  if (props.submitting) return
  errors.value = validateBranchForm(draft.name, draft.companyId)
  if (errors.value.name || errors.value.companyId || draft.companyId === '') {
    void nextTick(() => form.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
    return
  }
  emit('submit', { name: normalizeBranchName(draft.name), companyId: draft.companyId })
}

defineExpose({ open, complete })
</script>

<template>
  <TheaterDialogShell
    ref="shell"
    title="Crear sucursal"
    :close-disabled="submitting"
    @close="emit('close')"
  >
    <form
      ref="form"
      class="branch-form"
      novalidate
      :aria-busy="submitting"
      @submit.prevent="submit"
    >
      <p class="required-note">
        Los campos con <span class="required-marker">*</span> son obligatorios.
      </p>
      <p v-if="submissionError" class="form-error" role="alert">{{ submissionError }}</p>

      <fieldset class="form-card">
        <legend><span class="group-number" aria-hidden="true">1</span> Datos de la sucursal</legend>
        <div class="field-grid">
          <FormField
            v-slot="{ id, invalid, describedby }"
            label="Nombre"
            required
            :error="errors.name"
          >
            <input
              :id="id"
              v-model="draft.name"
              name="name"
              type="text"
              autocomplete="off"
              placeholder="Ej. Sucursal Heredia Centro"
              :aria-invalid="invalid"
              :aria-describedby="describedby"
              :disabled="submitting"
            />
          </FormField>
          <FormField
            v-slot="{ id, invalid, describedby }"
            label="Compañía"
            required
            :error="errors.companyId"
          >
            <select
              :id="id"
              v-model="draft.companyId"
              name="companyId"
              :aria-invalid="invalid"
              :aria-describedby="describedby"
              :disabled="submitting || companiesLoading"
            >
              <option value="">Selecciona una compañía</option>
              <option v-for="company in companyOptions" :key="company.id" :value="company.id">
                {{ company.name }}
              </option>
            </select>
          </FormField>
        </div>
        <p v-if="companiesLoading" class="form-hint" role="status">Cargando compañías…</p>
        <p v-else-if="companiesError" class="form-error" role="alert">
          No se pudieron cargar las compañías.
          <button type="button" class="link-button" @click="emit('retryCompanies')">
            Reintentar
          </button>
        </p>
      </fieldset>

      <footer class="dialog-actions">
        <button type="button" class="secondary-button" :disabled="submitting" @click="close">
          Cancelar
        </button>
        <button type="submit" class="save-button" :disabled="submitting">
          {{ submitting ? 'Guardando…' : 'Guardar' }}
        </button>
      </footer>
    </form>
  </TheaterDialogShell>
</template>

<style scoped>
.branch-form {
  display: grid;
  gap: 16px;
  padding: 24px;
  overflow-y: auto;
}
.required-note {
  margin: 0;
  font-size: 0.9rem;
}
.required-marker {
  color: var(--color-error);
  font-weight: 700;
}
.form-card {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 20px;
  border: 0;
  border-radius: var(--radius-medium);
  background: var(--content-background);
}
.form-card legend {
  float: left;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin: 0;
  padding: 0;
  font-size: 1rem;
  font-weight: 700;
}
.group-number {
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  color: var(--dialog-heading-text);
  background: var(--dialog-heading-background);
  font-size: 0.8rem;
}
.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
input,
select {
  width: 100%;
  min-height: 42px;
  padding: 8px 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-small);
  font: inherit;
  color: var(--text-primary);
  background: var(--input-background);
}
input[aria-invalid='true'],
select[aria-invalid='true'] {
  border-color: var(--color-error);
}
input:focus,
select:focus {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}
.form-hint {
  margin: 0;
  font-size: 0.875rem;
}
.form-error {
  margin: 0;
  color: var(--color-error);
}
.link-button {
  padding: 0;
  border: 0;
  color: var(--color-primary);
  background: transparent;
  text-decoration: underline;
}
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
.secondary-button,
.save-button {
  min-height: 42px;
  padding: 9px 16px;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-small);
  font: inherit;
}
.secondary-button {
  color: var(--primary-color);
  background: var(--button-secondary-background);
}
.save-button {
  color: var(--dialog-heading-text);
  background: var(--dialog-heading-background);
}
button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
@media (max-width: 520px) {
  .branch-form {
    padding: 20px 16px;
  }
  .field-grid {
    grid-template-columns: 1fr;
  }
}
</style>
