<script setup lang="ts">
import { computed } from 'vue'
import MoviePoster from '@/components/common/MoviePoster.vue'
import type { PortalSection, PortalSectionMovie } from '@/types/portal'
import { formatRunningTime, formatShortDate } from '@/utils/portal-format'

// SCRUM-437: a movie card of the portal (prototype, option A).
// Cartelera and Preventas sell tickets; Estrenos only announces the release date.
const props = defineProps<{ movie: PortalSectionMovie; section: PortalSection }>()

const runningTime = computed(() => formatRunningTime(props.movie.runningTime))
const releaseDate = computed(() => formatShortDate(props.movie.releaseDate))
const presaleStart = computed(() => formatShortDate(props.movie.presaleStart))
</script>

<template>
  <article class="movie-card">
    <div class="poster">
      <MoviePoster :poster-image="movie.posterImage" :title="movie.title" class="poster-image" />
      <span v-if="section === 'preventas'" class="badge-presale">Preventa</span>
    </div>

    <h3 class="card-title">{{ movie.title }}</h3>
    <p class="card-meta">
      <span v-if="movie.classification" class="classification">{{ movie.classification }}</span>
      <span v-if="runningTime">{{ runningTime }}</span>
    </p>
    <p v-if="movie.genres.length" class="card-genres">{{ movie.genres.join(' · ') }}</p>

    <template v-if="section === 'estrenos'">
      <p class="release-box">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        <span>Estreno · {{ releaseDate }}</span>
      </p>
      <p v-if="presaleStart" class="card-note">Preventa desde el {{ presaleStart }}</p>
    </template>
    <template v-else>
      <p v-if="section === 'preventas' && releaseDate" class="card-note">
        Estreno el {{ releaseDate }}
      </p>
      <router-link
        :to="{ name: 'buy-tickets', query: { movieId: movie.id } }"
        class="buy-button"
        :aria-label="`Comprar boletos para ${movie.title}`"
      >
        Comprar boletos
      </router-link>
    </template>
  </article>
</template>

<style scoped>
.movie-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 10px;
  scroll-snap-align: start;
  color: var(--text-on-dark);
}

.poster {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  transition:
    transform var(--transition-normal),
    box-shadow var(--transition-normal);
}

.movie-card:hover .poster,
.movie-card:focus-within .poster {
  transform: translateY(-4px);
  box-shadow: 0 18px 36px rgb(0 0 0 / 55%);
}

.poster-image {
  border-radius: 12px;
}

.badge-presale {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 1;
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--primary-color);
  color: var(--text-on-dark);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.card-title {
  display: -webkit-box;
  overflow: hidden;
  margin: 2px 0 0;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.3;
}

.card-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--text-on-dark-secondary);
  font-size: 0.8125rem;
}

.classification {
  display: inline-grid;
  min-width: 40px;
  height: 24px;
  place-items: center;
  padding: 0 6px;
  border: 1px solid color-mix(in srgb, var(--text-on-dark) 55%, transparent);
  border-radius: 4px;
  color: var(--text-on-dark);
  font-size: 0.75rem;
  font-weight: 700;
}

.card-genres,
.card-note {
  margin: 0;
  color: var(--text-on-dark-secondary);
  font-size: 0.8125rem;
}

.buy-button {
  display: inline-flex;
  width: 100%;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  margin-top: 4px;
  padding: 0 18px;
  border-radius: 8px;
  background: var(--accent-color);
  color: var(--page-background);
  font-size: 0.9375rem;
  font-weight: 700;
  text-decoration: none;
  transition: filter var(--transition-normal);
}

.buy-button:hover {
  color: var(--page-background);
  filter: brightness(1.08);
}

.buy-button:focus-visible {
  outline: 3px solid var(--focus-on-dark);
  outline-offset: 3px;
}

.release-box {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 10px;
  margin: 4px 0 0;
  padding: 0 12px;
  border: 1px solid var(--primary-color);
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 700;
}

.release-box svg {
  flex: none;
  color: var(--accent-color);
}

@media (prefers-reduced-motion: reduce) {
  .poster,
  .buy-button {
    transition: none;
  }
}
</style>
