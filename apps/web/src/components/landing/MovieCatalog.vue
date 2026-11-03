<script setup lang="ts">
import type { PortalMovie } from '@/types/movie'
import MoviePoster from '@/components/common/MoviePoster.vue'
import LoadingState from '@/components/common/LoadingState.vue'

defineProps<{ movies: readonly PortalMovie[]; loading?: boolean; error?: string }>()
const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <section id="cartelera" class="movie-catalog" aria-label="Cartelera">
    <div class="landing-container">
      <LoadingState v-if="loading" message="Cargando películas..." surface="dark" />

      <div v-else-if="error" class="status-message error-message" role="alert">
        <p>{{ error }}</p>
        <button type="button" class="retry-button" @click="emit('retry')">Reintentar</button>
      </div>

      <div v-else-if="movies.length" class="movie-grid">
        <article v-for="movie in movies" :key="movie.id" class="movie-card">
          <MoviePoster
            :poster-image="movie.posterImage"
            :title="movie.title"
            class="movie-poster"
          />

          <div class="movie-overlay">
            <h3 class="movie-title">
              {{ movie.title }}
            </h3>

            <router-link
              :to="{ name: 'buy-tickets', query: { movieId: movie.id } }"
              class="buy-button"
              >Comprar boletos</router-link
            >
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

  background-color: var(--page-background);
}

.movie-grid {
  display: grid;

  grid-template-columns: repeat(auto-fill, minmax(min(340px, 100%), 1fr));

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

  background-color: var(--overlay-background);

  opacity: 0;

  transition: opacity var(--transition-normal);

  content: '';
  pointer-events: none;
}

.movie-card:hover::after,
.movie-card:focus-within::after {
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
  text-shadow: 0 2px 6px var(--shadow-strong-color);
  color: var(--text-on-dark);
}

.buy-button {
  position: absolute;
  bottom: 16px;

  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  width: calc(100% - 32px);
  padding: 10px 16px;

  border: 0;
  border-radius: 6px;

  font-weight: 700;

  text-decoration: none;

  cursor: pointer;
  color: var(--button-text);
  background-color: var(--button-background);

  transition: background-color var(--transition-fast);
}

@media (hover: none) {
  .movie-overlay {
    opacity: 1;
    pointer-events: auto;
    background: linear-gradient(transparent, var(--hero-overlay-start));
    justify-content: flex-end;
    padding-bottom: 76px;
  }
}

.buy-button:hover {
  background-color: var(--button-hover-background);
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
.retry-button {
  min-height: 44px;
  padding: 0.6rem 1rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-small);
  background: var(--button-background);
  color: var(--button-text);
}
</style>
