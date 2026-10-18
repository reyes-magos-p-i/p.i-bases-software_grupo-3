<script setup lang="ts">
import { ref } from 'vue'
import { isAxiosError } from 'axios'

import BaseModal from '@/components/common/BaseModal.vue'
import { deleteMovie } from '@/services/movie.service'


const props = defineProps<{
  movie: {
    id: number
    title: string
  } | null
}>()

const emit = defineEmits<{
  close: []
  deleted: []
  'session-expired': []
  forbidden: []
}>()

const deleting = ref(false)
const error = ref('')

function close() {
  if (deleting.value) return
  error.value = ''
  emit('close')
}

async function confirmDelete() {
  if (!props.movie || deleting.value) return

  const movieId = props.movie.id

  deleting.value = true
  error.value = ''

  try {
    await deleteMovie(movieId)

    emit('deleted')
    emit('close')
  } catch (failure) {
    if (isAxiosError(failure)) {
      const status = failure.response?.status

      if (status === 401) {
        emit('session-expired')
        error.value = 'La sesión ha expirado.'
      } else if (status === 403) {
        emit('forbidden')
        error.value = 'No tienes permiso para eliminar esta película.'
      } else if (status === 404) {
        error.value = 'La película ya no existe.'
      } else {
        error.value = 'No se pudo eliminar la película.'
      }
    } else {
      error.value = 'No se pudo eliminar la película.'
    }
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <BaseModal
    :open="movie !== null"
    title="Eliminar película"
    :close-disabled="deleting"
    @close="close"
  >
    <div class="movie-delete-content movie-form-modal">

      <p>
        ¿Estás seguro de que deseas eliminar la película
        <strong>{{ movie?.title }}</strong>?
      </p>

      <p class="delete-warning">
        Esta acción no se puede deshacer.
      </p>

      <p v-if="error" class="delete-error" role="alert">
        {{ error }}
      </p>

      <footer class="delete-footer">
        <button
          type="button"
          class="secondary"
          :disabled="deleting"
          @click="close"
        >
          Cancelar
        </button>

        <button
          type="button"
          class="danger"
          :disabled="deleting"
          @click="confirmDelete"
        >
          {{ deleting ? 'Eliminando...' : 'Eliminar película' }}
        </button>
      </footer>

    </div>
  </BaseModal>
</template>


<style scoped>

.movie-delete-content {
  padding: 24px;
  color: var(--text-primary);
}

.delete-warning {
  color: var(--error-color);
  font-weight: 500;
}

.delete-error {
  color: var(--error-color);
  margin-top: 16px;
}

.delete-footer {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 24px;
}

.delete-footer button {
  min-height: 44px;
  padding: 10px 20px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-small);
  font: inherit;
  cursor: pointer;
}

.secondary {
  background: var(--content-background);
  color: var(--button-secondary-text);
}

.secondary:hover:not(:disabled) {
  background: var(--surface-hover);
}

.danger {
  background: var(--error-color);
  border-color: var(--error-color) !important;
  color: white;
}

.danger:hover:not(:disabled) {
  filter: brightness(0.9);
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

button:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
</style>

