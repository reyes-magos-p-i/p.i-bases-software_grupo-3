<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import PortalMovieCard from './PortalMovieCard.vue'
import type { PortalSection, PortalSectionMovie, RecommendedMovie } from '@/types/portal'

type SectionMovie = PortalSectionMovie & Partial<Pick<RecommendedMovie, 'section' | 'matchedGenre'>>

// SCRUM-437: one section of the portal with its own loading, empty and error states.
// SCRUM-439: "recomendaciones" mixes Cartelera and Preventas movies, so each card uses its own.
const props = defineProps<{
  section: PortalSection | 'recomendaciones'
  title: string
  subtitle: string
  emptyMessage: string
  errorMessage: string
  movies: readonly SectionMovie[]
  loading: boolean
  failed: boolean
}>()
const emit = defineEmits<{ retry: [] }>()
// tools: replaces "Ver todas"; empty: an action under the empty message.
const slots = defineSlots<{ tools?: () => unknown; empty?: () => unknown }>()

const cardSection = (movie: SectionMovie): PortalSection =>
  movie.section ?? (props.section === 'recomendaciones' ? 'cartelera' : props.section)

const expanded = ref(false)
const row = useTemplateRef<HTMLElement>('row')

function scrollRow(direction: 1 | -1) {
  const element = row.value
  if (!element) return
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  element.scrollBy({
    left: direction * element.clientWidth * 0.9,
    behavior: reduceMotion ? 'auto' : 'smooth',
  })
}
</script>

<template>
  <section
    :id="props.section"
    class="portal-section"
    :aria-labelledby="`${props.section}-title`"
    :aria-busy="props.loading"
  >
    <div class="landing-container">
      <div class="section-head">
        <div>
          <h2 :id="`${props.section}-title`" class="section-title">{{ props.title }}</h2>
          <p class="section-subtitle">{{ props.subtitle }}</p>
        </div>
        <div v-if="!props.loading && !props.failed && props.movies.length" class="section-tools">
          <slot name="tools" />
          <button
            v-if="!slots.tools"
            type="button"
            class="see-all"
            :aria-expanded="expanded"
            :aria-controls="`${props.section}-movies`"
            @click="expanded = !expanded"
          >
            {{ expanded ? 'Ver menos' : `Ver todas (${props.movies.length})` }}
          </button>
          <template v-if="!expanded">
            <button
              type="button"
              class="circle-button"
              :aria-label="`Ver películas anteriores de ${props.title}`"
              @click="scrollRow(-1)"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M15 18l-6-6 6-6"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              class="circle-button"
              :aria-label="`Ver más películas de ${props.title}`"
              @click="scrollRow(1)"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M9 18l6-6-6-6"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </template>
        </div>
      </div>

      <ul v-if="props.loading" class="movie-row" aria-label="Cargando películas">
        <li v-for="index in 5" :key="index" class="skeleton-card" aria-hidden="true">
          <span class="skeleton skeleton-poster"></span>
          <span class="skeleton skeleton-line"></span>
          <span class="skeleton skeleton-line short"></span>
        </li>
      </ul>

      <div v-else-if="props.failed" class="section-state error-state" role="alert">
        <span class="state-icon" aria-hidden="true">!</span>
        <p class="state-text">
          <strong>{{ props.errorMessage }}</strong>
          <span>Revisa tu conexión e inténtalo de nuevo.</span>
        </p>
        <button type="button" class="retry-button" @click="emit('retry')">Reintentar</button>
      </div>

      <div v-else-if="!props.movies.length" class="section-state" role="status">
        <span class="state-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2" />
            <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" stroke-width="2" />
          </svg>
        </span>
        <p class="state-text">
          <strong>{{ props.emptyMessage }}</strong>
        </p>
        <slot name="empty" />
      </div>

      <ul
        v-else
        :id="`${props.section}-movies`"
        ref="row"
        class="movie-row"
        :class="{ expanded }"
      >
        <li v-for="movie in props.movies" :key="movie.id">
          <PortalMovieCard :movie="movie" :section="cardSection(movie)" />
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.portal-section {
  padding: 64px 0 0;
  scroll-margin-top: 24px;
  color: var(--text-on-dark);
}

.section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
}

.section-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 3.25rem;
  font-weight: 400;
  letter-spacing: 0.02em;
  line-height: 1;
}

.section-subtitle {
  margin: 6px 0 0;
  color: var(--text-on-dark-secondary);
  font-size: 0.9375rem;
}

.section-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}

.see-all {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  padding: 0 8px;
  border: 0;
  background: none;
  color: var(--text-on-dark);
  cursor: pointer;
  font: inherit;
  font-size: 0.9375rem;
  font-weight: 700;
  text-decoration: underline;
  text-decoration-color: var(--primary-color);
  text-decoration-thickness: 2px;
  text-underline-offset: 6px;
}

.see-all:hover {
  color: var(--accent-color);
}

