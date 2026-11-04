<script setup lang="ts">
import DialogSection from '@/components/common/DialogSection.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import { computed, nextTick, onBeforeUnmount, reactive, ref, useTemplateRef, watch } from 'vue'
import NotificationPopup from '@/components/common/NotificationPopup.vue'
import { movieErrorsFromApi, validateMovie, type MovieErrors } from '@/utils/movie-validation'
import { isAxiosError } from 'axios'
import BaseModal from '@/components/common/BaseModal.vue'
import { getMovie, updateMovie } from '@/services/movie.service'
import type { MovieDetail, MovieOption } from '@/types/movie'
import ReusableSearchDropdown from '../common/ReusableSearchDropdown.vue'
import LimitedTextInput from '@/components/common/LimitedTextInput.vue'
import PositiveNumberInput from '@/components/common/PositiveNumberInput.vue'
import SimpleDropdown from '@/components/common/SimpleDropdown.vue'
import ImageUpload from '../image/ImageUpload.vue'
import { uploadPoster, getPosterUrl } from '@/services/image-handler.service'

const props = defineProps<{
  movieId: number | null
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

const movie = ref<MovieDetail | null>(null)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const saveError = ref('')
const validationNotice = ref('')
const fieldErrors = reactive<MovieErrors>({})
const formElement = useTemplateRef<HTMLFormElement>('form-element')
const retryable = ref(false)
const selectedPoster = ref<File | null>(null)

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

const existingPosterUrl = computed(() => getPosterUrl(form.posterImage))

let request: AbortController | undefined
let saveRequest: AbortController | undefined

const hasChanges = computed(() => {
  if (!movie.value) return false

  const original = movie.value

  const sameIds = (a: number[], b: number[]) =>
    a.length === b.length &&
    [...a].sort((x, y) => x - y).every((id, index) => id === [...b].sort((x, y) => x - y)[index])

  return (
    selectedPoster.value !== null ||
    form.posterImage !== (original.posterImage ?? null) ||
    form.title !== original.title ||
    form.synopsis !== original.synopsis ||
    form.runningTime !== original.runningTime ||
    form.releaseYear !== original.releaseYear ||
    form.classificationId !== (original.classification?.id ?? null) ||
    !sameIds(
      form.languageIds,
      original.languages.map((l) => l.id),
    ) ||
    !sameIds(
      form.genreIds,
      original.genres.map((g) => g.id),
    )
  )
})

const canSave = computed(() => hasChanges.value && !saving.value && !loading.value)

const title = computed(() =>
  movie.value ? `Modificar ${movie.value.title}` : 'Modificar película',
)

const languageOptions = computed(() =>
  props.languages.map((language) => ({
    value: language.id,
    label: language.name,
  })),
)

const genreOptions = computed(() =>
  props.genres.map((genre) => ({
    value: genre.id,
    label: genre.name,
  })),
)

function reportError(failure: unknown, operation: 'load' | 'save') {
  const status = isAxiosError(failure) ? failure.response?.status : undefined

  let message: string

  if (status === 401) {
    message = 'La sesión ha expirado. Inicia sesión nuevamente.'
    emit('session-expired')
  } else if (status === 403) {
    message = 'No tienes permiso para modificar esta película.'
    emit('forbidden')
  } else if (status === 404) {
    message = 'La película seleccionada ya no existe.'
  } else if (status === 400 && operation === 'save') {
    Object.assign(
      fieldErrors,
      movieErrorsFromApi(isAxiosError(failure) ? failure.response?.data?.message : undefined),
    )
    if (!Object.keys(fieldErrors).length)
      validationNotice.value =
        'Revisa los datos y la imagen seleccionada antes de volver a intentarlo.'
    return
  } else {
    message =
      operation === 'load'
        ? 'No se pudo cargar la película. Vuelve a intentarlo.'
        : 'No se pudieron guardar los cambios. Vuelve a intentarlo.'

    if (operation === 'load') {
      retryable.value = true
    }
  }

  if (operation === 'load') {
    error.value = message
  } else {
    saveError.value = message
  }
}

async function load() {
  request?.abort()
  saveRequest?.abort()

  movie.value = null
  selectedPoster.value = null
  form.posterImage = null
  error.value = ''
  saveError.value = ''
  validationNotice.value = ''
  for (const field of Object.keys(fieldErrors)) delete fieldErrors[field as keyof MovieErrors]
  retryable.value = false
  saving.value = false

  const movieId = props.movieId

  if (movieId === null) {
    loading.value = false
    return
  }

  const current = new AbortController()
  request = current
  loading.value = true

  try {
    const detail = await getMovie(movieId, current.signal)

    if (current.signal.aborted) return

    movie.value = detail

    Object.assign(form, {
      posterImage: detail.posterImage ?? null,
      title: detail.title ?? '',
      synopsis: detail.synopsis ?? '',
      runningTime: detail.runningTime ?? null,
      releaseYear: detail.releaseYear ?? null,
      classificationId: detail.classification?.id ?? null,
      languageIds: detail.languages?.map((language) => language.id) ?? [],
      genreIds: detail.genres?.map((genre) => genre.id) ?? [],
    })
  } catch (failure) {
    if (!current.signal.aborted) {
      reportError(failure, 'load')
    }
  } finally {
    if (request === current) {
      loading.value = false
      request = undefined
    }
  }
}

async function save() {
  const movieId = props.movieId

  if (movieId === null || saving.value || loading.value) return

  saveError.value = ''
  validationNotice.value = ''

  // Validate again after trimming and before sending the request.
  if (!hasChanges.value) return

  for (const field of Object.keys(fieldErrors)) delete fieldErrors[field as keyof MovieErrors]
  Object.assign(fieldErrors, validateMovie(form, props, false))
  if (Object.keys(fieldErrors).length) {
    await nextTick()
    formElement.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    return
  }

  const current = new AbortController()
  saveRequest = current
  saving.value = true

  try {
    if (selectedPoster.value) {
      const uploaded = await uploadPoster(selectedPoster.value)

      // An upload may finish after this modal closes or switches movies.
      if (current.signal.aborted || props.movieId !== movieId) return

      // Keep the uploaded path for a retry if updating the movie fails.
      form.posterImage = uploaded.path
      selectedPoster.value = null
    }

    await updateMovie(
      movieId,
      {
        posterImage: form.posterImage,
        title: form.title.trim(),
        synopsis: form.synopsis.trim(),
        runningTime: Number(form.runningTime),
        releaseYear: Number(form.releaseYear),
        classificationId: form.classificationId ?? undefined,
        languageIds: [...form.languageIds],
        genreIds: [...form.genreIds],
      },
      current.signal,
    )

    if (current.signal.aborted || props.movieId !== movieId) return

    emit('saved')
    emit('close')
  } catch (failure) {
    if (!current.signal.aborted) {
      reportError(failure, 'save')
    }
  } finally {
    if (saveRequest === current) {
      saving.value = false
      saveRequest = undefined
    }
  }
}

function close() {
  // Keep the modal open while saving.
  if (saving.value) return

  request?.abort()
  movie.value = null
  emit('close')
}

watch(
  () => props.movieId,
  () => void load(),
  { immediate: true },
)

onBeforeUnmount(() => {
  request?.abort()
  saveRequest?.abort()
})
</script>

<template>
  <BaseModal :open="movieId !== null" :title="title" :close-disabled="saving" @close="close">
    <div class="movie-detail-content dialog-content" :aria-busy="loading || saving">
      <LoadingState
        v-if="loading"
        class="detail-feedback"
        message="Cargando datos de la película…"
        compact
      />

      <div v-else-if="error" class="detail-feedback detail-error" role="alert">
        <p>{{ error }}</p>

        <button v-if="retryable" type="button" class="detail-button" @click="load">
          Reintentar
        </button>
      </div>

      <form
        v-else-if="movie"
        ref="form-element"
        novalidate
        @submit.prevent="save"
        @input="validationNotice = ''"
        @change="validationNotice = ''"
      >
        <fieldset class="edit-fieldset" :disabled="saving">
          <div class="movie-edit-layout">
            <div class="movie-fields dialog-sections">
              <DialogSection title="Información general" :number="1">
                <div class="form-grid">
                  <div class="detail-field">
                    <span class="field-label">ID</span>
                    <p>MOV{{ movie.id }}</p>
                  </div>
                  <LimitedTextInput
                    v-model="form.title"
                    label="Título"
                    placeholder="Ingrese el título"
                    :limit="100"
                    :error="fieldErrors.title"
                    @update:model-value="delete fieldErrors.title"
                    required
                  />
                  <PositiveNumberInput
                    v-model="form.runningTime"
                    label="Duración en minutos"
                    placeholder="Ej. 120"
                    :min="1"
                    :max="999"
                    required
                    :error="fieldErrors.runningTime"
                    @update:model-value="delete fieldErrors.runningTime"
                  />
                  <PositiveNumberInput
                    v-model="form.releaseYear"
                    label="Año de estreno"
                    placeholder="Ej. 2026"
                    :min="1888"
                    :max="2077"
                    required
                    :error="fieldErrors.releaseYear"
                    @update:model-value="delete fieldErrors.releaseYear"
                  />
                  <SimpleDropdown
                    v-model="form.classificationId"
                    label="Clasificación"
                    placeholder="Seleccione una clasificación"
                    :options="classifications"
                    :error="fieldErrors.classificationId"
                    @update:model-value="delete fieldErrors.classificationId"
                    required
                  />
                </div>
              </DialogSection>
              <DialogSection title="Idiomas y géneros" :number="2">
                <div class="option-grid">
                  <ReusableSearchDropdown
                    v-model="form.languageIds"
                    label="Idiomas"
                    placeholder="Buscar idiomas..."
                    :options="languageOptions"
                    :error="fieldErrors.languageIds"
                    @update:model-value="delete fieldErrors.languageIds"
                  />
                  <ReusableSearchDropdown
                    v-model="form.genreIds"
                    label="Géneros"
                    placeholder="Buscar géneros..."
                    :options="genreOptions"
                    :error="fieldErrors.genreIds"
                    @update:model-value="delete fieldErrors.genreIds"
                  />
                </div>
              </DialogSection>
              <DialogSection title="Sinopsis" :number="3">
                <LimitedTextInput
                  v-model="form.synopsis"
                  label="Sinopsis"
                  placeholder="Ingrese la sinopsis"
                  :limit="1000"
                  :error="fieldErrors.synopsis"
                  @update:model-value="delete fieldErrors.synopsis"
                  multiline
                  :rows="5"
                  required
                />
              </DialogSection>
            </div>
            <aside class="poster-column">
              <DialogSection title="Póster" :number="4">
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

        <p v-if="validationNotice" class="detail-feedback detail-error" role="alert">
          {{ validationNotice }}
        </p>
        <NotificationPopup
          v-if="saveError"
          type="error"
          :message="saveError"
          :duration="0"
          placement="bottom-right"
          @close="saveError = ''"
        />

        <footer class="detail-footer">
          <button type="button" class="detail-button" :disabled="saving" @click="close">
            Cancelar
          </button>

          <button type="submit" class="detail-button save-button" :disabled="!canSave">
            {{ saving ? 'Guardando…' : 'Guardar cambios' }}
          </button>
        </footer>
      </form>

      <footer v-if="!movie" class="detail-footer">
        <button type="button" class="detail-button" @click="close">Cerrar</button>
      </footer>
    </div>
  </BaseModal>
</template>

<style scoped>
/* Modal background */

/* Modal container */
:global(.app-modal-card:has(.movie-detail-content)) {
  width: min(880px, 100%);
  max-width: 880px;
}

/* Modal title */

/* Modal close button */

/* Main content */
.movie-detail-content {
  min-height: 0;
  padding: 24px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

/* Sections */
.detail-group h3,
.option-fieldset legend {
  margin: 0 0 10px;
  font-size: 1rem;
  font-weight: 700;
}

/* Form layout */
.option-grid {
  display: grid;
  gap: 16px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 16px;
  margin: 0;
}

.detail-field {
  min-width: 0;
}

/* Fieldsets */
.edit-fieldset,
.option-fieldset {
  min-width: 0;
  padding: 0;
  border: 0;
  margin: 0;
}

/* Labels */
.detail-field label,
.detail-group > label,
.field-label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
}

/* Read-only information */
.detail-field p {
  margin: 0;
  overflow-wrap: anywhere;
}

/* Text inputs and selects */
.edit-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-small);
  background: var(--content-background);
  color: var(--text-primary);
  font: inherit;
}

