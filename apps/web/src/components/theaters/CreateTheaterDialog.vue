<script setup lang="ts">
import { useTemplateRef } from 'vue'
import TheaterDialogShell from './TheaterDialogShell.vue'
import TheaterForm from './TheaterForm.vue'
import type { CreateTheaterRequest, TheaterCinema, TheaterProjector } from '@/types/theater'

const props = withDefaults(
  defineProps<{
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

const shell = useTemplateRef('shell')
const form = useTemplateRef('form')

function open() {
  form.value?.reset()
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
  <TheaterDialogShell ref="shell" title="Crear sala" :close-disabled="submitting">
    <TheaterForm
      ref="form"
      submit-label="Crear sala"
      submitting-label="Creando…"
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