/* Links passed in the tools and empty slots look like the section's own actions. */
.section-tools :slotted(.see-all) {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  padding: 0 8px;
  color: var(--text-on-dark);
  font-size: 0.9375rem;
  font-weight: 700;
  text-decoration: underline;
  text-decoration-color: var(--primary-color);
  text-decoration-thickness: 2px;
  text-underline-offset: 6px;
}

.section-tools :slotted(.see-all:hover) {
  color: var(--accent-color);
}

.section-state :slotted(.retry-button) {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  padding: 0 20px;
  border-radius: 8px;
  background: var(--primary-color);
  color: var(--text-on-dark);
  font-size: 0.9375rem;
  font-weight: 700;
  text-decoration: none;
}

.section-tools :slotted(.see-all:focus-visible),
.section-state :slotted(.retry-button:focus-visible) {
  outline: 3px solid var(--focus-on-dark);
  outline-offset: 3px;
}

.circle-button {
  display: grid;
  width: 44px;
  height: 44px;
  flex: none;
  place-items: center;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--text-on-dark) 28%, transparent);
  border-radius: 50%;
  background: color-mix(in srgb, var(--surface-background) 85%, transparent);
  color: var(--text-on-dark);
  cursor: pointer;
}

.circle-button:hover {
  border-color: var(--text-on-dark);
}

.see-all:focus-visible,
.circle-button:focus-visible,
.retry-button:focus-visible {
  outline: 3px solid var(--focus-on-dark);
  outline-offset: 3px;
}

/* The cards are sized from the row width so a whole number of them fits. A fixed 224px column
   made 5 cards (1200px) wider than the 1180px container and clipped the right border of the
   last visible card. The 4px padding keeps room for focus outlines; scroll-padding keeps it
   after snapping. */
.movie-row {
  --cards-per-view: 5;
  --row-gap: 20px;

  display: grid;
  grid-auto-columns: calc(
    (100% - (var(--cards-per-view) - 1) * var(--row-gap)) / var(--cards-per-view)
  );
  grid-auto-flow: column;
  gap: var(--row-gap);
  margin: 0 -4px;
  padding: 6px 4px 16px;
  overflow-x: auto;
  list-style: none;
  scroll-padding-inline: 4px;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
}

@media (width <= 1024px) {
  .movie-row {
    --cards-per-view: 4;
  }
}

@media (width <= 820px) {
  .movie-row {
    --cards-per-view: 3;
  }
}

.movie-row::-webkit-scrollbar {
  display: none;
}

.movie-row.expanded {
  grid-auto-flow: row;
  grid-template-columns: repeat(auto-fill, minmax(min(200px, 100%), 1fr));
  overflow: visible;
}

.section-state {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px 24px;
  padding: 28px;
  border: 1px solid color-mix(in srgb, var(--text-on-dark) 10%, transparent);
  border-radius: 14px;
  background: var(--surface-background);
}

.error-state {
  border-color: color-mix(in srgb, var(--accent-color) 45%, transparent);
}

.state-icon {
  display: grid;
  width: 52px;
  height: 52px;
  flex: none;
  place-items: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--primary-color) 28%, transparent);
  color: var(--text-on-dark);
  font-size: 1.5rem;
  font-weight: 700;
}

.error-state .state-icon {
  background: color-mix(in srgb, var(--accent-color) 14%, transparent);
  color: var(--accent-color);
}

.state-text {
  min-width: 0;
  flex: 1 1 280px;
  margin: 0;
}

.state-text strong {
  display: block;
  font-size: 1.125rem;
}

.state-text span {
  display: block;
  margin-top: 4px;
  color: var(--text-on-dark-secondary);
  font-size: 0.9375rem;
  line-height: 1.5;
}

.retry-button {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  padding: 0 20px;
  border: 0;
  border-radius: 8px;
  background: var(--primary-color);
  color: var(--text-on-dark);
  cursor: pointer;
  font: inherit;
  font-size: 0.9375rem;
  font-weight: 700;
}

.retry-button:hover {
  filter: brightness(1.12);
}

.skeleton-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.skeleton {
  display: block;
  border-radius: 6px;
  background: linear-gradient(
    100deg,
    var(--surface-background) 30%,
    color-mix(in srgb, var(--surface-background) 85%, var(--text-on-dark)) 50%,
    var(--surface-background) 70%
  );
  background-size: 300% 100%;
  animation: shimmer 1.4s linear infinite;
}

.skeleton-poster {
  aspect-ratio: 2 / 3;
  border-radius: 12px;
}

.skeleton-line {
  height: 14px;
}

.skeleton-line.short {
  width: 60%;
}

@keyframes shimmer {
  from {
    background-position: 100% 0;
  }

  to {
    background-position: 0 0;
  }
}

@media (width <= 640px) {
  .portal-section {
    padding-top: 48px;
  }

  .section-title {
    font-size: 2.375rem;
  }

  .movie-row {
    grid-auto-columns: calc((100% - 28px) / 2.3);
    gap: 14px;
  }

  .circle-button {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none;
  }
}
</style>
