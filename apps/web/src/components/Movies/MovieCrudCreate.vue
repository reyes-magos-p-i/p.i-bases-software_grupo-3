<script setup lang="ts">
import DialogSection from '@/components/common/DialogSection.vue'
import { computed, nextTick, reactive, ref, useTemplateRef } from 'vue'
import { isAxiosError } from 'axios'

import BaseModal from '@/components/common/BaseModal.vue'
import NotificationPopup from '@/components/common/NotificationPopup.vue'
import {
  MOVIE_TITLE_LIMIT as TITLE_LIMIT,
  MOVIE_SYNOPSIS_LIMIT as SYNOPSIS_LIMIT,
  movieErrorsFromApi,
  validateMovie,
  type MovieErrors,
} from '@/utils/movie-validation'
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
const validationNotice = ref('')
const fieldErrors = reactive<MovieErrors>({})
const formElement = useTemplateRef<HTMLFormElement>('form-element')
const selectedPoster = ref<File | null>(null)

const existingPosterUrl = computed(() => getPosterUrl(form.posterImage))

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

async function save() {
  if (saving.value) return
  error.value = ''
  for (const field of Object.keys(fieldErrors)) delete fieldErrors[field as keyof MovieErrors]
  validationNotice.value = ''
  Object.assign(fieldErrors, validateMovie(form, props))
  if (Object.keys(fieldErrors).length) {
    await nextTick()
    formElement.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    return
  }

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
      } else if (failure.response?.status === 400) {
        Object.assign(fieldErrors, movieErrorsFromApi(failure.response.data?.message))
        if (!Object.keys(fieldErrors).length)
          validationNotice.value =
            'Revisa los datos y la imagen seleccionada antes de volver a intentarlo.'
        return
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
    <div class="movie-create-content dialog-content">
      <form
        ref="form-element"
        novalidate
        @submit.prevent="save"
        @input="validationNotice = ''"
        @change="validationNotice = ''"
      >
        <fieldset class="create-fieldset" :disabled="saving">
          <div class="movie-create-layout">
            <div class="movie-fields dialog-sections">
              <DialogSection title="Información general">
                <div class="form-grid">
                  <LimitedTextInput
                    v-model="form.title"
                    label="Título"
                    :limit="TITLE_LIMIT"
                    :error="fieldErrors.title"
                    required
                    @update:model-value="delete fieldErrors.title"
                  />
                  <PositiveNumberInput
                    v-model="form.runningTime"
                    label="Duración en minutos"
                    :min="1"
                    :max="999"
                    required
                    :error="fieldErrors.runningTime"
                    @update:model-value="delete fieldErrors.runningTime"
                  />
                  <PositiveNumberInput
                    v-model="form.releaseYear"
                    label="Año de estreno"
                    :min="1888"
                    :max="2077"
                    required
                    :error="fieldErrors.releaseYear"
                    @update:model-value="delete fieldErrors.releaseYear"
                  />
                  <SimpleDropdown
                    v-model="form.classificationId"
                    label="Clasificación"
                    :options="classifications"
                    :error="fieldErrors.classificationId"
                    @update:model-value="delete fieldErrors.classificationId"
                    required
                  />
                </div>
              </DialogSection>
              <DialogSection title="Idiomas y géneros">
                <div class="option-grid">
                  <ReusableSearchDropdown
                    v-model="form.languageIds"
                    label="Idiomas"
                    placeholder="Buscar idiomas..."
                    :options="languageOptions"
                    required
                    :error="fieldErrors.languageIds"
                    @update:model-value="delete fieldErrors.languageIds"
                  />
                  <ReusableSearchDropdown
                    v-model="form.genreIds"
                    label="Géneros"
                    placeholder="Buscar géneros..."
                    :options="genreOptions"
                    required
                    :error="fieldErrors.genreIds"
                    @update:model-value="delete fieldErrors.genreIds"
                  />
                </div>
              </DialogSection>
              <DialogSection title="Sinopsis">
                <LimitedTextInput
                  v-model="form.synopsis"
                  label="Sinopsis"
                  :limit="SYNOPSIS_LIMIT"
                  :error="fieldErrors.synopsis"
                  @update:model-value="delete fieldErrors.synopsis"
                  multiline
                  :rows="5"
                  required
                />
              </DialogSection>
            </div>
            <aside class="poster-column">
              <DialogSection title="Póster">
                <ImageUpload
                  v-model="selectedPoster"
                  label="Póster de la película"
                  :existing-image-url="existingPosterUrl"
                  :disabled="saving"
                />
              </DialogSection>
            </aside>
          </div>
        </fieldset>

        <p v-if="validationNotice" class="form-error" role="alert">{{ validationNotice }}</p>
        <NotificationPopup
          v-if="error"
          type="error"
          :message="error"
          :duration="0"
          placement="bottom-right"
          @close="error = ''"
        />

        <footer class="form-footer">
          <button type="button" class="secondary" :disabled="saving" @click="emit('close')">
            Cancelar
          </button>

          <button type="submit" class="primary" :disabled="saving">
            {{ saving ? 'Creando...' : 'Crear película' }}
          </button>
        </footer>
      </form>
    </div>
  </BaseModal>
</template>

<style scoped>
.option-grid {
  display: grid;
  gap: 16px;
}
/* Modal size and appearance */
:global(.app-modal-card:has(.movie-create-content)) {
  width: min(880px, 100%);
  max-width: 880px;
}

/* Purple heading */

/* Close button in heading */

/* Keyboard focus on close button */

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
