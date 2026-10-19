<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { isAxiosError } from 'axios'

import BaseModal from '@/components/common/BaseModal.vue'
import { getMovie, updateMovie } from '@/services/movie.service'
import type { MovieDetail, MovieOption } from '@/types/movie'
import ReusableSearchDropdown from '../common/ReusableSearchDropdown.vue'
import LimitedTextInput from '@/components/common/LimitedTextInput.vue'
import PositiveNumberInput from '@/components/common/PositiveNumberInput.vue'
import SimpleDropdown from '@/components/common/SimpleDropdown.vue'

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
const retryable = ref(false)

const form = reactive({
  title: '',
  synopsis: '',
  runningTime: null as number | null,
  releaseYear: null as number | null,
  classificationId: null as number | null,
  languageIds: [] as number[],
  genreIds: [] as number[],
  posterImage: 'default-poster',
})

let request: AbortController | undefined
let saveRequest: AbortController | undefined

const isFormValid = computed(() => {
  return (
    form.title.trim().length > 0 &&
    form.title.length <= 100 &&
    form.synopsis.trim().length > 0 &&
    form.synopsis.length <= 1000 &&
    Number.isInteger(form.runningTime) &&
    form.runningTime !== null &&
    form.runningTime > 0 &&
    Number.isInteger(form.releaseYear) &&
    form.releaseYear !== null &&
    form.releaseYear > 0 &&
    form.classificationId !== null
  )
})

const hasChanges = computed(() => {
  if (!movie.value) return false

  const original = movie.value

  const sameIds = (a: number[], b: number[]) =>
    a.length === b.length &&
    [...a].sort((x, y) => x - y)
      .every((id, index) => id === [...b].sort((x, y) => x - y)[index])

  return (
    form.title !== original.title ||
    form.synopsis !== original.synopsis ||
    form.runningTime !== original.runningTime ||
    form.releaseYear !== original.releaseYear ||
    form.classificationId !== original.classification.id ||
    !sameIds(form.languageIds, original.languages.map(l => l.id)) ||
    !sameIds(form.genreIds, original.genres.map(g => g.id))
  )
})

const canSave = computed(() =>
  hasChanges.value &&
  isFormValid.value &&
  !saving.value &&
  !loading.value
)

const title = computed(() =>
  movie.value
    ? `Modificar ${movie.value.title}`
    : 'Modificar película',
)

const languageOptions = computed(() =>
  props.languages.map(language => ({
    value: language.id,
    label: language.name
  }))
)

