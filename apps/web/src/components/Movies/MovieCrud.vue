<script setup lang="ts">
import { onMounted, ref } from 'vue'
import CrudTable from '@/components/crudTable/CrudTable.vue'
import axios from 'axios'

interface Movie {
  MOVIE_ID: number
  TITLE: string
  RUNNING_TIME: number
  RELEASE_YEAR: number
  CLASSIFICATION_NAME: string
  LANGUAGE_NAME: string
  GENRE_NAME: string
}

const movies = ref<Movie[]>([])

const columns = [
  { key: 'MOVIE_ID', label: 'ID' },
  { key: 'TITLE', label: 'Título' },
  { key: 'RUNNING_TIME', label: 'Duración' },
  { key: 'RELEASE_YEAR', label: 'Año' },
  { key: 'CLASSIFICATION_NAME', label: 'Clasificación' },
  { key: 'LANGUAGE_NAME', label: 'Idioma' },
  { key: 'GENRE_NAME', label: 'Género' },
]

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

async function loadMovies() {
  try {
    const response = await axios.get<Movie[]>(`${API_URL}/movies`)

    movies.value = response.data
  } catch (error) {
    console.error('Error loading movies:', error)
  }
}

function editMovie(row: Record<string, unknown>) {
  console.log('Editar película:', row)
}

function viewMovie(row: Record<string, unknown>) {
  console.log('Ver película:', row)
}

function deleteMovie(row: Record<string, unknown>) {
  console.log('Eliminar película:', row)
}

onMounted(() => {
  loadMovies()
})
</script>

<template>
  <div>
    <h1>Películas</h1>

    <CrudTable
      :columns="columns"
      :rows="movies"
      caption="Películas"
      @edit="editMovie"
      @view="viewMovie"
      @delete="deleteMovie"
    />
  </div>
</template>
