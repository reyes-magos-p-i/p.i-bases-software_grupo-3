<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import type { Movie } from '@/types/movie'
import { getMovieFunctions, stripTrailingSlashes } from '@/services/movieFunctions'
import placeholderImage from '../../assets/images/placeholder.svg'
const imagesBaseUrl = `${stripTrailingSlashes(String(import.meta.env.VITE_API_BASE_URL ?? ''))}/image`
const search = ref('')
const movies = ref<Movie[]>([])
const isLoading = ref(true)
const errorMessage = ref('')

function handleImageError(event: Event): void {
  const img = event.target as HTMLImageElement

  if (img.src === placeholderImage) return

  img.src = placeholderImage
}

const filteredMovies = computed(() => {
  const normalizedSearch = search.value.trim().toLocaleLowerCase()

  if (!normalizedSearch) {
    return movies.value
  }

  return movies.value.filter((movie) => movie.title.toLocaleLowerCase().includes(normalizedSearch))
})

async function loadMovies(): Promise<void> {
  try {
    movies.value = await getMovieFunctions()
  } catch {
    errorMessage.value = 'No fue posible cargar las películas.'
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadMovies()
})
</script>

<template>
  <section class="movie-catalog">
    <div class="search-container">
      <label for="movie-search" class="visually-hidden"> Buscar película </label>

      <input
        id="movie-search"
        v-model="search"
        type="search"
        placeholder="Busca tu película favorita..."
      />

      <i class="bi bi-search" aria-hidden="true"></i>
    </div>

    <p v-if="isLoading" class="status-message">Cargando películas...</p>

    <p v-else-if="errorMessage" class="status-message error-message">
      {{ errorMessage }}
    </p>

    <div v-else-if="filteredMovies.length" class="movie-grid">
      <article v-for="movie in filteredMovies" :key="movie.title" class="movie-card">
        <img
          :src="`${imagesBaseUrl}/${movie.posterImage}`"
          :alt="movie.title"
          class="movie-poster"
          @error="handleImageError"
        />

        <h3>
          {{ movie.title }}
        </h3>
      </article>
    </div>

    <p v-else class="status-message">No encontramos películas que coincidan con tu búsqueda.</p>
  </section>
</template>

<style scoped>
.movie-catalog {
  margin-top: 32px;
}

.search-container {
  position: relative;

  width: min(100%, 900px);

  margin: 0 auto 28px;
}

.search-container input {
  width: 100%;

  padding: 12px 46px 12px 20px;

  border: 1px solid transparent;
  border-radius: 999px;

  background-color: var(--input-background);

  outline: none;

  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
  color: var(--text-primary);
}

.search-container input:focus {
  border-color: var(--focus-color);

  box-shadow: 0 0 0 3px var(--focus-shadow);
}

.search-container i {
  position: absolute;

  top: 50%;
  right: 18px;

  font-size: 1.2rem;

  transform: translateY(-50%);
  color: var(--text-secondary);
}

.movie-grid {
  display: grid;

  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));

  gap: 28px 24px;
}

.movie-card {
  overflow: hidden;

  border-radius: var(--radius-medium);

  background-color: var(--content-background);

  transition:
    transform var(--transition-normal),
    box-shadow var(--transition-normal);
  color: var(--text-primary);
}

.movie-card:hover {
  transform: translateY(-4px);

  box-shadow: 0 10px 24px var(--shadow-color);
}

.movie-poster {
  display: block;

  width: 100%;
  aspect-ratio: 2 / 3;

  object-fit: cover;
}

.movie-card h3 {
  margin: 12px;

  font-size: 1rem;
  font-weight: 500;

  text-align: center;
}

.status-message {
  margin: 48px 0;

  color: var(--text-on-dark-secondary);

  text-align: center;
}

.error-message {
  color: var(--error-color);
  background-color: var(--content-background);
}
</style>
