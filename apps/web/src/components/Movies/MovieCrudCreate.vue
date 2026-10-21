<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { isAxiosError } from 'axios'

import BaseModal from '@/components/common/BaseModal.vue'
import LimitedTextInput from '@/components/common/LimitedTextInput.vue'
import PositiveNumberInput from '@/components/common/PositiveNumberInput.vue'
import SimpleDropdown from '@/components/common/SimpleDropdown.vue'
import ReusableSearchDropdown from '@/components/common/ReusableSearchDropdown.vue'

import { createMovie } from '@/services/movie.service'
import type { MovieOption } from '@/types/movie'

const props = defineProps<{
  classifications: MovieOption[]
  languages: MovieOption[]
  genres: MovieOption[]
}>()

const emit = defineEmits<{
  close: []
  saved: []
  'session-expired': []
  forbidden: []
}>()

const TITLE_LIMIT = 100
const SYNOPSIS_LIMIT = 1000

const form = reactive({
  title: '',
  synopsis: '',
  runningTime: null as number | null,
  releaseYear: null as number | null,
  classificationId: null as number | null,
  languageIds: [] as number[],
  genreIds: [] as number[]
})

const saving = ref(false)
const error = ref('')

const languageOptions = computed(() =>
  props.languages.map(item => ({
    value: item.id,
    label: item.name
  }))
)

const genreOptions = computed(() =>
  props.genres.map(item => ({
    value: item.id,
    label: item.name
  }))
)

const isFormValid = computed(() =>
  form.title.trim().length > 0 &&
  form.title.length <= TITLE_LIMIT &&
  form.synopsis.trim().length > 0 &&
  form.synopsis.length <= SYNOPSIS_LIMIT &&
  form.runningTime !== null &&
  Number.isInteger(form.runningTime) &&
  form.runningTime > 0 &&
  form.releaseYear !== null &&
  Number.isInteger(form.releaseYear) &&
  form.releaseYear > 0 &&
  form.classificationId !== null &&
  form.languageIds.length > 0 &&
  form.genreIds.length > 0
)

async function save() {
  if (saving.value || !isFormValid.value) return

  // Local variables let TypeScript narrow nullable values.
  const runningTime = form.runningTime
  const releaseYear = form.releaseYear
  const classificationId = form.classificationId

  if (
    runningTime === null ||
    releaseYear === null ||
    classificationId === null
  ) return

  saving.value = true
  error.value = ''

  try {
    await createMovie({
      title: form.title.trim(),
      synopsis: form.synopsis.trim(),
      runningTime,
      releaseYear,
      classificationId,
      languageIds: [...form.languageIds],
      genreIds: [...form.genreIds]
    })

    emit('saved')
    emit('close')
  } catch (failure) {
    if (isAxiosError(failure)) {
      if (failure.response?.status === 401) {
        emit('session-expired')
      } else if (failure.response?.status === 403) {
        emit('forbidden')
      }
    }

    error.value = 'No se pudo crear la película.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseModal
    :open="true"
    title="Crear película"
    :close-disabled="saving"
    @close="emit('close')"
  >
    <div class="movie-create-content">
      <form @submit.prevent="save">
        <h3>Información general</h3>

        <div class="form-grid">
          <LimitedTextInput
            v-model="form.title"
            label="Título"
            :limit="TITLE_LIMIT"
            required
          />

          <PositiveNumberInput
            v-model="form.runningTime"
            label="Duración en minutos"
            required
          />

          <PositiveNumberInput
            v-model="form.releaseYear"
            label="Año de estreno"
            required
          />
        </div>

        <div class="form-group">
          <SimpleDropdown
            v-model="form.classificationId"
            label="Clasificación"
            :options="classifications"
            required
          />
        </div>

        <div class="form-group">
          <ReusableSearchDropdown
            v-model="form.languageIds"
            label="Idiomas"
            placeholder="Buscar idiomas..."
            :options="languageOptions"
          />
        </div>

        <div class="form-group">
          <ReusableSearchDropdown
            v-model="form.genreIds"
            label="Géneros"
            placeholder="Buscar géneros..."
            :options="genreOptions"
          />
        </div>

        <div class="form-group">
          <LimitedTextInput
            v-model="form.synopsis"
            label="Sinopsis"
            :limit="SYNOPSIS_LIMIT"
            multiline
            :rows="5"
            required
          />
        </div>

        <p v-if="error" class="form-error" role="alert">
          {{ error }}
        </p>

        <footer class="form-footer">
          <button
            type="button"
            class="secondary"
            :disabled="saving"
            @click="emit('close')"
          >
            Cancelar
          </button>

          <button
            type="submit"
            class="primary"
            :disabled="!isFormValid || saving"
          >
            {{ saving ? 'Creando...' : 'Crear película' }}
          </button>
        </footer>
      </form>
    </div>
  </BaseModal>
</template>

<style scoped>
:global(.app-modal-backdrop:has(.movie-create-content)::backdrop) {
  background: var(--overlay-background);
}

/* Modal size and appearance */
:global(.app-modal-card:has(.movie-create-content)) {
  width: min(880px, 100%);
  max-width: 880px;
  padding: 0;
  border-radius: var(--radius-medium);
  background: var(--dialog-background);
  color: var(--text-primary);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Purple heading */
:global(.app-modal-card:has(.movie-create-content) .app-modal-title) {
  flex-shrink: 0;
  margin: 0;
  padding: 24px 80px 24px 24px;
  background: var(--primary-color);
  color: var(--content-background);
  text-align: left;
  font-style: normal;
  font-size: 1.25rem;
}

/* Close button in heading */
:global(.app-modal-card:has(.movie-create-content) .app-modal-close) {
  top: 14px;
  right: 24px;
  color: var(--content-background);
  border-radius: var(--radius-small);
}

/* Keyboard focus on close button */
:global(.app-modal-card:has(.movie-create-content) .app-modal-close:focus-visible) {
  outline-color: var(--focus-on-dark);
}

.movie-create-content {
  padding: 24px;
  overflow-y: auto;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 20px;
}

.form-group {
  margin-top: 24px;
}

.form-footer {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 24px;
}

.form-footer button {
  min-height: 44px;
  padding: 10px 20px;
  border: 1px solid var(--primary-color);
  border-radius: var(--radius-small);
  font: inherit;
  cursor: pointer;
}

.primary {
  background: var(--button-confirm-background);
  border-color: var(--button-confirm-background);
  color: var(--button-confirm-text);
}

.secondary {
  background: var(--content-background);
  color: var(--button-secondary-text);
}

.form-error {
  color: var(--error-color);
}

.form-footer button:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}

.form-footer button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 575px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
