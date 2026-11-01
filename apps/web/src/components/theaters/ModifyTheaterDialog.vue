<script setup lang="ts">
import { useTemplateRef } from 'vue'
import TheaterDialogShell from './TheaterDialogShell.vue'
import TheaterForm from './TheaterForm.vue'
import type {
  Theater,
  TheaterCinema,
  TheaterProjector,
  TheaterStatusOption,
  UpdateTheaterRequest,
} from '@/types/theater'
import TheaterSeatEditor from './TheaterSeatEditor.vue'

const props = withDefaults(
  defineProps<{
    theater?: Theater | null
    projectors?: readonly TheaterProjector[]
    cinemas?: readonly TheaterCinema[]
    statuses?: readonly TheaterStatusOption[]
    optionsLoading?: boolean
    optionsError?: string
    submitting?: boolean
    submissionErrors?: readonly string[]
  }>(),
  {
    theater: null,
    projectors: () => [],
    cinemas: () => [],
    statuses: () => [],
    optionsLoading: false,
    optionsError: '',
    submitting: false,
    submissionErrors: () => [],
  },
)
const emit = defineEmits<{
  retryOptions: []
  close: []
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
  if (props.submitting) return
  shell.value?.close()
  emit('close')
}

function complete() {
  form.value?.reset()
  shell.value?.close()
}

defineExpose({ open, complete })
</script>

<template>
  <TheaterDialogShell
    ref="shell"
    title="Modificar sala"
    :close-disabled="submitting"
    width="1100px"
    @close="emit('close')"
  >
    <TheaterForm
      ref="form"
      submit-label="Guardar cambios"
      submitting-label="Guardando…"
      :projectors="projectors"
      :cinemas="cinemas"
      :statuses="statuses"
      :options-loading="optionsLoading"
      :options-error="optionsError"
      :submitting="submitting"
      :submission-errors="submissionErrors"
      @retry-options="emit('retryOptions')"
      @cancel="close"
      @submit="emit('submit', $event)"
    />
    <TheaterSeatEditor
      v-if="theater"
      :key="theater.theaterId"
      :theater-id="theater.theaterId"
      :rows="theater.dimensionX"
      :columns="theater.dimensionY"
      :disabled="submitting"
    />
  </TheaterDialogShell>
</template>
