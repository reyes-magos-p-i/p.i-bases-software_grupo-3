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

import ImageUpload from '../image/ImageUpload.vue'
import { uploadPoster, getPosterUrl } from '@/services/image-handler.service.ts'

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
  genreIds: [] as number[],
  posterImage: null as string | null,
})

const saving = ref(false)
const error = ref('')
const selectedPoster = ref<File | null>(null)

const existingPosterUrl = computed(() =>
  getPosterUrl(form.posterImage),
)
const runningTimeValid = ref(false)
const releaseYearValid = ref(false)

const languageOptions = computed(() =>
  props.languages.map((item) => ({
    value: item.id,
    label: item.name,
  })),
)

const genreOptions = computed(() =>
  props.genres.map((item) => ({
    value: item.id,
    label: item.name,
  })),
)

const isFormValid = computed(
  () =>
    form.title.trim().length > 0 &&
    form.title.length <= TITLE_LIMIT &&
    form.synopsis.trim().length > 0 &&
    form.synopsis.length <= SYNOPSIS_LIMIT &&
    runningTimeValid.value &&
    releaseYearValid.value &&
    form.classificationId !== null &&
    form.languageIds.length > 0 &&
    form.genreIds.length > 0,
)

async function save() {
  if (saving.value || !isFormValid.value) return

  const runningTime = form.runningTime
  const releaseYear = form.releaseYear
  const classificationId = form.classificationId

  if (runningTime === null || releaseYear === null || classificationId === null) return

  saving.value = true
  error.value = ''

  try {
    if (selectedPoster.value) {
      const uploaded = await uploadPoster(selectedPoster.value)

      form.posterImage = uploaded.path
      selectedPoster.value = null
    }

    await createMovie({
      title: form.title.trim(),
      synopsis: form.synopsis.trim(),
      runningTime,
      releaseYear,
      classificationId,
      languageIds: [...form.languageIds],
      genreIds: [...form.genreIds],
      posterImage: form.posterImage,
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

    error.value = 'No se pudo crear la película. Vuelve a intentarlo.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseModal :open="true" title="Crear película" :close-disabled="saving" @close="emit('close')">
    <div class="movie-create-content">
      <form @submit.prevent="save">
        <fieldset class="create-fieldset" :disabled="saving">
          <div class="movie-create-layout">
            <div class="movie-fields">
              <!-- All your movie fields -->
               <h3>Información general</h3>

        <div class="form-grid">
          <LimitedTextInput v-model="form.title" label="Título" :limit="TITLE_LIMIT" required />

          <PositiveNumberInput
            v-model="form.runningTime"
            label="Duración en minutos"
            :min="1"
            :max="999"
            required
            @validity-change="runningTimeValid = $event"
          />

          <PositiveNumberInput
            v-model="form.releaseYear"
            label="Año de estreno"
            :min="1888"
            :max="2077"
            required
            @validity-change="releaseYearValid = $event"
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
            </div>

            <aside class="poster-column">
              <ImageUpload
                v-model="selectedPoster"
                label="Póster de la película"
                :existing-image-url="existingPosterUrl"
                :disabled="saving"
              />
            </aside>
          </div>
        </fieldset>

        <p v-if="error" class="form-error" role="alert">
          {{ error }}
        </p>

        <footer class="form-footer">
          <button type="button" class="secondary" :disabled="saving" @click="emit('close')">
            Cancelar
          </button>

          <button type="submit" class="primary" :disabled="!isFormValid || saving">
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

.create-fieldset {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.movie-create-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 240px;
  gap: 24px;
  align-items: start;
}

.movie-fields,
.poster-column {
  min-width: 0;
}

.movie-fields > h3 {
  margin: 0 0 12px;
}

@media (max-width: 700px) {
  .movie-create-layout {
    grid-template-columns: 1fr;
  }

  .poster-column {
    width: 100%;
    max-width: 240px;
    justify-self: center;
  }
}

@media (max-width: 575px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
