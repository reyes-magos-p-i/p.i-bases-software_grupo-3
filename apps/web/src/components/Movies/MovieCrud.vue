<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { isAxiosError } from 'axios'

import CrudTable from '@/components/crudTable/CrudTable.vue'
import { deleteMovie, getMovies } from '@/services/movie.service'
import type { Movie } from '@/types/movie'

const movies = ref<Movie[]>([])
const loading = ref(false)
const listError = ref('')

let request: AbortController | undefined
let disposed = false

const columns = [
  { key: 'MOVIE_ID', label: 'ID' },
  { key: 'TITLE', label: 'Título' },
  { key: 'RUNNING_TIME', label: 'Duración' },
  { key: 'RELEASE_YEAR', label: 'Año' },
  { key: 'CLASSIFICATION_NAME', label: 'Clasificación' },
  { key: 'LANGUAGE_NAME', label: 'Idioma' },
  { key: 'GENRE_NAME', label: 'Género' },
]

const rows = computed(() =>
  movies.value.map((movie) => ({
    ...movie,

    RUNNING_TIME: `${movie.RUNNING_TIME} min`,
  })),
)

async function load() {
  request?.abort()

  const currentRequest = new AbortController()
  request = currentRequest

  loading.value = true
  listError.value = ''

  try {
    const data = await getMovies(currentRequest.signal)

    if (currentRequest.signal.aborted || disposed) return

    movies.value = data
  } catch (error) {
    if (currentRequest.signal.aborted || disposed) return

    if (isAxiosError(error)) {
      console.error(error.response?.data)
    }

    listError.value =
      'No se pudo cargar la lista de películas.'
  } finally {
    if (request === currentRequest) {
      loading.value = false
      request = undefined
    }
  }
}

function viewMovie(row: Record<string, unknown>) {
  if (typeof row.MOVIE_ID !== 'number') return

  console.log('View movie:', row.MOVIE_ID)

  // Later:
  // selectedMovieId.value = row.MOVIE_ID
}

function editMovie(row: Record<string, unknown>) {
  if (typeof row.MOVIE_ID !== 'number') return

  console.log('Edit movie:', row.MOVIE_ID)

  // Later:
  // editedMovieId.value = row.MOVIE_ID
}

async function removeMovie(row: Record<string, unknown>) {
  if (typeof row.MOVIE_ID !== 'number') return

  try {
    await deleteMovie(row.MOVIE_ID)

    await load()
  } catch (error) {
    console.error('Error deleting movie:', error)
  }
}

function refresh() {
  void load()
}

watch(
  () => true,
  () => {
    void load()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  disposed = true
  request?.abort()
})

defineExpose({ refresh })
</script>

<template>
   <div style="display: block; padding: 20px; background: yellow; color: black;">
    MOVIE CRUD IS RENDERING
  </div>
  <div class="movie-list-panel">
    <p v-if="loading" role="status">
      Cargando películas…
    </p>

    <div v-else-if="listError" role="alert">
      {{ listError }}

      <button type="button" @click="load">
        Reintentar
      </button>
    </div>

    <CrudTable
      v-else
      :columns="columns"
      :rows="rows"
      caption="Películas"
    >
      <template #actions="{ row }">
        <div class="movie-actions">
          <button
            type="button"
            aria-label="Ver"
            @click="viewMovie(row)"
          >
            <i class="bi bi-eye" aria-hidden="true"></i>
          </button>

          <button
            type="button"
            aria-label="Modificar"
            @click="editMovie(row)"
          >
            <i
              class="bi bi-pencil-square"
              aria-hidden="true"
            ></i>
          </button>

          <button
            type="button"
            aria-label="Eliminar"
            @click="removeMovie(row)"
          >
            <i class="bi bi-trash" aria-hidden="true"></i>
          </button>
        </div>
      </template>
    </CrudTable>
  </div>
</template>
