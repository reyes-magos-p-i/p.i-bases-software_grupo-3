<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { isAxiosError } from 'axios'
import MovieCrudView from './MovieCrudView.vue'

import CrudTable from '@/components/crudTable/CrudTable.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import {
  getMovies,
  getClassifications,
  getGenres,
  getLanguages,
} from '@/services/movie.service'
import type { MovieAll, MovieOption } from '@/types/movie'
import MovieCrudEdit from './MovieCrudEdit.vue'
import MovieCrudCreate from './MovieCrudCreate.vue'
import MovieCrudDelete from './MovieCrudDelete.vue'

const movies = ref<MovieAll[]>([])
const loading = ref(false)
const listError = ref('')
const movieToDelete = ref<MovieAll | null>(null)
const selectedMovieId = ref<number | null>(null)
const editingMovieId = ref<number | null>(null)
const creatingMovie = ref(false)

const classifications = ref<MovieOption[]>([])
const languages = ref<MovieOption[]>([])
const genres = ref<MovieOption[]>([])
const catalogsError = ref('')

let request: AbortController | undefined
let disposed = false

const emit = defineEmits<{
  'session-expired': []
  forbidden: []
}>()

function openCreate() {
  creatingMovie.value = true
}

function closeCreate() {
  creatingMovie.value = false
}

function openDelete(row: Record<string, unknown>) {
  if (typeof row.id !== 'number') return

  movieToDelete.value =
    movies.value.find(movie => movie.id === row.id) ?? null
}

function closeDelete() {
  movieToDelete.value = null
}

const columns = [
  { key: 'id', label: 'ID' },
  { key: 'title', label: 'Título' },
  { key: 'runningTime', label: 'Duración' },
  { key: 'releaseYear', label: 'Año' },
  { key: 'classification', label: 'Clasificación' },
]

const rows = computed(() =>
  movies.value.map((MovieAll) => ({
    ...MovieAll,
    runningTime: `${MovieAll.runningTime} min`,
    releaseYear: MovieAll.releaseYear ?? 'Sin registrar',
    classification: MovieAll.classification ?? 'Sin registrar',
  })),
)

export type UpdateMoviePayload = {
  title: string
  synopsis: string
  runningTime: number
  releaseYear: number
  classificationId: number
  languageIds: number[]
  genreIds: number[]
}

async function loadCatalogs() {
  catalogsError.value = ''

  try {
    const [classificationOptions, genreOptions, languageOptions] = await Promise.all([
      getClassifications(),
      getGenres(),
      getLanguages(),
    ])

    classifications.value = classificationOptions
    genres.value = genreOptions
    languages.value = languageOptions
  } catch {
    catalogsError.value = 'No se pudieron cargar las opciones de películas.'
  }
}

onMounted(() => {
  void loadCatalogs()
})

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

    listError.value = 'No se pudo cargar la lista de películas.'
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
  const id = Number(row.id)

  if (!Number.isInteger(id) || id <= 0) return

  editingMovieId.value = id
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
  <div class="movie-list-panel" :aria-busy="loading">
    <div class="section-heading">
        <h1>Peliculas</h1>
      <button type="button"
        @click="openCreate"
        class="add-user-button"
        >
         <i class="bi bi-plus-lg" aria-hidden="true"></i>
      Agregar película
      </button>
    </div>
    <LoadingState v-if="loading" message="Cargando películas…" />

    <div v-else-if="listError" role="alert">
      {{ listError }}

      <button type="button" @click="load">Reintentar</button>
    </div>

    <CrudTable
      v-else
      :columns="columns"
      :rows="rows"
      caption="Películas"
      @view="viewMovie"
      @edit="editMovie"
      @delete="openDelete"
    />

    <MovieCrudView :movie-id="selectedMovieId" @close="selectedMovieId = null" />

    <p v-if="catalogsError" role="alert">
      {{ catalogsError }}
    </p>

    <MovieCrudCreate
      v-if="creatingMovie"
      :classifications="classifications"
      :languages="languages"
      :genres="genres"
      @close="closeCreate"
      @saved="load"
      @session-expired="emit('session-expired')"
      @forbidden="emit('forbidden')"
    />

    <MovieCrudEdit
      :movie-id="editingMovieId"
      :classifications="classifications"
      :languages="languages"
      :genres="genres"
      @close="editingMovieId = null"
      @saved="load"
      @session-expired="emit('session-expired')"
      @forbidden="emit('forbidden')"
    />

    <MovieCrudDelete
      :movie="movieToDelete"
      @close="closeDelete"
      @deleted="load"
    />
  </div>
</template>

<style>
.movie-list-panel {
  display: grid;
  gap: 20px;
}
</style>
