<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { isAxiosError } from 'axios'

import BaseModal from '@/components/common/BaseModal.vue'
import { getMovie, updateMovie } from '@/services/movie.service'
import type { MovieDetail, MovieOption } from '@/types/movie'

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

const title = computed(() =>
  movie.value
    ? `Modificar ${movie.value.title}`
    : 'Modificar película',
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
  if (
    !form.title.trim() ||
    !form.synopsis.trim() ||
    !Number.isInteger(form.runningTime) ||
    Number(form.runningTime) <= 0 ||
    !Number.isInteger(form.releaseYear) ||
    Number(form.releaseYear) <= 0 ||
    form.classificationId === null
  ) {
    saveError.value = 'Completa los campos requeridos con valores válidos.'
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
        classificationId: form.classificationId,
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
                <label for="movie-title">Título</label>
                <input
                  id="movie-title"
                  v-model="form.title"
                  class="edit-input"
                  type="text"
                  required
                />
              </div>

              <div class="detail-field">
                <label for="movie-duration">Duración en minutos</label>
                <input
                  id="movie-duration"
                  v-model.number="form.runningTime"
                  class="edit-input"
                  type="number"
                  min="1"
                  step="1"
                  required
                />
              </div>

              <div class="detail-field">
                <label for="movie-year">Año de estreno</label>
                <input
                  id="movie-year"
                  v-model.number="form.releaseYear"
                  class="edit-input"
                  type="number"
                  min="1"
                  step="1"
                  required
                />
              </div>
            </div>
          </section>

          <section class="detail-group">
            <h3>Clasificación</h3>

            <label for="movie-classification">Clasificación</label>
            <select
              id="movie-classification"
              v-model="form.classificationId"
              class="edit-input"
              required
            >
              <option :value="null" disabled>
                Selecciona una clasificación
              </option>

              <option
                v-for="classification in classifications"
                :key="classification.id"
                :value="classification.id"
              >
                {{ classification.name }}
              </option>
            </select>
          </section>

          <fieldset class="detail-group option-fieldset">
            <legend>Idiomas</legend>

            <div class="edit-options">
              <label
                v-for="language in languages"
                :key="language.id"
                class="edit-option"
              >
                <input
                  v-model="form.languageIds"
                  type="checkbox"
                  :value="language.id"
                />
                {{ language.name }}
              </label>
            </div>
          </fieldset>

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
            <h3>Descripción</h3>

            <label for="movie-synopsis">Sinopsis</label>
            <textarea
              id="movie-synopsis"
              v-model="form.synopsis"
              class="edit-input"
              rows="5"
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
            :disabled="saving"
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
:global(.app-modal-backdrop:has(.movie-detail-content)::backdrop) {
  background: color-mix(in srgb, var(--page-background) 55%, transparent);
}

:global(.app-modal-card:has(.movie-detail-content)) {
  width: min(880px, 100%);
  max-width: 880px;
  padding: 0;
  border-radius: var(--radius-medium);
  background: var(--content-background);
  color: var(--text-primary);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

:global(.app-modal-card:has(.movie-detail-content) .app-modal-title) {
  flex-shrink: 0;
  margin: 0;
  padding: 24px 80px 24px 24px;
  background: var(--primary-color);
  color: var(--text-on-dark);
  text-align: left;
  font-style: normal;
  font-size: 1.25rem;
}

:global(.app-modal-card:has(.movie-detail-content) .app-modal-close) {
  top: 14px;
  right: 24px;
  color: var(--text-on-dark);
  border-radius: var(--radius-small);
}

.movie-detail-content {
  min-height: 0;
  padding: 24px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.detail-group {
  margin-bottom: 24px;
}

.detail-group h3 {
  margin: 0 0 16px;
  font-size: 1rem;
  font-weight: 700;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 20px;
  margin: 0;
}

.detail-field {
  min-width: 0;
}

dt {
  margin-bottom: 6px;
  font-weight: 500;
}

dd {
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.detail-feedback {
  padding: 16px;
  border-left: 3px solid var(--primary-color);
  background: var(--content-background);
  color: var(--text-primary);
}

.detail-error {
  border-color: var(--error-color);
  color: var(--error-color);
}

.detail-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 24px;
}

.detail-button {
  min-height: 44px;
  padding: 10px 20px;
  border: 1px solid var(--primary-color);
  border-radius: var(--radius-small);
  background: var(--content-background);
  color: var(--text-primary);
}

.detail-button:hover {
  background: var(--input-disabled-background);
  color: var(--text-primary);
}

@media (max-width: 575px) {
  .movie-detail-content {
    padding: 20px 16px;
  }

  .detail-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.edit-fieldset,
.option-fieldset {
  min-width: 0;
  padding: 0;
  border: 0;
}

.edit-fieldset {
  margin: 0;
}

.option-fieldset legend {
  margin-bottom: 16px;
  font-weight: 700;
}

.detail-field label,
.detail-group > label,
.field-label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
}

.detail-field p {
  margin: 0;
}

.edit-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid var(--primary-color);
  border-radius: var(--radius-small);
  background: var(--content-background);
  color: var(--text-primary);
  font: inherit;
}

textarea.edit-input {
  resize: vertical;
}

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

.detail-footer {
  gap: 12px;
}

.save-button {
  background: var(--primary-color);
  color: var(--text-on-dark);
}

.save-button:hover {
  background: var(--primary-color);
  filter: brightness(0.95);
}

.detail-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