textarea.edit-input {
  resize: vertical;
}

/* Genre checkboxes */
.edit-options {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
}

.edit-option {
  display: flex;
  align-items: center;
  gap: 8px;
}

.edit-option input {
  width: 18px;
  height: 18px;
  accent-color: var(--primary-color);
}

/* Feedback and errors */
.detail-feedback {
  padding: 16px;
  margin-bottom: 20px;
  border-left: 3px solid var(--primary-color);
  background: var(--content-background);
  color: var(--text-primary);
}

.detail-error {
  border-color: var(--error-color);
  color: var(--error-color);
}

/* Footer layout */
.detail-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 16px;
}

/* General buttons */
.detail-button {
  min-height: 44px;
  padding: 10px 20px;
  border: 1px solid var(--primary-color);
  border-radius: var(--radius-small);
  background: var(--content-background);
  color: var(--button-secondary-text);
  font: inherit;
  cursor: pointer;
}

/* Cancel button hover */
.detail-button:not(.save-button):hover {
  background: var(--surface-hover);
}

/* Save button */
.save-button {
  background: var(--button-confirm-background);
  border-color: var(--button-confirm-background);
  color: var(--button-confirm-text);
}

.save-button:not(:disabled):hover {
  background: var(--button-confirm-hover-background);
  border-color: var(--button-confirm-hover-background);
}

/* Disabled buttons */
.detail-button:disabled {
  opacity: 0.5;
  cursor: default;
}

/* Keyboard focus */
.edit-input:focus-visible,
.detail-button:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}

.movie-edit-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 240px;
  gap: 24px;
  align-items: start;
}

.poster-column,
.movie-fields {
  min-width: 0;
}

@media (max-width: 700px) {
  .movie-edit-layout {
    grid-template-columns: 1fr;
  }

  .poster-column {
    width: 100%;
    max-width: 240px;
    justify-self: center;
  }
}
/* Mobile layout */
@media (max-width: 575px) {
  .movie-detail-content {
    padding: 20px 16px;
  }

  .form-grid,
  .detail-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .detail-footer .detail-button {
    flex: 1;
  }
}
</style>
