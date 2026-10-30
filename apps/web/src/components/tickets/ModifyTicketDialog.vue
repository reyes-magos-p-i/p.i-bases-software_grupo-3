<script setup lang="ts">
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
  if (!movieFunctionId.value) return
  emit('submit', { movieFunctionId: Number(movieFunctionId.value) })
}

defineExpose({ open, complete })
</script>

<template>
  <TicketDialogShell
    ref="shell"
    title="Modificar ticket"
    :close-disabled="submitting"
    @close="emit('close')"
  >
    <form @submit.prevent="submit">
      <p v-if="optionsLoading">Cargando funciones…</p>
      <p v-else-if="optionsError" role="alert">
        {{ optionsError }}
        <button type="button" @click="emit('retryOptions')">Reintentar</button>
      </p>
      <p v-else-if="!showtimes.length">No hay funciones alternativas disponibles.</p>
      <template v-else>
        <label for="ticket-showtime">Nueva función</label>
        <select id="ticket-showtime" v-model="movieFunctionId" :disabled="submitting">
          <option value="" disabled>Selecciona una función</option>
          <option v-for="s in showtimes" :key="s.movieFunctionId" :value="s.movieFunctionId">
            {{ s.date }} {{ s.time }} · Sala {{ s.theaterId }} · Asiento
            {{ s.seatRow }}-{{ s.seatColumn }}
          </option>
        </select>
      </template>

      <ul v-if="submissionErrors.length" role="alert">
        <li v-for="error in submissionErrors" :key="error">{{ error }}</li>
      </ul>

      <div>
        <button type="button" :disabled="submitting" @click="close">Cancelar</button>
        <button type="submit" :disabled="submitting || !movieFunctionId">
          {{ submitting ? 'Guardando…' : 'Guardar cambios' }}
        </button>
      </div>
    </form>
  </TicketDialogShell>
</template>
