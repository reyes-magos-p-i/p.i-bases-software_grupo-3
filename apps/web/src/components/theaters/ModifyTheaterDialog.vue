<script setup lang="ts">
import { useTemplateRef } from 'vue'
import TheaterDialogShell from './TheaterDialogShell.vue'
import TheaterForm from './TheaterForm.vue'
import type {
  Theater,
  TheaterCinema,
  TheaterProjector,
  UpdateTheaterRequest,
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
    theater: null,
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
  submit: [data: UpdateTheaterRequest]
}>()

const shell = useTemplateRef('shell')
const form = useTemplateRef('form')

function open() {
  if (props.theater) form.value?.fill(props.theater)
  else form.value?.reset()
  shell.value?.open()
}

function close() {
  if (!props.submitting) shell.value?.close()
}

function complete() {
  form.value?.reset()
  shell.value?.close()
}

defineExpose({ open, complete })
</script>

<template>
  <TheaterDialogShell ref="shell" title="Modificar sala" :close-disabled="submitting">
    <TheaterForm
      ref="form"
      submit-label="Guardar cambios"
      submitting-label="Guardando…"
      :projectors="projectors"
      :cinemas="cinemas"
      :options-loading="optionsLoading"
      :options-error="optionsError"
      :submitting="submitting"
      :submission-errors="submissionErrors"
      @retry-options="emit('retryOptions')"
      @cancel="close"
      @submit="emit('submit', $event)"
    />
  </TheaterDialogShell>
</template>
