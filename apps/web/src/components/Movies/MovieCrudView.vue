<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { isAxiosError } from 'axios'

import BaseModal from '@/components/common/BaseModal.vue'
import { getMovie } from '@/services/movie.service'
import type { MovieDetail, MovieOption } from '@/types/movie'

const props = defineProps<{
  movieId: number | null
}>()

const emit = defineEmits<{
  close: []
  'session-expired': []
  forbidden: []
}>()

const movie = ref<MovieDetail | null>(null)

const loading = ref(false)
const error = ref('')
const retryable = ref(false)

let request: AbortController | undefined

const title = computed(() =>
  movie.value
    ? `Detalle de ${movie.value.title}`
    : 'Detalle de película',
)

function text(value: unknown) {
  if (value === null || value === undefined) {
    return 'Sin registrar'
  }

  if (typeof value === 'string') {
    return value.trim() ? value : 'Sin registrar'
  }

  return String(value)
}

function optionName(value: MovieOption | null | undefined) {
  return value?.name?.trim()
    ? value.name
    : 'Sin registrar'
}

function optionList(values: MovieOption[] | null | undefined) {
  if (!values?.length) {
    return 'Sin registrar'
  }

  const names = values
    .map((value) => value.name)
    .filter((name) => name?.trim())

  return names.length > 0
    ? names.join(', ')
    : 'Sin registrar'
}

function duration(minutes: number | null | undefined) {
  if (minutes == null) return 'Sin registrar'

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  if (hours === 0) {
    return `${remainingMinutes} min`
  }

  return `${hours} h ${remainingMinutes} min`
}

const groups = computed(() => {
  const detail = movie.value

  if (!detail) return []

  return [
    {
      label: 'Información general',
      fields: [
        {
          label: 'ID',
          value: `MOV${detail.id}`,
        },
        {
          label: 'Título',
          value: detail.title,
        },
        {
          label: 'Duración',
          value: duration(detail.runningTime),
        },
        {
            label: 'Año de estreno',
            value: detail.releaseYear ?? 'Sin registrar',
        },
      ],
    },

    {
      label: 'Clasificación',
      fields: [
        {
          label: 'Clasificación',
          value: optionName(detail.classification),
        },
        {
          label: 'Idioma',
          value: optionList(detail.languages),
        },
      ],
    },

    {
      label: 'Géneros',
      fields: [
        {
          label: 'Géneros',
          value: optionList(detail.genres),
        },
      ],
    },

    {
      label: 'Descripción',
      fields: [
        {
          label: 'Sinopsis',
          value: text(detail.synopsis),
        },
      ],
    },
  ]
})

async function load() {
  request?.abort()

  movie.value = null
  error.value = ''
  retryable.value = false

  const movieId = props.movieId

  if (movieId === null) {
    loading.value = false
    return
  }

  const current = new AbortController()

  request = current
  loading.value = true

  try {
    const detail = await getMovie(
      movieId,
      current.signal,
    )
    //debug stuff
    console.log('MOVIE DETAIL:', detail)
    console.log('MOVIE DETAIL:', detail)
    console.log('CLASSIFICATION:', detail.classification)
    if (!current.signal.aborted) {
      movie.value = detail
    }
  } catch (failure) {
    if (current.signal.aborted) return

    const status = isAxiosError(failure)
      ? failure.response?.status
      : undefined

    if (status === 401) {
      error.value =
        'La sesión ha expirado. Inicia sesión nuevamente.'

      emit('session-expired')
    } else if (status === 403) {
      error.value =
        'No tienes permiso para ver esta película.'

      emit('forbidden')
    } else if (status === 404) {
      error.value =
        'La película seleccionada ya no existe.'
    } else {
      error.value =
        'No se pudo mostrar la película. Comprueba la conexión y vuelve a intentarlo.'

      retryable.value = true
    }
  } finally {
    if (request === current) {
      loading.value = false
      request = undefined
    }
  }
}

function close() {
  request?.abort()
  movie.value = null

  emit('close')
}

watch(
  () => props.movieId,
  () => {
    void load()
  },
  { immediate: true },
)

onBeforeUnmount(() => request?.abort())
</script>

<template>
  <BaseModal
    :open="movieId !== null"
    :title="title"
    @close="close"
  >
    <div
      class="movie-detail-content"
      :aria-busy="loading"
    >
      <p
        v-if="loading"
        class="detail-feedback"
        role="status"
      >
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

      <template v-else-if="movie">
        <section
          v-for="group in groups"
          :key="group.label"
          class="detail-group"
          :aria-label="group.label"
        >
          <h3>{{ group.label }}</h3>

          <dl class="detail-grid">
            <div
              v-for="field in group.fields"
              :key="field.label"
              class="detail-field"
            >
              <dt>{{ field.label }}</dt>
              <dd>{{ field.value }}</dd>
            </div>
          </dl>
        </section>
      </template>

      <footer class="detail-footer">
        <button
          type="button"
          class="detail-button"
          @click="close"
        >
          Cerrar
        </button>
      </footer>
    </div>
  </BaseModal>
</template>

<style scoped>
:global(.app-modal-backdrop:has(.movie-detail-content)::backdrop) {
  background: color-mix(
    in srgb,
    var(--color-black) 55%,
    transparent
  );
}

:global(.app-modal-card:has(.movie-detail-content)) {
  width: min(880px, 100%);
  max-width: 880px;
  padding: 0;
  border-radius: var(--radius-medium);
  background: var(--color-background);
  color: var(--color-dark);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

:global(.app-modal-card:has(.movie-detail-content) .app-modal-title) {
  flex-shrink: 0;
  margin: 0;
  padding: 24px 80px 24px 24px;
  background: var(--color-primary);
  color: var(--color-white);
  text-align: left;
  font-style: normal;
  font-size: 1.25rem;
}

:global(.app-modal-card:has(.movie-detail-content) .app-modal-close) {
  top: 14px;
  right: 24px;
  color: var(--color-white);
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
  border-left: 3px solid var(--color-primary);
  background: var(--color-white);
}

.detail-error {
  border-color: var(--color-error);
  color: var(--color-error);
}

.detail-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 24px;
}

.detail-button {
  min-height: 44px;
  padding: 10px 20px;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-small);
  background: var(--color-white);
  color: var(--color-primary);
}

.detail-button:hover {
  background: var(--color-light_gray);
}

@media (max-width: 575px) {
  .movie-detail-content {
    padding: 20px 16px;
  }

  .detail-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
```
