<script setup lang="ts">
import { onMounted, ref } from 'vue'

import type { Movie } from '@/types/movie'
import { getMovieFunctions, stripTrailingSlashes } from '@/services/movieFunctions'
import placeholderImage from '../../assets/images/placeholder.svg'
const imagesBaseUrl = `${stripTrailingSlashes(String(import.meta.env.VITE_API_BASE_URL ?? ''))}/image`
const movies = ref<Movie[]>([])
const isLoading = ref(true)
const errorMessage = ref('')

function handleImageError(event: Event): void {
  const img = event.target as HTMLImageElement

  if (img.src === placeholderImage) return

  img.src = placeholderImage
}

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
    <div class="landing-container">
      <p v-if="isLoading" class="status-message">Cargando películas...</p>

      <p v-else-if="errorMessage" class="status-message error-message">
        {{ errorMessage }}
      </p>

      <div v-else-if="movies.length" class="movie-grid">
        <article v-for="movie in movies" :key="movie.title" class="movie-card">
          <img
            :src="`${imagesBaseUrl}/${movie.posterImage}`"
            :alt="movie.title"
            class="movie-poster"
            @error="handleImageError"
          />

          <div class="movie-overlay">
            <h3 class="movie-title">
              {{ movie.title }}
            </h3>

            <button type="button" class="buy-button">Comprar boletos</button>
          </div>
        </article>
      </div>

      <p v-else class="status-message">No hay películas disponibles.</p>
    </div>
  </section>
</template>

<style scoped>
.movie-catalog {
  margin: 32px 0 24px;
  padding: 32px 0;

  background-color: #808080;
}

.movie-grid {
  display: grid;

  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));

  gap: 28px 24px;
}

.movie-card {
  position: relative;

  overflow: hidden;

  border-radius: var(--radius-medium);

  background-color: var(--content-background);

  transition:
    transform var(--transition-normal),
    box-shadow var(--transition-normal);
  color: var(--text-primary);
}

.movie-card::after {
  position: absolute;

  inset: 0;

  border-radius: inherit;

  background-color: rgb(0 0 0 / 65%);

  opacity: 0;

  transition: opacity var(--transition-normal);

  content: '';
  pointer-events: none;
}

.movie-card:hover::after {
  opacity: 1;
}

.movie-overlay {
  position: absolute;
  z-index: 1;

  display: flex;
  flex-direction: column;

  align-items: center;
  justify-content: center;

  inset: 0;

  gap: 16px;

  padding: 16px;

  opacity: 0;

  transition: opacity var(--transition-normal);
  pointer-events: none;
}

.movie-card:hover .movie-overlay,
.movie-card:focus-within .movie-overlay {
  opacity: 1;

  pointer-events: auto;
}

.movie-title {
  margin: 0;

  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.2;

  text-align: center;
  text-shadow: 0 2px 6px rgb(0 0 0 / 80%);
  color: #fff;
}

.buy-button {
  position: absolute;
  bottom: 16px;

  padding: 4px 96px;

  border: 0;
  border-radius: 6px;

  font-weight: 700;

  cursor: pointer;
  color: #1a1a1a;
  background-color: #ffd60a;

  transition: background-color var(--transition-fast);
}

.buy-button:hover {
  background-color: #ffe14d;
}

.movie-poster {
  display: block;

  width: 100%;
  aspect-ratio: 2 / 3;

  object-fit: cover;
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