function reportError(failure: unknown, operation: 'load' | 'save') {
  const status = isAxiosError(failure)
    ? failure.response?.status
    : undefined

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
    const backendMessage = isAxiosError(failure)
      ? failure.response?.data?.message
      : undefined

    message = Array.isArray(backendMessage)
      ? backendMessage.join(' ')
      : typeof backendMessage === 'string'
        ? backendMessage
        : 'Revisa los datos ingresados.'
  } else {
    message = operation === 'load'
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
  error.value = ''
  saveError.value = ''
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

  // Validate again after trimming and before sending the request.
  if (!hasChanges.value) return

  if (!isFormValid.value) {
    saveError.value =
      'Completa los campos requeridos con valores válidos.'
    return
  }

  const current = new AbortController()
  saveRequest = current
  saving.value = true

  try {
    await updateMovie(
      movieId,
      {
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
  <BaseModal
    :open="movieId !== null"
    :title="title"
    @close="close"
  >
    <div
      class="movie-detail-content"
      :aria-busy="loading || saving"
    >
      <p v-if="loading" class="detail-feedback" role="status">
        Cargando datos de la película…
      </p>

      <div
        v-else-if="error"
        class="detail-feedback detail-error"
        role="alert"
      >
        <p>{{ error }}</p>

        <button
          v-if="retryable"
          type="button"
          class="detail-button"
          @click="load"
        >
          Reintentar
        </button>
      </div>

      <form v-else-if="movie" @submit.prevent="save">
        <fieldset class="edit-fieldset" :disabled="saving">
          <section class="detail-group">
            <h3>Información general</h3>

            <div class="detail-grid">
              <div class="detail-field">
                <span class="field-label">ID</span>
                <p>MOV{{ movie.id }}</p>
              </div>

              <div class="detail-field">
                <LimitedTextInput
                  v-model="form.title"
                  label="Título"
                  placeholder="Ingrese el título"
                  :limit="100"
                  required
                />
              </div>

              <div class="detail-field">
                <PositiveNumberInput
                  v-model="form.runningTime"
                  label="Duración en minutos"
                  placeholder="Ej. 120"
                  required
                />
              </div>

              <div class="detail-field">
                <PositiveNumberInput
                  v-model="form.releaseYear"
                  label="Año de estreno"
                  placeholder="Ej. 2026"
                  required
                />
              </div>
            </div>
          </section>

          <section class="detail-group">
            <SimpleDropdown
              v-model="form.classificationId"
              label="Clasificación"
              placeholder="Seleccione una clasificación"
              :options="classifications"
              required
            />
          </section>


          <ReusableSearchDropdown
            class="detail-group"
            v-model="form.languageIds"
            label="Idiomas"
            placeholder="Buscar idiomas..."
            :options="languageOptions"
          />

          <fieldset class="detail-group option-fieldset">
            <legend>Géneros</legend>

            <div class="edit-options">
              <label
                v-for="genre in genres"
                :key="genre.id"
                class="edit-option"
              >
                <input
                  v-model="form.genreIds"
                  type="checkbox"
                  :value="genre.id"
                />
                {{ genre.name }}
              </label>
            </div>
          </fieldset>

          <section class="detail-group">
              <LimitedTextInput
              v-model="form.synopsis"
              label="Sinopsis"
              placeholder="Ingrese la sinopsis"
              :limit="1000"
              multiline
              :rows="5"
              required
            />
          </section>
        </fieldset>

        <p
          v-if="saveError"
          class="detail-feedback detail-error"
          role="alert"
        >
          {{ saveError }}
        </p>

        <footer class="detail-footer">
          <button
            type="button"
            class="detail-button"
            :disabled="saving"
            @click="close"
          >
            Cancelar
          </button>

          <button
            type="submit"
            class="detail-button save-button"
            :disabled="!canSave"
          >
            {{ saving ? 'Guardando…' : 'Guardar cambios' }}
          </button>
        </footer>
      </form>

      <footer v-if="!movie" class="detail-footer">
        <button type="button" class="detail-button" @click="close">
          Cerrar
        </button>
      </footer>
    </div>
  </BaseModal>
</template>

<style scoped>
/* Modal background */
:global(.app-modal-backdrop:has(.movie-detail-content)::backdrop) {
  background: var(--overlay-background);
}

/* Modal container */
:global(.app-modal-card:has(.movie-detail-content)) {
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

/* Modal title */
:global(.app-modal-card:has(.movie-detail-content) .app-modal-title) {
  flex-shrink: 0;
  margin: 0;
  padding: 24px 80px 24px 24px;
  background: var(--primary-color);
  color: var(--content-background);
  text-align: left;
  font-style: normal;
  font-size: 1.25rem;
}

/* Modal close button */
:global(.app-modal-card:has(.movie-detail-content) .app-modal-close) {
  top: 14px;
  right: 24px;
  color: var(--content-background);
  border-radius: var(--radius-small);
}

/* Main content */
.movie-detail-content {
  min-height: 0;
  padding: 24px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

/* Sections */
.detail-group {
  margin-bottom: 24px;
}

.detail-group h3,
.option-fieldset legend {
  margin: 0 0 16px;
  font-size: 1rem;
  font-weight: 700;
}

/* Form layout */
.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 20px;
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
  margin-top: 24px;
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

/* Mobile layout */
@media (max-width: 575px) {
  .movie-detail-content {
    padding: 20px 16px;
  }

  .detail-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .detail-footer .detail-button {
    flex: 1;
  }
}
</style>
