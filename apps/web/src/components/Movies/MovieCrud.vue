<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { isAxiosError } from 'axios'
import MovieCrudView from './MovieCrudView.vue'

import CrudTable from '@/components/crudTable/CrudTable.vue'
import { deleteMovie, getMovies } from '@/services/movie.service'
import type { Movie } from '@/types/movie'

const movies = ref<Movie[]>([])
const loading = ref(false)
const listError = ref('')
const selectedMovieId = ref<number | null>(null)

let request: AbortController | undefined
let disposed = false

const columns = [
  { key: 'id', label: 'ID' },
  { key: 'title', label: 'Título' },
  { key: 'runningTime', label: 'Duración' },
  { key: 'releaseYear', label: 'Año' },
  { key: 'classification', label: 'Clasificación' },
]

const rows = computed(() =>
  movies.value.map((movie) => ({
    ...movie,
    runningTime: `${movie.runningTime} min`,
    releaseYear: movie.releaseYear ?? 'Sin registrar',
    classification: movie.classification ?? 'Sin registrar',
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

    console.log(data)

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
  console.log('View:', row)

  const id = Number(row.id)

  if (Number.isNaN(id)) return

  selectedMovieId.value = id
}

function editMovie(row: Record<string, unknown>) {
  console.log('Edit:', row)
}

async function removeMovie(row: Record<string, unknown>) {
  const id = Number(row.id)

  if (Number.isNaN(id)) return

  try {
    await deleteMovie(id)
    await load()
  } catch (error) {
    console.error('Error deleting movie:', error)
  }
}

function refresh() {
  void load()
}

onMounted(() => {
  void load()
})

onBeforeUnmount(() => {
  disposed = true
  request?.abort()
})

defineExpose({ refresh })
</script>

<template>
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
      @view="viewMovie"
      @edit="editMovie"
      @delete="removeMovie"
    />


    <MovieCrudView
      :movie-id="selectedMovieId"
      @close="selectedMovieId = null"
    />
  </div>
</template>

<style>
  .movie-list-panel {
    display: grid;
    gap: 20px;
  }




</style>
