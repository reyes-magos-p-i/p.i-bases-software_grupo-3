<script setup lang="ts">
import DialogSection from '@/components/common/DialogSection.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import { ref, useTemplateRef } from 'vue'
import TicketDialogShell from './TicketDialogShell.vue'
import type { AlternativeShowtime, UpdateTicketRequest } from '@/types/ticket'

const props = withDefaults(
  defineProps<{
    showtimes?: readonly AlternativeShowtime[]
    optionsLoading?: boolean
    optionsError?: string
    submitting?: boolean
    submissionErrors?: readonly string[]
  }>(),
  {
    showtimes: () => [],
    optionsLoading: false,
    optionsError: '',
    submitting: false,
    submissionErrors: () => [],
  },
)
const emit = defineEmits<{
  retryOptions: []
  close: []
  submit: [data: UpdateTicketRequest]
}>()

const shell = useTemplateRef('shell')
const movieFunctionId = ref('')

function open() {
  movieFunctionId.value = ''
  shell.value?.open()
}

function close() {
  if (props.submitting) return
  shell.value?.close()
  emit('close')
}

function complete() {
  movieFunctionId.value = ''
  shell.value?.close()
}

function submit() {
  if (
    props.submitting ||
    props.optionsLoading ||
    !props.showtimes.some((showtime) => showtime.movieFunctionId === Number(movieFunctionId.value))
  )
    return
  emit('submit', { movieFunctionId: Number(movieFunctionId.value) })
}

defineExpose({ open, complete })
</script>

<template>
  <TicketDialogShell
    ref="shell"
    title="Modificar boleto"
    :close-disabled="submitting"
    @close="emit('close')"
  >
    <form novalidate :aria-busy="submitting" @submit.prevent="submit">
      <DialogSection as="fieldset" title="Proyección de destino" :number="1">
        <label for="ticket-showtime" class="field-label">Proyecciones futuras</label>
        <select
          id="ticket-showtime"
          v-model="movieFunctionId"
          :disabled="submitting || optionsLoading"
        >
          <option value="">Seleccione una proyección</option>
          <option v-for="s in showtimes" :key="s.movieFunctionId" :value="s.movieFunctionId">
            {{ s.date }}{{ '\t' }}{{ s.time }}
          </option>
        </select>

        <LoadingState v-if="optionsLoading" message="Cargando proyecciones…" compact />
        <p v-else-if="optionsError" class="form-error" role="alert">
          {{ optionsError }}
          <button type="button" @click="emit('retryOptions')">Reintentar</button>
        </p>
        <p v-else-if="!showtimes.length" role="status">
          No hay proyecciones alternativas disponibles.
        </p>
        <p v-if="submissionErrors.length" class="form-error" role="alert">
          {{ submissionErrors.join(' ') }}
        </p>
      </DialogSection>
      <footer class="dialog-actions">
        <button type="button" class="secondary-button" :disabled="submitting" @click="close">
          Cancelar
        </button>
        <button
          type="submit"
          class="create-button"
          :disabled="submitting || optionsLoading || !movieFunctionId"
        >
          {{ submitting ? 'Modificando…' : 'Modificar boleto' }}
        </button>
      </footer>
    </form>
  </TicketDialogShell>
</template>

<style scoped>
form {
  display: grid;
  gap: 8px;
  padding: 15px 13px 24px;
}
.field-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}
select {
  appearance: none;
  min-height: 42px;
  padding: 8px 36px 8px 12px;
  border: 0.5px solid var(--text-primary);
  border-radius: var(--radius-small);
  font: inherit;
  font-size: 14px;
  color: var(--text-primary);
  background: var(--input-background) url('@/assets/icons/select-arrow.svg') no-repeat right 14px
    center;
}
select:focus {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}
.form-error {
  margin: 0;
  color: var(--color-error);
}
.form-error button {
  border: 0;
  color: var(--color-primary);
  background: transparent;
  text-decoration: underline;
}
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}
.secondary-button,
.create-button {
  min-height: 40px;
  padding: 12px 14px;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-small);
  font: inherit;
  font-weight: 500;
  box-shadow: 0 4px 4px var(--shadow-strong-color);
}
.secondary-button {
  min-width: 118px;
  color: var(--button-secondary-text);
  background: var(--button-secondary-background);
}
.create-button {
  min-width: 162px;
  color: var(--dialog-heading-text);
  background: var(--dialog-heading-background);
}
.create-button:disabled {
  opacity: 0.6;
}
</style>
